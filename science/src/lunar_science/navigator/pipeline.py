"""End-to-end precomputation pipeline for Lunar Landing Site Navigator.

"Validated" in this module means conformance with ``navigator-dataset.v1.schema.json`` (contract
1.1.0) only.
The only external comparison is the optional JPL Horizons check of Sun/Earth directions at one
site; its status is ``verified`` only within a declared tolerance (see ``ephemeris.py``).
"""

from __future__ import annotations

import csv
import importlib.resources
import json
import math
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import jsonschema
import numpy as np

from .comms import (
    ELFO_CONSTELLATION_PRESET,
    ELFO_PATHFINDER_PRESET,
    LRO_PRESET,
    RELAY_PRESET_LIMITATIONS,
    analyze_site_comms,
)
from .data_sources import (
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
    PsrCriterion,
    selenographic_to_cartesian_me,
)
from .ephemeris import (
    DEFAULT_HORIZONS_TOLERANCE_DEG,
    HORIZONS_API_URL,
    HORIZONS_RAW_DIRNAME,
    horizons_raw_response_file,
    HorizonsNetworkError,
    SpiceLunarEphemeris,
    build_utc_grid,
    parse_utc_iso,
    remove_horizons_validation_artifacts,
    subsolar_latitude_deg,
    validate_ephemeris_against_horizons,
    write_horizons_validation_artifacts,
)
from .scoring import (
    DEFAULT_SLOPE_LIMIT_DEG,
    compute_composite_landing_score,
    is_slope_eliminated,
)
from .solar import analyze_site_solar

#: ``schema_version`` written by this producer (contracts/navigator-dataset.v1.schema.json).
DATASET_SCHEMA_VERSION = "1.1.0"

#: Reason code published in ``score.elimination_reasons`` (contract 1.1.0).
SLOPE_ELIMINATION_REASON = "slope_above_clps_limit"

#: File name of the frontend copy and of its SHA-256 checksum (sha256sum format), written next to it.
FRONTEND_DATASET_FILENAME = "south_pole_precomputed.v1.json"
FRONTEND_DATASET_CHECKSUM_FILENAME = FRONTEND_DATASET_FILENAME + ".sha256"

EPHEMERIS_ENGINE_LABEL = "NAIF SPICE (spiceypy)"
EPHEMERIS_FRAME_LABEL = "MOON_ME (Mean Earth / Polar Axis DE421)"

#: Period of the sub-solar latitude cycle on the Moon (eclipse year). Measured from DE421 over
#: 2000-2030 as 346.62 +/- 0.55 d (SPA-10); windows shorter than this are season-specific.
SEASONAL_CYCLE_DAYS = 346.62

#: Radius of the site-centered lattice searched for PSR points. Contract 1.1.0 publishes it as
#: ``conventions.psr_search_radius_m``; ``psr_distance_m`` is null when no PSR point is found in it.
DEFAULT_PSR_SEARCH_RADIUS_M = 5200.0
DEFAULT_PSR_LATTICE_STEP_M = 500.0

#: Horizons statuses that come with a comparison report.
_HORIZONS_STATUSES_WITH_REPORT = frozenset({"verified", "failed"})


def load_navigator_schema() -> dict[str, Any]:
    """Load the bundled navigator-dataset.v1 JSON schema."""
    schema_text = (
        importlib.resources.files("lunar_science")
        .joinpath("schemas/navigator-dataset.v1.schema.json")
        .read_text(encoding="utf-8")
    )
    return json.loads(schema_text)


def validate_dataset_schema(dataset: dict[str, Any]) -> None:
    """Validate the dataset against navigator-dataset.v1.schema.json (form, not science)."""
    schema = load_navigator_schema()
    jsonschema.validate(instance=dataset, schema=schema)


def _normalize_lon_0_360(lon_deg: float) -> float:
    wrapped = lon_deg % 360.0
    if wrapped >= 360.0 or wrapped < 0.0:
        wrapped = 0.0
    return wrapped


def psr_lattice_offsets(search_radius_m: float, lattice_step_m: float) -> list[tuple[float, float]]:
    """Symmetric (dx, dy) lattice in map meters, centered on the site (contains (0, 0))."""
    k = int(math.floor(search_radius_m / lattice_step_m + 1e-9))
    steps = lattice_step_m * np.arange(-k, k + 1, dtype=np.float64)
    return [
        (float(dx), float(dy))
        for dy in steps
        for dx in steps
        if dx * dx + dy * dy <= search_radius_m * search_radius_m + 1e-6
    ]


def compute_psr_lattice(
    dem: LolaSouthPoleDem,
    center_lat_deg: float,
    center_lon_east_deg: float,
    criterion: PsrCriterion,
    observer_height_m: float,
    az_step_deg: float,
    ray_step_m: float,
    max_distance_m: float = 120_000.0,
    search_radius_m: float = DEFAULT_PSR_SEARCH_RADIUS_M,
    lattice_step_m: float = DEFAULT_PSR_LATTICE_STEP_M,
) -> tuple[np.ndarray, np.ndarray]:
    """Map coordinates (x, y in m) of PSR points on a site-centered lattice.

    The lattice is symmetric, contains the site center, keeps points within ``search_radius_m``
    and classifies each point with the same :class:`PsrCriterion` and the same horizon settings
    the caller uses for ``is_psr`` flags, so both quantities measure the same thing.
    """
    cx, cy = dem.latlon_to_xy_m(center_lat_deg, center_lon_east_deg)
    psr_x: list[float] = []
    psr_y: list[float] = []
    for dx, dy in psr_lattice_offsets(search_radius_m, lattice_step_m):
        px, py = float(cx) + dx, float(cy) + dy
        plat, plon = dem.xy_m_to_latlon(px, py)
        az, horiz = dem.compute_horizon_profile(
            float(plat),
            float(plon),
            observer_height_m=observer_height_m,
            max_distance_m=max_distance_m,
            step_m=ray_step_m,
            az_step_deg=az_step_deg,
        )
        if dem.is_site_psr(float(plat), horiz, az, criterion):
            psr_x.append(px)
            psr_y.append(py)
    return np.asarray(psr_x, dtype=np.float64), np.asarray(psr_y, dtype=np.float64)


def distance_to_psr_cloud_m(
    x_m: float,
    y_m: float,
    is_psr_flag: bool,
    psr_x: np.ndarray,
    psr_y: np.ndarray,
) -> float | None:
    """Distance to the nearest PSR point, 0 for a PSR point, ``None`` if no PSR point is known."""
    if is_psr_flag:
        return 0.0
    if len(psr_x) == 0:
        return None
    d2 = (np.asarray(psr_x) - x_m) ** 2 + (np.asarray(psr_y) - y_m) ** 2
    return float(math.sqrt(float(np.min(d2))))


def _emit_psr_distance(distance_m: float | None) -> float | None:
    """Contract value: the measured distance, or ``None`` when no PSR point is known (1.1.0)."""
    return None if distance_m is None else round(float(distance_m), 1)


def contract_score_summary(
    slope_deg: float,
    mean_illum_fraction: float,
    max_continuous_shadow_hours: float,
    dte_full_disk_duty_cycle_pct: float,
    combined_dte_elfo_duty_cycle_pct: float,
    psr_distance_m: float | None,
    is_psr: bool,
    slope_limit_deg: float = DEFAULT_SLOPE_LIMIT_DEG,
) -> dict[str, Any]:
    """``engineering_summary.score`` object of contract 1.1.0 (illustrative index).

    The five 0-100 fields come from :func:`compute_composite_landing_score` with the relay scenario;
    ``total_without_relay_0_100`` is the same index with DTE only (the hypothetical constellation
    saturates the comms term); ``eliminated`` and ``elimination_reasons`` expose the hard slope limit.
    """
    common = dict(
        slope_deg=slope_deg,
        mean_illum_fraction=mean_illum_fraction,
        max_continuous_shadow_hours=max_continuous_shadow_hours,
        dte_full_disk_duty_cycle_pct=dte_full_disk_duty_cycle_pct,
        combined_dte_elfo_duty_cycle_pct=combined_dte_elfo_duty_cycle_pct,
        psr_distance_m=psr_distance_m,
        is_psr=is_psr,
        slope_limit_deg=slope_limit_deg,
    )
    score: dict[str, Any] = compute_composite_landing_score(**common)
    eliminated = is_slope_eliminated(slope_deg, slope_limit_deg)
    score["eliminated"] = eliminated
    score["elimination_reasons"] = [SLOPE_ELIMINATION_REASON] if eliminated else []
    score["total_without_relay_0_100"] = compute_composite_landing_score(**common, use_relay=False)["total_0_100"]
    return score


def _terrain_point(
    dem: LolaSouthPoleDem,
    lat_deg: float,
    lon_east_deg: float,
    observer_height_m: float,
    az_step_deg: float,
    ray_step_m: float,
    criterion: PsrCriterion,
) -> dict[str, Any]:
    elev_m = float(dem.sample_elevation(lat_deg, lon_east_deg))
    az_deg, horizon = dem.compute_horizon_profile(
        lat_deg,
        lon_east_deg,
        observer_height_m=observer_height_m,
        max_distance_m=120_000.0,
        step_m=ray_step_m,
        az_step_deg=az_step_deg,
    )
    x, y = dem.latlon_to_xy_m(lat_deg, lon_east_deg)
    return {
        "lat": lat_deg,
        "lon": lon_east_deg,
        "elev_m": elev_m,
        "slope_deg": dem.compute_slope_deg(lat_deg, lon_east_deg),
        "az_deg": az_deg,
        "horizon": horizon,
        "is_psr": dem.is_site_psr(lat_deg, horizon, az_deg, criterion),
        "me_m": selenographic_to_cartesian_me(lat_deg, lon_east_deg, elev_m),
        "x": float(x),
        "y": float(y),
    }


def evaluate_site_and_grid(
    spec: CandidateSiteSpec,
    dem: LolaSouthPoleDem,
    spice_eph: Any,
    moon_centered_base: dict[str, Any],
    high_res_lro_base: dict[str, Any] | None,
    timestamps_utc: list[str],
    step_seconds: int,
    observer_height_m: float = 2.0,
    az_step_deg: float = 1.0,
    grid_spacing_m: float = 500.0,
    grid_size: int = 5,
    psr_criterion: PsrCriterion | None = None,
    psr_search_radius_m: float = DEFAULT_PSR_SEARCH_RADIUS_M,
    psr_lattice_step_m: float = DEFAULT_PSR_LATTICE_STEP_M,
    psr_lattice_az_step_deg: float | None = None,
    psr_lattice_ray_step_m: float | None = None,
    slope_limit_deg: float = DEFAULT_SLOPE_LIMIT_DEG,
) -> dict[str, Any]:
    """Compute center point + local grid metrics for one candidate landing site.

    ``spice_eph`` only needs ``compute_topocentric_series(..., precomputed_moon_centered=...)``.
    PSR flags and PSR distances use one criterion and, by default, the same horizon sampling
    (``psr_lattice_*`` can coarsen the lattice explicitly, at the cost of consistency).
    """
    criterion = psr_criterion or PsrCriterion()
    ray_step_m = float(dem.meta.map_scale_m)
    lat = spec.latitude_deg
    lon = _normalize_lon_0_360(spec.longitude_east_deg)

    center = _terrain_point(dem, lat, lon, observer_height_m, az_step_deg, ray_step_m, criterion)
    az_deg = center["az_deg"]
    cx, cy = center["x"], center["y"]

    half = grid_size // 2
    node_terrain: list[dict[str, Any]] = []
    for row in range(grid_size):
        dy_m = (half - row) * grid_spacing_m
        for col in range(grid_size):
            dx_m = (col - half) * grid_spacing_m
            nlat, nlon_raw = dem.xy_m_to_latlon(cx + dx_m, cy + dy_m)
            point = _terrain_point(
                dem, float(nlat), _normalize_lon_0_360(float(nlon_raw)), observer_height_m, az_step_deg, ray_step_m, criterion
            )
            point.update(row=row, col=col, dx_m=dx_m, dy_m=dy_m)
            node_terrain.append(point)

    psr_x, psr_y = compute_psr_lattice(
        dem,
        lat,
        lon,
        criterion,
        observer_height_m=observer_height_m,
        az_step_deg=psr_lattice_az_step_deg or az_step_deg,
        ray_step_m=psr_lattice_ray_step_m or ray_step_m,
        search_radius_m=psr_search_radius_m,
        lattice_step_m=psr_lattice_step_m,
    )
    # Flagged center/nodes join the PSR cloud so a distance can never contradict a flag.
    flagged = [(p["x"], p["y"]) for p in (center, *node_terrain) if p["is_psr"]]
    if flagged:
        psr_x = np.concatenate([psr_x, np.array([f[0] for f in flagged])])
        psr_y = np.concatenate([psr_y, np.array([f[1] for f in flagged])])

    center_psr_dist = distance_to_psr_cloud_m(cx, cy, center["is_psr"], psr_x, psr_y)

    series = spice_eph.compute_topocentric_series(
        site_me_m=center["me_m"],
        lat_deg=lat,
        lon_east_deg=lon,
        timestamps_utc=timestamps_utc,
        precomputed_moon_centered=moon_centered_base,
    )
    comms_result = analyze_site_comms(
        ephemeris=series,
        site_me_m=center["me_m"],
        lat_deg=lat,
        lon_east_deg=lon,
        horizon_az_deg=az_deg,
        horizon_elev_deg=center["horizon"],
        step_seconds=step_seconds,
        high_res_lro=high_res_lro_base,
    )
    solar_result = analyze_site_solar(
        sun_az_deg=series.sun_az_deg,
        sun_el_deg=series.sun_el_deg,
        sun_dist_au=series.sun_dist_au,
        solar_angular_radius_deg=series.sun_angular_radius_deg,
        horizon_az_deg=az_deg,
        horizon_elev_deg=center["horizon"],
        step_seconds=step_seconds,
    )
    score_dict = contract_score_summary(
        slope_deg=center["slope_deg"],
        mean_illum_fraction=float(solar_result["summary"]["mean_illum_fraction"]),
        max_continuous_shadow_hours=float(solar_result["summary"]["max_continuous_shadow_hours"]),
        dte_full_disk_duty_cycle_pct=float(comms_result["summary"]["dte_full_disk_duty_cycle_pct"]),
        combined_dte_elfo_duty_cycle_pct=float(comms_result["summary"]["combined_dte_elfo_duty_cycle_pct"]),
        psr_distance_m=center_psr_dist,
        is_psr=center["is_psr"],
        slope_limit_deg=slope_limit_deg,
    )

    nodes: list[dict[str, Any]] = []
    for point in node_terrain:
        npsr_dist = distance_to_psr_cloud_m(point["x"], point["y"], point["is_psr"], psr_x, psr_y)
        nseries = spice_eph.compute_topocentric_series(
            site_me_m=point["me_m"],
            lat_deg=point["lat"],
            lon_east_deg=point["lon"],
            timestamps_utc=timestamps_utc,
            precomputed_moon_centered=moon_centered_base,
        )
        ncomms = analyze_site_comms(
            ephemeris=nseries,
            site_me_m=point["me_m"],
            lat_deg=point["lat"],
            lon_east_deg=point["lon"],
            horizon_az_deg=az_deg,
            horizon_elev_deg=point["horizon"],
            step_seconds=step_seconds,
            high_res_lro=None,
        )
        nsolar = analyze_site_solar(
            sun_az_deg=nseries.sun_az_deg,
            sun_el_deg=nseries.sun_el_deg,
            sun_dist_au=nseries.sun_dist_au,
            solar_angular_radius_deg=nseries.sun_angular_radius_deg,
            horizon_az_deg=az_deg,
            horizon_elev_deg=point["horizon"],
            step_seconds=step_seconds,
        )
        nscore = compute_composite_landing_score(
            slope_deg=point["slope_deg"],
            mean_illum_fraction=float(nsolar["summary"]["mean_illum_fraction"]),
            max_continuous_shadow_hours=float(nsolar["summary"]["max_continuous_shadow_hours"]),
            dte_full_disk_duty_cycle_pct=float(ncomms["summary"]["dte_full_disk_duty_cycle_pct"]),
            combined_dte_elfo_duty_cycle_pct=float(ncomms["summary"]["combined_dte_elfo_duty_cycle_pct"]),
            psr_distance_m=npsr_dist,
            is_psr=point["is_psr"],
            slope_limit_deg=slope_limit_deg,
        )
        nodes.append(
            {
                "row": point["row"],
                "col": point["col"],
                "dx_m": round(point["dx_m"], 1),
                "dy_m": round(point["dy_m"], 1),
                "latitude_deg": round(point["lat"], 5),
                "longitude_east_deg": round(_normalize_lon_0_360(point["lon"]), 5),
                "elevation_m": round(point["elev_m"], 2),
                "slope_deg": round(point["slope_deg"], 2),
                "psr_distance_m": _emit_psr_distance(npsr_dist),
                "is_psr": bool(point["is_psr"]),
                "horizon_elev_deg": [round(float(v), 3) for v in point["horizon"]],
                "mean_illum_fraction": float(nsolar["summary"]["mean_illum_fraction"]),
                "max_continuous_shadow_hours": float(nsolar["summary"]["max_continuous_shadow_hours"]),
                "energy_tracking_wh_m2": float(nsolar["summary"]["energy_tracking_wh_m2"]),
                "dte_full_disk_duty_cycle_pct": float(ncomms["summary"]["dte_full_disk_duty_cycle_pct"]),
                "combined_dte_elfo_duty_cycle_pct": float(ncomms["summary"]["combined_dte_elfo_duty_cycle_pct"]),
                "max_blackout_combined_hours": float(ncomms["summary"]["max_blackout_combined_hours"]),
                "landing_score_0_100": float(nscore["total_0_100"]),
            }
        )

    me_m = center["me_m"]
    return {
        "id": spec.site_id,
        "name": spec.name,
        "category": spec.category,
        "description": spec.description,
        "coordinates_source": spec.coordinates_source,
        "center": {
            "latitude_deg": round(lat, 5),
            "longitude_east_deg": round(lon, 5),
            "elevation_m": round(center["elev_m"], 2),
            "slope_deg": round(center["slope_deg"], 2),
            "cartesian_me_km": [round(float(me_m[i] / 1000.0), 4) for i in range(3)],
            "psr_distance_m": _emit_psr_distance(center_psr_dist),
            "is_psr": bool(center["is_psr"]),
            "observer_height_m": round(observer_height_m, 2),
        },
        "horizon_elev_deg": [round(float(v), 3) for v in center["horizon"]],
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


def describe_window_coverage(
    timestamps_utc: list[str],
    step_seconds: int,
    sun_pos_me_km: np.ndarray,
) -> dict[str, Any]:
    """What the time window covers, from the run's own Moon-centered Sun vectors."""
    start = parse_utc_iso(timestamps_utc[0])
    stop = parse_utc_iso(timestamps_utc[-1])
    duration_days = (stop - start).total_seconds() / 86400.0
    lat = subsolar_latitude_deg(sun_pos_me_km)
    return {
        "start_utc": timestamps_utc[0],
        "end_utc": timestamps_utc[-1],
        "duration_days": duration_days,
        "step_seconds": int(step_seconds),
        "sample_count": len(timestamps_utc),
        "subsolar_lat_min_deg": float(np.min(lat)),
        "subsolar_lat_max_deg": float(np.max(lat)),
        "covers_seasonal_cycle": duration_days >= SEASONAL_CYCLE_DAYS,
    }


def window_limitation(coverage: dict[str, Any]) -> str:
    """Explicit label of the illumination window for ``provenance.limitations``."""
    head = (
        f"Illumination, energy, battery and the power score cover only {coverage['start_utc']} -> "
        f"{coverage['end_utc']} ({coverage['duration_days']:.1f} days, step {coverage['step_seconds']} s); "
        f"the sub-solar latitude in MOON_ME ranged {coverage['subsolar_lat_min_deg']:.3f} to "
        f"{coverage['subsolar_lat_max_deg']:.3f} deg (full seasonal excursion about +/-1.59 deg in DE421)."
    )
    if coverage["covers_seasonal_cycle"]:
        return head + f" The window spans at least one seasonal cycle (~{SEASONAL_CYCLE_DAYS} d, eclipse year)."
    tail = (
        f" The window is shorter than one seasonal cycle (~{SEASONAL_CYCLE_DAYS} d, eclipse year): these are "
        "season-specific values, not annual statistics."
    )
    if coverage["subsolar_lat_max_deg"] < 0.0:
        tail += " The whole window lies on the southern-summer side (sub-solar latitude < 0), the most favourable season for south-polar illumination."
    return head + tail


def horizons_provenance_from_report(report: dict[str, Any]) -> dict[str, Any]:
    """``provenance.horizons_validation`` block (schema-compatible) built from a comparison report."""
    status = report["status"]
    if status not in _HORIZONS_STATUSES_WITH_REPORT:
        raise ValueError(f"Unexpected Horizons comparison status {status!r}")

    def _r(value: float | None) -> float | None:
        return None if value is None else round(float(value), 7)

    grid = report.get("requested_grid", {})
    exceeding = report["samples_exceeding_tolerance"]
    retrieved = ", ".join(q.get("retrieved_utc", "?") for q in report.get("horizons_queries", []))
    sun_max = report["max_sun_angular_diff_deg"]
    earth_max = report["max_earth_angular_diff_deg"]
    fmt = lambda v: "n/a" if v is None else f"{v:.2e}"  # noqa: E731
    return {
        "status": status,
        "endpoint": HORIZONS_API_URL,
        "tolerance_deg": float(report["tolerance_deg"]),
        "sample_count": int(report["sample_count"]),
        "raw_responses": [
            {
                "target_command": q["target_command"],
                "request_url": q["request_url"],
                "retrieved_utc": q["retrieved_utc"],
                "response_file": horizons_raw_response_file(q["target_command"]),
                "response_sha256": q["response_sha256"],
            }
            for q in report.get("horizons_queries", [])
        ],
        "max_sun_az_diff_deg": _r(report["max_sun_az_diff_deg"]),
        "max_sun_el_diff_deg": _r(report["max_sun_el_diff_deg"]),
        "max_earth_az_diff_deg": _r(report["max_earth_az_diff_deg"]),
        "max_earth_el_diff_deg": _r(report["max_earth_el_diff_deg"]),
        "notes": [
            (
                f"Status '{status}': 'verified' only if the spherical separation is <= {report['tolerance_deg']:g} deg "
                f"at every epoch for both targets; samples above it: Sun {exceeding['sun']}, Earth {exceeding['earth']}."
            ),
            (
                f"Compared {report['sample_count']} epochs ({grid.get('step_size', '?')} cadence, "
                f"{grid.get('start_utc', '?')} -> {grid.get('stop_utc', '?')}) at {report.get('site_name', '?')}; "
                f"max separation Sun {fmt(sun_max)} deg, Earth {fmt(earth_max)} deg."
            ),
            f"Tolerance rationale: {report['tolerance_rationale']}",
            (
                "Raw Horizons responses with request parameters, retrieval time "
                f"({retrieved}) and SHA-256 are retained by write_navigator_outputs in "
                f"outputs/validation/{HORIZONS_RAW_DIRNAME}/."
            ),
            "Scope: Sun and Earth center directions at one site only; DEM horizons, illumination, communications and the landing score are not validated by this check.",
        ],
    }


def run_horizons_validation_step(
    validator: Callable[..., dict[str, Any]],
    **kwargs: Any,
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    """Run the Horizons comparison; only a network failure is tolerated (and labeled as such).

    Any other exception (rejected query, malformed or empty table, wrong epochs, bugs) propagates
    so it can never be published as ``skipped_network_unavailable``.
    """
    try:
        report = validator(**kwargs)
    except HorizonsNetworkError as exc:
        return (
            {
                "status": "skipped_network_unavailable",
                "endpoint": HORIZONS_API_URL,
                "tolerance_deg": None,
                "sample_count": None,
                "raw_responses": [],
                "max_sun_az_diff_deg": None,
                "max_sun_el_diff_deg": None,
                "max_earth_az_diff_deg": None,
                "max_earth_el_diff_deg": None,
                "notes": [
                    f"Horizons could not be reached (transport failure): {exc}",
                    "No comparison was performed; no Horizons validation artifact is kept for this dataset.",
                ],
            },
            None,
        )
    return horizons_provenance_from_report(report), report


def build_limitations(
    coverage: dict[str, Any],
    psr_criterion: PsrCriterion,
    psr_search_radius_m: float,
    psr_lattice_step_m: float,
    slope_baseline_m: float,
    slope_limit_deg: float,
    observer_height_m: float,
) -> list[str]:
    """Human-readable limitations written to ``provenance.limitations``."""
    return [
        (
            "Horizons are ray-marched up to 120 km along great circles of the 1737.4 km reference sphere on the "
            "LOLA 80 m/px DEM; features smaller than the grid (boulders, sub-80 m relief) need LROC NAC imagery "
            "before any touchdown assessment."
        ),
        window_limitation(coverage),
        (
            "Relay trajectories propagate two-body Keplerian motion anchored to the lunar equatorial frame at the "
            f"window start; Earth third-body and lunar gravity-field perturbations are excluded over the "
            f"{coverage['duration_days']:.1f}-day window."
        ),
        (
            "No atmospheric refraction exists on the Moon; solar panel degradation from dust/temperature is "
            "excluded at an unsourced baseline efficiency eta=0.28 and an unsourced 100 W survival load."
        ),
        (
            "Score fields are an ILLUSTRATIVE landing index: weights, blends and thresholds have no cited source and "
            "no sensitivity analysis. They are not a validated scientific ranking."
        ),
        (
            f"slope_deg is the gradient over a {slope_baseline_m:.0f} m baseline (central differences of +/-1 pixel); "
            f"it does not resolve lander-scale slopes. Points with slope above clps_slope_limit_deg = {slope_limit_deg:g} "
            "deg (an unsourced placeholder) are eliminated: landing score 0."
        ),
        (
            f"is_psr and psr_distance_m share one criterion: {psr_criterion.describe()}, using horizons computed at "
            f"{observer_height_m:g} m observer height (not ground level). PSR points are searched on a symmetric "
            f"{psr_lattice_step_m:g} m lattice within {psr_search_radius_m:g} m of each site center (flagged grid "
            "nodes included); psr_distance_m is null when no PSR point was found within that radius (unknown "
            "distance; it gets no proximity credit). Node distances only consider that lattice, so a closer PSR "
            "outside it can be missed."
        ),
        *RELAY_PRESET_LIMITATIONS,
        (
            "'Validated' for this dataset means conformance with navigator-dataset.v1.schema.json. The only "
            "external comparison is provenance.horizons_validation (Sun/Earth directions at one site)."
        ),
    ]


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
    *,
    horizons_tolerance_deg: float = DEFAULT_HORIZONS_TOLERANCE_DEG,
    horizons_step_size: str = "2 d",
    slope_limit_deg: float = DEFAULT_SLOPE_LIMIT_DEG,
    psr_criterion: PsrCriterion | None = None,
    psr_search_radius_m: float = DEFAULT_PSR_SEARCH_RADIUS_M,
    psr_lattice_step_m: float = DEFAULT_PSR_LATTICE_STEP_M,
    psr_lattice_az_step_deg: float | None = None,
    psr_lattice_ray_step_m: float | None = None,
    ephemeris_factory: Callable[[], Any] | None = None,
    horizons_validator: Callable[..., dict[str, Any]] | None = None,
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    """Execute the full topography + SPICE + comms + solar + score pipeline.

    Time window: ``start_utc``..``end_utc`` at ``step_seconds`` drives every series and summary.
    The default (30 days from 2026-11-15) starts at the most southern sub-solar latitude of the
    2026-27 cycle, i.e. the best illumination season; use at least one seasonal cycle (~346.6 d,
    e.g. ``end_utc="2027-11-15T00:00:00Z"``) for annual statistics; series become ~12x longer
    (whole dataset ~4x larger). The coverage is written to ``provenance.limitations``.

    ``ephemeris_factory`` (returns a context manager exposing ``moon_centered_ephemeris``,
    ``compute_topocentric_series`` and optionally ``provenance()``) and ``horizons_validator``
    exist for tests; by default the cached SPICE kernels and the live Horizons API are used.
    """
    if not (isinstance(slope_limit_deg, (int, float)) and math.isfinite(slope_limit_deg)):
        raise ValueError("slope_limit_deg must be a finite number (it is published in the contract).")
    if ephemeris_factory is None:
        ensure_assets(cache_dir, NAIF_KERNELS, allow_download=allow_download)

        def ephemeris_factory() -> SpiceLunarEphemeris:
            return SpiceLunarEphemeris(cache_dir, allow_download=allow_download)

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

    with ephemeris_factory() as spice_eph:
        moon_base = spice_eph.moon_centered_ephemeris(timestamps_utc, aberration="LT+S")
        lro_hr_base = spice_eph.moon_centered_ephemeris(lro_timestamps, aberration="LT+S")
        ephemeris_prov = (
            spice_eph.provenance()
            if hasattr(spice_eph, "provenance")
            else {
                "engine": EPHEMERIS_ENGINE_LABEL,
                "frame": EPHEMERIS_FRAME_LABEL,
                "correction": "LT+S",
                "kernels": [{"filename": k.filename, "url": k.url, "sha256": k.sha256} for k in NAIF_KERNELS],
            }
        )

        coverage = describe_window_coverage(timestamps_utc, step_seconds, np.asarray(moon_base["sun_pos_me_km"]))
        criterion = psr_criterion or PsrCriterion()
        if coverage["subsolar_lat_min_deg"] < criterion.subsolar_lat_extreme_deg:
            # Keep is_psr consistent with the computed window even if it exceeds the default envelope.
            criterion = replace(criterion, subsolar_lat_extreme_deg=coverage["subsolar_lat_min_deg"])

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
                psr_criterion=criterion,
                psr_search_radius_m=psr_search_radius_m,
                psr_lattice_step_m=psr_lattice_step_m,
                psr_lattice_az_step_deg=psr_lattice_az_step_deg,
                psr_lattice_ray_step_m=psr_lattice_ray_step_m,
                slope_limit_deg=slope_limit_deg,
            )
            for spec in sites
        ]

    horizons_report: dict[str, Any] | None = None
    if run_horizons_check:
        ref_site = site_entries[0]
        horizons_prov, horizons_report = run_horizons_validation_step(
            horizons_validator or validate_ephemeris_against_horizons,
            cache_dir=cache_dir,
            site_id=ref_site["id"],
            site_name=ref_site["name"],
            lat_deg=ref_site["center"]["latitude_deg"],
            lon_east_deg=ref_site["center"]["longitude_east_deg"],
            elevation_m=ref_site["center"]["elevation_m"],
            start_utc=timestamps_utc[0],
            stop_utc=timestamps_utc[-1],
            step_size=horizons_step_size,
            tolerance_deg=horizons_tolerance_deg,
        )
    else:
        horizons_prov = {
            "status": "not_requested",
            "endpoint": HORIZONS_API_URL,
            "tolerance_deg": None,
            "sample_count": None,
            "raw_responses": [],
            "max_sun_az_diff_deg": None,
            "max_sun_el_diff_deg": None,
            "max_earth_az_diff_deg": None,
            "max_earth_el_diff_deg": None,
            "notes": ["Horizons check skipped by caller flag; no comparison was performed."],
        }

    azimuths_list = [round(float(a), 3) for a in np.arange(0.0, 360.0, az_step_deg)]

    dataset: dict[str, Any] = {
        "schema_version": DATASET_SCHEMA_VERSION,
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "provenance": {
            "dem_product": dem_meta,
            "ephemeris": ephemeris_prov,
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
                "clps_slope_limit_deg": float(slope_limit_deg),
                "slope_baseline_m": float(dem.slope_baseline_m),
                "psr_search_radius_m": float(psr_search_radius_m),
                "psr_lattice_step_m": float(psr_lattice_step_m),
                "psr_subsolar_lat_extreme_deg": float(criterion.subsolar_lat_extreme_deg),
                "psr_solar_radius_deg": float(criterion.solar_radius_deg),
                "score_is_illustrative": True,
            },
            "limitations": build_limitations(
                coverage,
                criterion,
                psr_search_radius_m,
                psr_lattice_step_m,
                dem.slope_baseline_m,
                float(slope_limit_deg),
                observer_height_m,
            ),
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
            "seasonal_coverage": {
                "duration_days": round(float(coverage["duration_days"]), 6),
                "subsolar_lat_min_deg": round(float(coverage["subsolar_lat_min_deg"]), 5),
                "subsolar_lat_max_deg": round(float(coverage["subsolar_lat_max_deg"]), 5),
                "covers_seasonal_cycle": bool(coverage["covers_seasonal_cycle"]),
            },
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


def _check_horizons_consistency(dataset: dict[str, Any], horizons_report: dict[str, Any] | None) -> str:
    status = dataset["provenance"]["horizons_validation"]["status"]
    if status in _HORIZONS_STATUSES_WITH_REPORT:
        if horizons_report is None:
            raise ValueError(f"Dataset says Horizons status {status!r} but no comparison report was given.")
        if horizons_report.get("status") != status:
            raise ValueError(
                f"Horizons report status {horizons_report.get('status')!r} differs from dataset status {status!r}."
            )
    elif horizons_report is not None:
        raise ValueError(f"Dataset says Horizons status {status!r} but a comparison report was given.")
    return status


def serialize_outputs_dataset(dataset: dict[str, Any]) -> bytes:
    """Bytes of ``outputs/datasets/south_pole_precomputed.v1.json`` (indented, trailing newline)."""
    return (json.dumps(dataset, indent=2) + "\n").encode("utf-8")


def serialize_frontend_dataset(dataset: dict[str, Any]) -> bytes:
    """Bytes of the minified copy served by the frontend (``frontend/src/data``)."""
    return (json.dumps(dataset, separators=(",", ":")) + "\n").encode("utf-8")


def sha256_checksum_line(data: bytes, filename: str = FRONTEND_DATASET_FILENAME) -> str:
    """One ``sha256sum``-compatible line: ``<hex>  <filename>``."""
    import hashlib

    return f"{hashlib.sha256(data).hexdigest()}  {filename}\n"


def write_dataset_copies(repo_root: Path, dataset: dict[str, Any]) -> dict[str, Path]:
    """Write the outputs/ dataset, the frontend copy (same content) and the frontend copy's SHA-256."""
    datasets_dir = repo_root / "outputs" / "datasets"
    frontend_data_dir = repo_root / "frontend" / "src" / "data"
    for d in (datasets_dir, frontend_data_dir):
        d.mkdir(parents=True, exist_ok=True)
    dataset_path = datasets_dir / "south_pole_precomputed.v1.json"
    dataset_path.write_bytes(serialize_outputs_dataset(dataset))
    frontend_bytes = serialize_frontend_dataset(dataset)
    frontend_dataset_path = frontend_data_dir / FRONTEND_DATASET_FILENAME
    frontend_dataset_path.write_bytes(frontend_bytes)
    checksum_path = frontend_data_dir / FRONTEND_DATASET_CHECKSUM_FILENAME
    checksum_path.write_text(sha256_checksum_line(frontend_bytes), encoding="utf-8")
    return {"dataset": dataset_path, "frontend_dataset": frontend_dataset_path, "frontend_checksum": checksum_path}


def write_navigator_outputs(
    repo_root: Path,
    dataset: dict[str, Any],
    horizons_report: dict[str, Any] | None = None,
    psr_search_radius_m: float | None = None,
) -> dict[str, Path]:
    """Write the dataset copies, CSV/Markdown engineering reports and the Horizons evidence.

    When the run has no Horizons report (skipped or not requested), any previous
    ``horizons_cross_validation.json`` and raw responses are deleted so they cannot be read as
    evidence for the new dataset; the returned mapping lists them under ``removed_*`` keys.
    """
    _check_horizons_consistency(dataset, horizons_report)

    outputs_dir = repo_root / "outputs"
    reports_dir = outputs_dir / "reports"
    validation_dir = outputs_dir / "validation"
    for d in (reports_dir, validation_dir):
        d.mkdir(parents=True, exist_ok=True)

    # The frontend copy is served as a static asset and checked against its SHA-256 (docs/integration.md).
    written: dict[str, Path] = write_dataset_copies(repo_root, dataset)

    if horizons_report is not None:
        written.update(write_horizons_validation_artifacts(validation_dir, horizons_report))
    else:
        for i, removed in enumerate(remove_horizons_validation_artifacts(validation_dir)):
            written[f"removed_stale_horizons_{i}"] = removed

    conventions = dataset["provenance"]["conventions"]
    slope_limit = float(conventions["clps_slope_limit_deg"])
    if psr_search_radius_m is None:
        psr_search_radius_m = float(conventions.get("psr_search_radius_m", DEFAULT_PSR_SEARCH_RADIUS_M))

    def _psr_found(c: dict[str, Any]) -> bool:
        return bool(c["is_psr"]) or c["psr_distance_m"] is not None

    def _score_without_relay(site: dict[str, Any]) -> float:
        return float(site["engineering_summary"]["score"]["total_without_relay_0_100"])

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
        "slope_eliminated",
        "psr_distance_m",
        "psr_search_radius_m",
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
        "landing_score_without_relay",
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
                    "slope_eliminated": is_slope_eliminated(c["slope_deg"], slope_limit),
                    # Empty when no PSR was found within the search radius (null in the JSON).
                    "psr_distance_m": c["psr_distance_m"] if _psr_found(c) else "",
                    "psr_search_radius_m": psr_search_radius_m,
                    "is_psr": c["is_psr"],
                    **sol,
                    **{k: com[k] for k in fieldnames if k in com},
                    "landing_score_total": sc["total_0_100"],
                    "landing_score_without_relay": _score_without_relay(site),
                }
            )
    written["summary_csv"] = csv_path

    # Engineering Summary Markdown Report
    mw = dataset["mission_window"]
    step_label = f"{mw['step_seconds']} s step"
    md_lines = [
        "# Lunar South Pole Landing Site Engineering Summary",
        "",
        "> Landing scores are an ILLUSTRATIVE index (unsourced weights and thresholds), not a validated "
        "scientific ranking. Relay presets are hypothetical scenarios. See `provenance.limitations` in the dataset.",
        "",
        f"- **Generated (UTC)**: `{dataset['generated_utc']}`",
        f"- **Mission Window**: `{mw['start_utc']}` -> `{mw['end_utc']}` (`{len(mw['timestamps_utc'])}` epochs, {step_label}); illumination statistics are specific to this window",
        f"- **DEM Product**: `{dataset['provenance']['dem_product']['product_id']}` (`{dataset['provenance']['dem_product']['resolution_m']} m/px`, 120 km ray marching)",
        f"- **Ephemeris**: `{dataset['provenance']['ephemeris']['engine']}` in `{dataset['provenance']['ephemeris']['frame']}` (`{dataset['provenance']['ephemeris']['correction']}`)",
        f"- **JPL Horizons comparison**: `{dataset['provenance']['horizons_validation']['status']}`",
        f"- **Slope limit**: `{slope_limit:g}°` (unsourced placeholder; points above it score 0)",
        "",
        "| Rank | Site | Lat / Lon(E) | Slope (°) | PSR Dist (m) | Mean Illum (%) | Max Shadow (h) | DTE Full (%) | Combined DTE+ELFO (%) | Relay Gain (%) | Max Blackout Comb (h) | Score (/100) | Score w/o relay (/100) |",
        "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for rank, site in enumerate(sorted_sites, start=1):
        c = site["center"]
        sol = site["engineering_summary"]["solar"]
        com = site["engineering_summary"]["comms"]
        sc = site["engineering_summary"]["score"]
        if c["is_psr"]:
            psr_tag = "PSR"
        elif _psr_found(c):
            psr_tag = f"{c['psr_distance_m']:.0f}"
        else:
            psr_tag = f"none ≤ {psr_search_radius_m:.0f}"
        slope_tag = f"{c['slope_deg']:.2f}" + (" (eliminated)" if is_slope_eliminated(c["slope_deg"], slope_limit) else "")
        md_lines.append(
            f"| {rank} | {site['name']} | {c['latitude_deg']:.3f}, {c['longitude_east_deg']:.3f} | "
            f"{slope_tag} | {psr_tag} | {sol['mean_illum_fraction'] * 100:.1f} | "
            f"{sol['max_continuous_shadow_hours']:.1f} | {com['dte_full_disk_duty_cycle_pct']:.1f} | "
            f"{com['combined_dte_elfo_duty_cycle_pct']:.1f} | +{com['relay_coverage_gain_pct']:.1f} | "
            f"{com['max_blackout_combined_hours']:.1f} | **{sc['total_0_100']:.1f}** | {_score_without_relay(site):.1f} |"
        )
    md_lines.extend(["", "## Key Findings (illustrative index)", ""])
    best = sorted_sites[0]
    md_lines.append(
        f"- **Top-ranked by the illustrative index**: `{best['name']}` scores **{best['engineering_summary']['score']['total_0_100']:.1f}/100** "
        f"(slope `{best['center']['slope_deg']:.2f}°`, illumination `{best['engineering_summary']['solar']['mean_illum_fraction']*100:.1f}%` in this window, "
        f"DTE `{best['engineering_summary']['comms']['dte_full_disk_duty_cycle_pct']:.1f}%`, DTE+hypothetical ELFO `{best['engineering_summary']['comms']['combined_dte_elfo_duty_cycle_pct']:.1f}%`)."
    )
    psr_sites = [s for s in sorted_sites if s["center"]["is_psr"]]
    if psr_sites:
        p = psr_sites[0]
        md_lines.append(
            f"- **PSR contrast point**: `{p['name']}` has `{p['engineering_summary']['comms']['dte_full_disk_duty_cycle_pct']:.1f}%` DTE vs "
            f"`{p['engineering_summary']['comms']['combined_dte_elfo_duty_cycle_pct']:.1f}%` with the hypothetical ELFO constellation "
            f"(`+{p['engineering_summary']['comms']['relay_coverage_gain_pct']:.1f}%` line-of-sight availability)."
        )
    md_path = reports_dir / "site_engineering_summary.md"
    md_path.write_text("\n".join(md_lines) + "\n", encoding="utf-8")
    written["summary_md"] = md_path

    return written
