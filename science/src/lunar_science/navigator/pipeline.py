"""End-to-end precomputation pipeline for Lunar Landing Site Navigator."""

from __future__ import annotations

import csv
import importlib.resources
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import jsonschema
import numpy as np

from .comms import (
    ELFO_CONSTELLATION_PRESET,
    ELFO_PATHFINDER_PRESET,
    LRO_PRESET,
    analyze_site_comms,
)
from .data_sources import (
    AU_IN_KM,
    DEFAULT_SOUTH_POLE_SITES,
    EARTH_RADIUS_KM,
    LOLA_DEM_ASSETS,
    LUNAR_REFERENCE_RADIUS_M,
    NAIF_KERNELS,
    SOLAR_CONSTANT_1AU_W_M2,
    SOLAR_RADIUS_KM,
    SYNODIC_PERIOD_DAYS,
    CandidateSiteSpec,
    ensure_assets,
)
from .dem_horizon import (
    LolaSouthPoleDem,
    max_solar_elevation_curve,
    selenographic_to_cartesian_me,
)
from .ephemeris import (
    SpiceLunarEphemeris,
    build_utc_grid,
    validate_ephemeris_against_horizons,
)
from .solar import analyze_site_solar
from .scoring import compute_composite_landing_score


def load_navigator_schema() -> dict[str, Any]:
    """Load the bundled navigator-dataset.v1 JSON schema."""
    schema_text = (
        importlib.resources.files("lunar_science")
        .joinpath("schemas/navigator-dataset.v1.schema.json")
        .read_text(encoding="utf-8")
    )
    return json.loads(schema_text)


def validate_dataset_schema(dataset: dict[str, Any]) -> None:
    """Validate dataset strictly against navigator-dataset.v1.schema.json."""
    schema = load_navigator_schema()
    jsonschema.validate(instance=dataset, schema=schema)


def _normalize_lon_0_360(lon_deg: float) -> float:
    wrapped = lon_deg % 360.0
    if wrapped >= 360.0 or wrapped < 0.0:
        wrapped = 0.0
    return wrapped


def _compute_site_local_psr_mask(
    dem: LolaSouthPoleDem,
    center_lat_deg: float,
    center_lon_east_deg: float,
    search_radius_m: float = 5200.0,
    lattice_step_m: float = 500.0,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Compute physical PSR boolean points inside a neighborhood patch using coarse 120km horizons."""
    cx, cy = dem.latlon_to_xy_m(center_lat_deg, center_lon_east_deg)
    offsets = np.arange(-search_radius_m, search_radius_m + 1e-6, lattice_step_m)
    az_coarse = np.arange(0.0, 360.0, 5.0, dtype=np.float64)

    psr_x: list[float] = []
    psr_y: list[float] = []
    for dy in offsets:
        for dx in offsets:
            if dx * dx + dy * dy > search_radius_m * search_radius_m:
                continue
            px, py = cx + float(dx), cy + float(dy)
            plat, plon = dem.xy_m_to_latlon(px, py)
            solar_max = max_solar_elevation_curve(plat, az_coarse)
            _, horiz = dem.compute_horizon_profile(
                plat,
                plon,
                observer_height_m=0.5,
                max_distance_m=120_000.0,
                step_m=dem.meta.map_scale_m * 4.0,
                az_step_deg=5.0,
            )
            if bool(np.all(horiz >= solar_max)):
                psr_x.append(px)
                psr_y.append(py)
    return (
        np.asarray(psr_x, dtype=np.float64),
        np.asarray(psr_y, dtype=np.float64),
        offsets,
    )


def _distance_to_psr_patch_m(
    x_m: float,
    y_m: float,
    is_psr_flag: bool,
    psr_x: np.ndarray,
    psr_y: np.ndarray,
    fallback_max_m: float = 5200.0,
) -> float:
    if is_psr_flag:
        return 0.0
    if len(psr_x) == 0:
        return fallback_max_m
    d2 = (psr_x - x_m) ** 2 + (psr_y - y_m) ** 2
    return float(math.sqrt(float(np.min(d2))))


def evaluate_site_and_grid(
    spec: CandidateSiteSpec,
    dem: LolaSouthPoleDem,
    spice_eph: SpiceLunarEphemeris,
    moon_centered_base: dict[str, Any],
    high_res_lro_base: dict[str, Any],
    timestamps_utc: list[str],
    step_seconds: int,
    observer_height_m: float = 2.0,
    az_step_deg: float = 1.0,
    grid_spacing_m: float = 500.0,
    grid_size: int = 5,
) -> dict[str, Any]:
    """Compute center point + 5x5 local spatial grid metrics for one candidate landing site."""
    lat = spec.latitude_deg
    lon = _normalize_lon_0_360(spec.longitude_east_deg)
    elev_m = dem.sample_elevation(lat, lon)
    slope_deg = dem.compute_slope_deg(lat, lon)
    center_me_m = selenographic_to_cartesian_me(lat, lon, elev_m)
    az_deg, horiz_elev = dem.compute_horizon_profile(
        lat,
        lon,
        observer_height_m=observer_height_m,
        max_distance_m=120_000.0,
        step_m=dem.meta.map_scale_m,
        az_step_deg=az_step_deg,
    )
    center_is_psr = dem.is_site_psr(lat, horiz_elev, az_deg)

    # Precompute site-local PSR cloud once so center + all 25 grid nodes get physical PSR distances
    psr_x, psr_y, _ = _compute_site_local_psr_mask(dem, lat, lon)
    cx, cy = dem.latlon_to_xy_m(lat, lon)
    center_psr_dist_m = _distance_to_psr_patch_m(cx, cy, center_is_psr, psr_x, psr_y)

    series = spice_eph.compute_topocentric_series(
        site_me_m=center_me_m,
        lat_deg=lat,
        lon_east_deg=lon,
        timestamps_utc=timestamps_utc,
        precomputed_moon_centered=moon_centered_base,
    )

    comms_result = analyze_site_comms(
        ephemeris=series,
        site_me_m=center_me_m,
        lat_deg=lat,
        lon_east_deg=lon,
        horizon_az_deg=az_deg,
        horizon_elev_deg=horiz_elev,
        step_seconds=step_seconds,
        high_res_lro=high_res_lro_base,
    )
    solar_result = analyze_site_solar(
        sun_az_deg=series.sun_az_deg,
        sun_el_deg=series.sun_el_deg,
        sun_dist_au=series.sun_dist_au,
        solar_angular_radius_deg=series.sun_angular_radius_deg,
        horizon_az_deg=az_deg,
        horizon_elev_deg=horiz_elev,
        step_seconds=step_seconds,
    )
    score_dict = compute_composite_landing_score(
        slope_deg=slope_deg,
        mean_illum_fraction=float(solar_result["summary"]["mean_illum_fraction"]),
        max_continuous_shadow_hours=float(
            solar_result["summary"]["max_continuous_shadow_hours"]
        ),
        dte_full_disk_duty_cycle_pct=float(
            comms_result["summary"]["dte_full_disk_duty_cycle_pct"]
        ),
        combined_dte_elfo_duty_cycle_pct=float(
            comms_result["summary"]["combined_dte_elfo_duty_cycle_pct"]
        ),
        psr_distance_m=center_psr_dist_m,
        is_psr=center_is_psr,
    )

    # Local 5x5 grid spaced by 500m centered at site center
    half = grid_size // 2
    nodes: list[dict[str, Any]] = []
    for row in range(grid_size):
        dy_m = (half - row) * grid_spacing_m
        for col in range(grid_size):
            dx_m = (col - half) * grid_spacing_m
            nx = cx + dx_m
            ny = cy + dy_m
            nlat, nlon_raw = dem.xy_m_to_latlon(nx, ny)
            nlon = _normalize_lon_0_360(nlon_raw)
            nelev = dem.sample_elevation(nlat, nlon)
            nslope = dem.compute_slope_deg(nlat, nlon)
            nme_m = selenographic_to_cartesian_me(nlat, nlon, nelev)
            _, nhoriz = dem.compute_horizon_profile(
                nlat,
                nlon,
                observer_height_m=observer_height_m,
                max_distance_m=120_000.0,
                step_m=dem.meta.map_scale_m,
                az_step_deg=az_step_deg,
            )
            nis_psr = dem.is_site_psr(nlat, nhoriz, az_deg)
            npsr_dist_m = _distance_to_psr_patch_m(nx, ny, nis_psr, psr_x, psr_y)

            nseries = spice_eph.compute_topocentric_series(
                site_me_m=nme_m,
                lat_deg=nlat,
                lon_east_deg=nlon,
                timestamps_utc=timestamps_utc,
                precomputed_moon_centered=moon_centered_base,
            )
            ncomms = analyze_site_comms(
                ephemeris=nseries,
                site_me_m=nme_m,
                lat_deg=nlat,
                lon_east_deg=nlon,
                horizon_az_deg=az_deg,
                horizon_elev_deg=nhoriz,
                step_seconds=step_seconds,
                high_res_lro=None,
            )
            nsolar = analyze_site_solar(
                sun_az_deg=nseries.sun_az_deg,
                sun_el_deg=nseries.sun_el_deg,
                sun_dist_au=nseries.sun_dist_au,
                solar_angular_radius_deg=nseries.sun_angular_radius_deg,
                horizon_az_deg=az_deg,
                horizon_elev_deg=nhoriz,
                step_seconds=step_seconds,
            )
            nscore = compute_composite_landing_score(
                slope_deg=nslope,
                mean_illum_fraction=float(nsolar["summary"]["mean_illum_fraction"]),
                max_continuous_shadow_hours=float(
                    nsolar["summary"]["max_continuous_shadow_hours"]
                ),
                dte_full_disk_duty_cycle_pct=float(
                    ncomms["summary"]["dte_full_disk_duty_cycle_pct"]
                ),
                combined_dte_elfo_duty_cycle_pct=float(
                    ncomms["summary"]["combined_dte_elfo_duty_cycle_pct"]
                ),
                psr_distance_m=npsr_dist_m,
                is_psr=nis_psr,
            )
            nodes.append(
                {
                    "row": row,
                    "col": col,
                    "dx_m": round(dx_m, 1),
                    "dy_m": round(dy_m, 1),
                    "latitude_deg": round(nlat, 5),
                    "longitude_east_deg": round(_normalize_lon_0_360(nlon), 5),
                    "elevation_m": round(nelev, 2),
                    "slope_deg": round(nslope, 2),
                    "psr_distance_m": round(npsr_dist_m, 1),
                    "is_psr": bool(nis_psr),
                    "horizon_elev_deg": [round(float(v), 3) for v in nhoriz],
                    "mean_illum_fraction": float(nsolar["summary"]["mean_illum_fraction"]),
                    "max_continuous_shadow_hours": float(
                        nsolar["summary"]["max_continuous_shadow_hours"]
                    ),
                    "energy_tracking_wh_m2": float(nsolar["summary"]["energy_tracking_wh_m2"]),
                    "dte_full_disk_duty_cycle_pct": float(
                        ncomms["summary"]["dte_full_disk_duty_cycle_pct"]
                    ),
                    "combined_dte_elfo_duty_cycle_pct": float(
                        ncomms["summary"]["combined_dte_elfo_duty_cycle_pct"]
                    ),
                    "max_blackout_combined_hours": float(
                        ncomms["summary"]["max_blackout_combined_hours"]
                    ),
                    "landing_score_0_100": float(nscore["total_0_100"]),
                }
            )

    return {
        "id": spec.site_id,
        "name": spec.name,
        "category": spec.category,
        "description": spec.description,
        "center": {
            "latitude_deg": round(lat, 5),
            "longitude_east_deg": round(lon, 5),
            "elevation_m": round(elev_m, 2),
            "slope_deg": round(slope_deg, 2),
            "cartesian_me_km": [
                round(float(center_me_m[0] / 1000.0), 4),
                round(float(center_me_m[1] / 1000.0), 4),
                round(float(center_me_m[2] / 1000.0), 4),
            ],
            "psr_distance_m": round(center_psr_dist_m, 1),
            "is_psr": bool(center_is_psr),
            "observer_height_m": round(observer_height_m, 2),
        },
        "horizon_elev_deg": [round(float(v), 3) for v in horiz_elev],
        "sky_series": {
            "sun_az_deg": [round(float(v), 3) for v in series.sun_az_deg],
            "sun_el_deg": [round(float(v), 3) for v in series.sun_el_deg],
            "earth_az_deg": [round(float(v), 3) for v in series.earth_az_deg],
            "earth_el_deg": [round(float(v), 3) for v in series.earth_el_deg],
            **comms_result["series"],
        },
        "engineering_summary": {
            "solar": solar_result["summary"],
            "comms": comms_result["summary"],
            "score": score_dict,
        },
        "local_grid": {
            "spacing_m": grid_spacing_m,
            "grid_size": grid_size,
            "nodes": nodes,
        },
    }


def run_navigator_pipeline(
    cache_dir: Path,
    sites: tuple[CandidateSiteSpec, ...] = DEFAULT_SOUTH_POLE_SITES,
    start_utc: str = "2026-11-15T00:00:00Z",
    end_utc: str = "2026-12-15T00:00:00Z",
    step_seconds: int = 3600,
    az_step_deg: float = 1.0,
    grid_spacing_m: float = 500.0,
    grid_size: int = 5,
    observer_height_m: float = 2.0,
    allow_download: bool = False,
    run_horizons_check: bool = True,
    dem_override: LolaSouthPoleDem | None = None,
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    """Execute the full topography + SPICE + comms + solar + score pipeline."""
    ensure_assets(cache_dir, NAIF_KERNELS, allow_download=allow_download)
    if dem_override is not None:
        dem = dem_override
        dem_meta = {
            "product_id": "SYNTHETIC_DEM_TEST",
            "url": "local://synthetic-test",
            "sha256": "0" * 64,
            "resolution_m": dem.meta.map_scale_m,
            "coverage_lat_deg": [-90.0, -80.0],
            "reference_radius_m": int(LUNAR_REFERENCE_RADIUS_M),
            "coordinate_system": "MOON_ME South Pole Stereographic (synthetic test)",
            "ray_max_distance_m": 120000.0,
            "azimuth_step_deg": az_step_deg,
        }
    else:
        dem_records = ensure_assets(cache_dir, LOLA_DEM_ASSETS, allow_download=allow_download)
        dem = LolaSouthPoleDem.from_pds_files(
            cache_dir / "ldem_80s_80m.img",
            cache_dir / "ldem_80s_80m.lbl",
        )
        img_rec = next(r for r in dem_records if r["filename"] == "ldem_80s_80m.img")
        dem_meta = {
            "product_id": "LRO-L-LOLA-4-GDR-V1.0 :: LDEM_80S_80M",
            "url": img_rec["url"],
            "sha256": img_rec["sha256"],
            "resolution_m": float(dem.meta.map_scale_m),
            "coverage_lat_deg": [-90.0, -80.0],
            "reference_radius_m": int(LUNAR_REFERENCE_RADIUS_M),
            "coordinate_system": "MOON_ME Selenographic South Pole Polar Stereographic",
            "ray_max_distance_m": 120000.0,
            "azimuth_step_deg": az_step_deg,
        }

    step_hours = step_seconds / 3600.0
    timestamps_utc = build_utc_grid(start_utc, end_utc, step_hours)
    lro_timestamps = build_utc_grid(start_utc, end_utc, 5.0 / 60.0)

    with SpiceLunarEphemeris(cache_dir, allow_download=allow_download) as spice_eph:
        moon_base = spice_eph.moon_centered_ephemeris(timestamps_utc, aberration="LT+S")
        lro_hr_base = spice_eph.moon_centered_ephemeris(lro_timestamps, aberration="LT+S")

        # Moon-centered representative series for global mission_window arrays
        site0 = sites[0]
        site0_me = selenographic_to_cartesian_me(
            site0.latitude_deg,
            _normalize_lon_0_360(site0.longitude_east_deg),
            dem.sample_elevation(site0.latitude_deg, site0.longitude_east_deg),
        )
        rep_series = spice_eph.compute_topocentric_series(
            site0_me,
            site0.latitude_deg,
            _normalize_lon_0_360(site0.longitude_east_deg),
            timestamps_utc,
            precomputed_moon_centered=moon_base,
        )

        site_entries = [
            evaluate_site_and_grid(
                spec=spec,
                dem=dem,
                spice_eph=spice_eph,
                moon_centered_base=moon_base,
                high_res_lro_base=lro_hr_base,
                timestamps_utc=timestamps_utc,
                step_seconds=step_seconds,
                observer_height_m=observer_height_m,
                az_step_deg=az_step_deg,
                grid_spacing_m=grid_spacing_m,
                grid_size=grid_size,
            )
            for spec in sites
        ]

    horizons_report: dict[str, Any] | None = None
    if run_horizons_check:
        try:
            ref_site = site_entries[0]
            horizons_report = validate_ephemeris_against_horizons(
                cache_dir=cache_dir,
                site_id=ref_site["id"],
                site_name=ref_site["name"],
                lat_deg=ref_site["center"]["latitude_deg"],
                lon_east_deg=ref_site["center"]["longitude_east_deg"],
                elevation_m=ref_site["center"]["elevation_m"],
                start_utc=start_utc,
                stop_utc=timestamps_utc[-1],
                step_size="2 d",
            )
            max_sun_az = max(
                abs(r["spice_az_deg"] - r["horizons_az_deg"])
                for r in horizons_report["sun_comparisons"]
            )
            max_sun_el = max(
                abs(r["spice_el_deg"] - r["horizons_el_deg"])
                for r in horizons_report["sun_comparisons"]
            )
            max_earth_az = max(
                abs(r["spice_az_deg"] - r["horizons_az_deg"])
                for r in horizons_report["earth_comparisons"]
            )
            max_earth_el = max(
                abs(r["spice_el_deg"] - r["horizons_el_deg"])
                for r in horizons_report["earth_comparisons"]
            )
            horizons_prov = {
                "status": "verified",
                "endpoint": "https://ssd.jpl.nasa.gov/api/horizons.api",
                "max_sun_az_diff_deg": round(float(max_sun_az), 5),
                "max_sun_el_diff_deg": round(float(max_sun_el), 5),
                "max_earth_az_diff_deg": round(float(max_earth_az), 5),
                "max_earth_el_diff_deg": round(float(max_earth_el), 5),
                "notes": [
                    f"Cross-validated SPICE MOON_ME vs JPL Horizons on {horizons_report['sample_count']} epochs (2-day cadence) at {ref_site['name']}.",
                    f"Max spherical separation: Sun {horizons_report['max_sun_angular_diff_deg']} deg, Earth {horizons_report['max_earth_angular_diff_deg']} deg.",
                ],
            }
        except Exception as exc:
            horizons_prov = {
                "status": "skipped_network_unavailable",
                "endpoint": "https://ssd.jpl.nasa.gov/api/horizons.api",
                "max_sun_az_diff_deg": None,
                "max_sun_el_diff_deg": None,
                "max_earth_az_diff_deg": None,
                "max_earth_el_diff_deg": None,
                "notes": [f"Horizons cross-validation could not complete online: {exc}"],
            }
    else:
        horizons_prov = {
            "status": "not_requested",
            "endpoint": "https://ssd.jpl.nasa.gov/api/horizons.api",
            "max_sun_az_diff_deg": None,
            "max_sun_el_diff_deg": None,
            "max_earth_az_diff_deg": None,
            "max_earth_el_diff_deg": None,
            "notes": ["Horizons check skipped by caller flag."],
        }

    azimuths_list = [round(float(a), 3) for a in np.arange(0.0, 360.0, az_step_deg)]

    dataset: dict[str, Any] = {
        "schema_version": "1.0.0",
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "provenance": {
            "dem_product": dem_meta,
            "ephemeris": {
                "engine": "NAIF SPICE (spiceypy) cross-checked with Skyfield",
                "frame": "MOON_ME (Mean Earth / Polar Axis DE421)",
                "correction": "LT+S",
                "kernels": [
                    {"filename": k.filename, "url": k.url, "sha256": k.sha256}
                    for k in NAIF_KERNELS
                ],
            },
            "horizons_validation": horizons_prov,
            "conventions": {
                "azimuth_deg": "Clockwise from local selenographic North (0=N, 90=E, 180=S, 270=W)",
                "elevation_deg": "Topocentric ENU elevation above local sphere tangent plane",
                "latitude_type": "Selenographic latitude referenced to sphere R_ref = 1737.4 km",
                "longitude_convention": "Positive East in [0, 360) deg",
                "solar_constant_w_m2": SOLAR_CONSTANT_1AU_W_M2,
                "solar_radius_km": SOLAR_RADIUS_KM,
                "earth_radius_km": EARTH_RADIUS_KM,
                "lunar_radius_m": LUNAR_REFERENCE_RADIUS_M,
                "clps_slope_limit_deg": 12.0,
            },
            "limitations": [
                "Geodesic ray marching covers up to 120 km radius using LOLA 80 m/px gridded DEM; micro-scale boulders (<80 m) require LROC NAC imagery before final touchdown.",
                "Relay trajectories propagate two-body Keplerian motion anchored to Lunar Mean Equator epoch; long-term three-body Earth perturbation drift is excluded over 30-day windows.",
                "No atmospheric refraction exists on the Moon; solar panel degradation from dust/temperature is excluded at baseline efficiency eta=0.28.",
            ],
        },
        "mission_window": {
            "start_utc": timestamps_utc[0],
            "end_utc": timestamps_utc[-1],
            "step_seconds": step_seconds,
            "synodic_period_days": SYNODIC_PERIOD_DAYS,
            "timestamps_utc": timestamps_utc,
            "sun_dist_au": [round(float(v), 6) for v in rep_series.sun_dist_au],
            "earth_angular_radius_deg": [
                round(float(v), 5) for v in rep_series.earth_angular_radius_deg
            ],
            "solar_angular_radius_deg": [
                round(float(v), 5) for v in rep_series.sun_angular_radius_deg
            ],
        },
        "relay_presets": {
            "lro": LRO_PRESET.to_contract_dict(),
            "elfo_pathfinder": ELFO_PATHFINDER_PRESET.to_contract_dict(),
            "elfo_constellation": ELFO_CONSTELLATION_PRESET.to_contract_dict(),
        },
        "horizon_azimuths_deg": azimuths_list,
        "sites": site_entries,
    }

    validate_dataset_schema(dataset)
    return dataset, horizons_report


def write_navigator_outputs(
    repo_root: Path,
    dataset: dict[str, Any],
    horizons_report: dict[str, Any] | None = None,
) -> dict[str, Path]:
    """Write validated JSON dataset, CSV/Markdown engineering reports, and Horizons report."""
    outputs_dir = repo_root / "outputs"
    datasets_dir = outputs_dir / "datasets"
    reports_dir = outputs_dir / "reports"
    validation_dir = outputs_dir / "validation"
    frontend_data_dir = repo_root / "frontend" / "src" / "data"

    for d in (datasets_dir, reports_dir, validation_dir, frontend_data_dir):
        d.mkdir(parents=True, exist_ok=True)

    json_text = json.dumps(dataset, indent=2)
    dataset_path = datasets_dir / "south_pole_precomputed.v1.json"
    dataset_path.write_text(json_text + "\n", encoding="utf-8")

    # Compact minified copy inside frontend/src/data for fast Vite bundling
    frontend_dataset_path = frontend_data_dir / "south_pole_precomputed.v1.json"
    frontend_dataset_path.write_text(
        json.dumps(dataset, separators=(",", ":")) + "\n", encoding="utf-8"
    )

    written: dict[str, Path] = {
        "dataset": dataset_path,
        "frontend_dataset": frontend_dataset_path,
    }

    if horizons_report is not None:
        h_path = validation_dir / "horizons_cross_validation.json"
        h_path.write_text(json.dumps(horizons_report, indent=2) + "\n", encoding="utf-8")
        written["horizons_validation"] = h_path

    # Engineering Summary CSV
    csv_path = reports_dir / "site_engineering_summary.csv"
    fieldnames = [
        "site_id",
        "name",
        "category",
        "lat_deg",
        "lon_east_deg",
        "elevation_m",
        "slope_deg",
        "psr_distance_m",
        "is_psr",
        "mean_illum_fraction",
        "sunlit_hours",
        "max_continuous_shadow_hours",
        "energy_tracking_wh_m2",
        "energy_fixed_north_wh_m2",
        "energy_fixed_horiz_wh_m2",
        "min_battery_100w_wh",
        "dte_center_duty_cycle_pct",
        "dte_full_disk_duty_cycle_pct",
        "elfo_pathfinder_duty_cycle_pct",
        "elfo_constellation_duty_cycle_pct",
        "lro_duty_cycle_pct",
        "combined_dte_elfo_duty_cycle_pct",
        "relay_coverage_gain_pct",
        "max_blackout_dte_hours",
        "max_blackout_combined_hours",
        "landing_score_total",
    ]
    sorted_sites = sorted(
        dataset["sites"],
        key=lambda s: s["engineering_summary"]["score"]["total_0_100"],
        reverse=True,
    )
    with csv_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for site in sorted_sites:
            c = site["center"]
            sol = site["engineering_summary"]["solar"]
            com = site["engineering_summary"]["comms"]
            sc = site["engineering_summary"]["score"]
            writer.writerow(
                {
                    "site_id": site["id"],
                    "name": site["name"],
                    "category": site["category"],
                    "lat_deg": c["latitude_deg"],
                    "lon_east_deg": c["longitude_east_deg"],
                    "elevation_m": c["elevation_m"],
                    "slope_deg": c["slope_deg"],
                    "psr_distance_m": c["psr_distance_m"],
                    "is_psr": c["is_psr"],
                    **sol,
                    **{k: com[k] for k in fieldnames if k in com},
                    "landing_score_total": sc["total_0_100"],
                }
            )
    written["summary_csv"] = csv_path

    # Engineering Summary Markdown Report
    md_lines = [
        "# Lunar South Pole Landing Site Engineering Summary",
        "",
        f"- **Generated (UTC)**: `{dataset['generated_utc']}`",
        f"- **Mission Window**: `{dataset['mission_window']['start_utc']}` -> `{dataset['mission_window']['end_utc']}` (`{len(dataset['mission_window']['timestamps_utc'])}` hourly epochs)",
        f"- **DEM Product**: `{dataset['provenance']['dem_product']['product_id']}` (`{dataset['provenance']['dem_product']['resolution_m']} m/px`, 120 km ray marching)",
        f"- **Ephemeris**: `{dataset['provenance']['ephemeris']['engine']}` in `{dataset['provenance']['ephemeris']['frame']}` (`{dataset['provenance']['ephemeris']['correction']}`)",
        f"- **JPL Horizons Validation**: `{dataset['provenance']['horizons_validation']['status']}`",
        "",
        "| Rank | Site | Lat / Lon(E) | Slope (°) | PSR Dist (m) | Mean Illum (%) | Max Shadow (h) | DTE Full (%) | Combined DTE+ELFO (%) | Relay Gain (%) | Max Blackout Comb (h) | Score (/100) |",
        "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for rank, site in enumerate(sorted_sites, start=1):
        c = site["center"]
        sol = site["engineering_summary"]["solar"]
        com = site["engineering_summary"]["comms"]
        sc = site["engineering_summary"]["score"]
        psr_tag = "PSR" if c["is_psr"] else f"{c['psr_distance_m']:.0f}"
        md_lines.append(
            f"| {rank} | {site['name']} | {c['latitude_deg']:.3f}, {c['longitude_east_deg']:.3f} | "
            f"{c['slope_deg']:.2f} | {psr_tag} | {sol['mean_illum_fraction'] * 100:.1f} | "
            f"{sol['max_continuous_shadow_hours']:.1f} | {com['dte_full_disk_duty_cycle_pct']:.1f} | "
            f"{com['combined_dte_elfo_duty_cycle_pct']:.1f} | +{com['relay_coverage_gain_pct']:.1f} | "
            f"{com['max_blackout_combined_hours']:.1f} | **{sc['total_0_100']:.1f}** |"
        )
    md_lines.extend(["", "## Key Findings", ""])
    best = sorted_sites[0]
    md_lines.append(
        f"- **Top-Ranked Candidate**: `{best['name']}` scores **{best['engineering_summary']['score']['total_0_100']:.1f}/100** "
        f"(slope `{best['center']['slope_deg']:.2f}°`, illumination `{best['engineering_summary']['solar']['mean_illum_fraction']*100:.1f}%`, "
        f"DTE `{best['engineering_summary']['comms']['dte_full_disk_duty_cycle_pct']:.1f}%`, DTE+ELFO `{best['engineering_summary']['comms']['combined_dte_elfo_duty_cycle_pct']:.1f}%`)."
    )
    psr_sites = [s for s in sorted_sites if s["center"]["is_psr"]]
    if psr_sites:
        p = psr_sites[0]
        md_lines.append(
            f"- **Relay Enabling PSR Operations**: `{p['name']}` (`{p['engineering_summary']['comms']['dte_full_disk_duty_cycle_pct']:.1f}%` DTE vs "
            f"`{p['engineering_summary']['comms']['combined_dte_elfo_duty_cycle_pct']:.1f}%` with ELFO constellation) gains "
            f"`+{p['engineering_summary']['comms']['relay_coverage_gain_pct']:.1f}%` link availability inside zero-sunlight terrain."
        )
    md_path = reports_dir / "site_engineering_summary.md"
    md_path.write_text("\n".join(md_lines) + "\n", encoding="utf-8")
    written["summary_md"] = md_path

    return written
