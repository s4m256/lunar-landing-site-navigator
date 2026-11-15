"""Known-case regression tests that need neither network access nor SPICE kernels.

Two groups:

1. Contract and physical invariants of the *committed* precomputed dataset
   (``outputs/datasets`` and its bundled copy in ``frontend/src/data``).
2. Analytical cases for pure functions of the engine (smooth-sphere horizon,
   solar-disk segment, Kepler, FSPL, ENU, scoring).

These tests check internal consistency only. They do not re-derive the dataset
from LOLA/SPICE and are not an independent scientific validation.

If a test fails because the committed data is wrong, do not relax the test:
mark it ``xfail(strict=True)`` with the reason and report it as a finding.
"""

from __future__ import annotations

import csv
import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pytest
from jsonschema import Draft7Validator

from lunar_science.navigator.comms import (
    ELFO_CONSTELLATION_PRESET,
    ELFO_PATHFINDER_PRESET,
    LRO_PRESET,
    check_segment_clears_moon,
    compute_fspl_db,
    interpolate_horizon_elev,
    max_blackout_duration_hours,
    propagate_kepler_lunar_inertial,
    solve_kepler_eccentric_anomaly,
)
from lunar_science.navigator.data_sources import (
    AU_IN_KM,
    EARTH_RADIUS_KM,
    LUNAR_REFERENCE_RADIUS_M,
    MOON_GM_KM3_S2,
    SOLAR_CONSTANT_1AU_W_M2,
    SOLAR_RADIUS_KM,
)
from lunar_science.navigator.dem_horizon import (
    LolaSouthPoleDem,
    max_solar_elevation_curve,
    selenographic_to_cartesian_me,
)
from lunar_science.navigator.ephemeris import (
    angular_separation_deg,
    build_utc_grid,
    cartesian_me_to_enu_az_el,
    enu_rotation_matrix,
)
from lunar_science.navigator.scoring import (
    DEFAULT_SCORE_WEIGHTS,
    compute_composite_landing_score,
    score_psr_proximity,
    score_slope_safety,
    score_solar_power,
)
from lunar_science.navigator.solar import (
    analyze_site_solar,
    compute_solar_illum_fraction,
    compute_solar_irradiance_w_m2,
    max_continuous_shadow_hours,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "contracts" / "navigator-dataset.v1.schema.json"
PACKAGED_SCHEMA_PATH = (
    REPO_ROOT / "science" / "src" / "lunar_science" / "schemas" / "navigator-dataset.v1.schema.json"
)
OUTPUT_DATASET_PATH = REPO_ROOT / "outputs" / "datasets" / "south_pole_precomputed.v1.json"
FRONTEND_DATASET_PATH = REPO_ROOT / "frontend" / "src" / "data" / "south_pole_precomputed.v1.json"
REPORT_CSV_PATH = REPO_ROOT / "outputs" / "reports" / "site_engineering_summary.csv"
HORIZONS_REPORT_PATH = REPO_ROOT / "outputs" / "validation" / "horizons_cross_validation.json"

# Maximum |sub-solar latitude| on the Moon and a generous bound for the
# sub-Earth latitude (optical libration in latitude ~6.7 deg plus topocentric
# parallax of the site, < 0.3 deg).
MAX_SUBSOLAR_LAT_DEG = 1.6
MAX_SUBEARTH_LAT_DEG = 7.5

AZ_SERIES_KEYS = ("sun_az_deg", "earth_az_deg", "elfo_primary_az_deg")
EL_SERIES_KEYS = ("sun_el_deg", "earth_el_deg", "elfo_primary_el_deg")


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _utc(text: str) -> datetime:
    return datetime.strptime(text, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


@pytest.fixture(scope="module")
def dataset() -> dict:
    return _load(OUTPUT_DATASET_PATH)


@pytest.fixture(scope="module")
def window_hours(dataset: dict) -> float:
    mw = dataset["mission_window"]
    return (_utc(mw["end_utc"]) - _utc(mw["start_utc"])).total_seconds() / 3600.0


def _sites(dataset: dict) -> list[dict]:
    return dataset["sites"]


# --------------------------------------------------------------------------
# 1. Committed dataset: contract
# --------------------------------------------------------------------------


@pytest.mark.parametrize("path", [OUTPUT_DATASET_PATH, FRONTEND_DATASET_PATH], ids=["outputs", "frontend"])
def test_committed_dataset_validates_against_normative_schema(path: Path) -> None:
    schema = _load(SCHEMA_PATH)
    Draft7Validator.check_schema(schema)
    errors = sorted(Draft7Validator(schema).iter_errors(_load(path)), key=lambda e: list(e.path))
    assert not errors, [f"{list(e.path)}: {e.message}" for e in errors[:5]]


def test_packaged_schema_copy_matches_contracts_schema() -> None:
    assert _load(PACKAGED_SCHEMA_PATH) == _load(SCHEMA_PATH)


def test_frontend_bundled_dataset_equals_outputs_dataset(dataset: dict) -> None:
    """The UI must show exactly the published artifact (only whitespace may differ)."""
    assert _load(FRONTEND_DATASET_PATH) == dataset


def test_site_ids_are_unique_and_grid_is_complete(dataset: dict) -> None:
    ids = [s["id"] for s in _sites(dataset)]
    assert len(ids) == len(set(ids))
    for site in _sites(dataset):
        grid = site["local_grid"]
        size, spacing = grid["grid_size"], grid["spacing_m"]
        half = size // 2
        cells = {(n["row"], n["col"]) for n in grid["nodes"]}
        assert cells == {(r, c) for r in range(size) for c in range(size)}, site["id"]
        for node in grid["nodes"]:
            assert node["dx_m"] == pytest.approx((node["col"] - half) * spacing)
            assert node["dy_m"] == pytest.approx((half - node["row"]) * spacing)
        centre = next(n for n in grid["nodes"] if (n["row"], n["col"]) == (half, half))
        assert centre["elevation_m"] == pytest.approx(site["center"]["elevation_m"], abs=0.01)
        assert centre["latitude_deg"] == pytest.approx(site["center"]["latitude_deg"], abs=1e-4)
        assert centre["horizon_elev_deg"] == site["horizon_elev_deg"]
        assert centre["is_psr"] == site["center"]["is_psr"]


# --------------------------------------------------------------------------
# 1. Committed dataset: grids, ranges and monotonic series
# --------------------------------------------------------------------------


def test_horizon_azimuth_grid_is_uniform_strictly_increasing_in_0_360(dataset: dict) -> None:
    az = np.asarray(dataset["horizon_azimuths_deg"])
    step = dataset["provenance"]["dem_product"]["azimuth_step_deg"]
    assert az[0] == 0.0
    assert np.all((az >= 0.0) & (az < 360.0))
    assert np.allclose(np.diff(az), step)
    assert len(az) == round(360.0 / step)
    for site in _sites(dataset):
        assert len(site["horizon_elev_deg"]) == len(az)
        assert all(len(n["horizon_elev_deg"]) == len(az) for n in site["local_grid"]["nodes"])


def test_timestamps_are_strictly_monotonic_and_match_window(dataset: dict) -> None:
    mw = dataset["mission_window"]
    stamps = [_utc(t) for t in mw["timestamps_utc"]]
    step = timedelta(seconds=mw["step_seconds"])
    assert all(b - a == step for a, b in zip(stamps, stamps[1:]))
    assert stamps[0] == _utc(mw["start_utc"])
    assert stamps[-1] == _utc(mw["end_utc"])
    n = len(stamps)
    for key in ("sun_dist_au", "earth_angular_radius_deg", "solar_angular_radius_deg"):
        assert len(mw[key]) == n, key
    for site in _sites(dataset):
        for key, series in site["sky_series"].items():
            assert len(series) == n, (site["id"], key)


def test_angles_are_within_physical_ranges(dataset: dict) -> None:
    for site in _sites(dataset):
        sky = site["sky_series"]
        for key in AZ_SERIES_KEYS:
            arr = np.asarray(sky[key])
            assert np.all((arr >= 0.0) & (arr < 360.0)), (site["id"], key)
        for key in EL_SERIES_KEYS:
            arr = np.asarray(sky[key])
            assert np.all((arr >= -90.0) & (arr <= 90.0)), (site["id"], key)
        horizons = [site["horizon_elev_deg"]] + [n["horizon_elev_deg"] for n in site["local_grid"]["nodes"]]
        for horizon in horizons:
            arr = np.asarray(horizon)
            assert np.all((arr >= -90.0) & (arr <= 90.0)), site["id"]
        centre = site["center"]
        assert -90.0 <= centre["latitude_deg"] <= -75.0
        assert 0.0 <= centre["longitude_east_deg"] < 360.0
        for node in site["local_grid"]["nodes"]:
            assert -90.0 <= node["latitude_deg"] <= -75.0
            assert 0.0 <= node["longitude_east_deg"] < 360.0


def test_illumination_duty_cycles_and_scores_are_bounded(dataset: dict) -> None:
    for site in _sites(dataset):
        summary = site["engineering_summary"]
        assert 0.0 <= summary["solar"]["mean_illum_fraction"] <= 1.0
        for key, value in summary["comms"].items():
            if key.endswith("_duty_cycle_pct"):
                assert 0.0 <= value <= 100.0, (site["id"], key)
        for key, value in summary["score"].items():
            assert 0.0 <= value <= 100.0, (site["id"], key)
        for node in site["local_grid"]["nodes"]:
            assert 0.0 <= node["mean_illum_fraction"] <= 1.0
            assert 0.0 <= node["landing_score_0_100"] <= 100.0
            assert 0.0 <= node["dte_full_disk_duty_cycle_pct"] <= 100.0
            assert 0.0 <= node["combined_dte_elfo_duty_cycle_pct"] <= 100.0


# --------------------------------------------------------------------------
# 1. Committed dataset: physical consistency
# --------------------------------------------------------------------------


def test_sun_distance_and_angular_radii_are_mutually_consistent(dataset: dict) -> None:
    mw = dataset["mission_window"]
    dist_au = np.asarray(mw["sun_dist_au"])
    assert np.all((dist_au > 0.975) & (dist_au < 1.025))
    expected = np.degrees(np.arcsin(SOLAR_RADIUS_KM / (dist_au * AU_IN_KM)))
    assert np.allclose(mw["solar_angular_radius_deg"], expected, atol=2e-5)
    # Earth seen from the Moon: radius 6378 km at 356 000..407 000 km.
    earth = np.asarray(mw["earth_angular_radius_deg"])
    lo = math.degrees(math.asin(EARTH_RADIUS_KM / 408_000.0))
    hi = math.degrees(math.asin(EARTH_RADIUS_KM / 354_000.0))
    assert np.all((earth > lo) & (earth < hi))


def test_sun_and_earth_elevations_respect_polar_geometry_bounds(dataset: dict) -> None:
    """At latitude phi a body with sub-point latitude |delta| <= d cannot rise above 90-|phi|+d."""
    for site in _sites(dataset):
        colat = 90.0 - abs(site["center"]["latitude_deg"])
        sky = site["sky_series"]
        assert max(np.abs(sky["sun_el_deg"])) <= colat + MAX_SUBSOLAR_LAT_DEG, site["id"]
        assert max(np.abs(sky["earth_el_deg"])) <= colat + MAX_SUBEARTH_LAT_DEG, site["id"]


def test_centre_cartesian_matches_selenographic_coordinates(dataset: dict) -> None:
    assert dataset["provenance"]["conventions"]["lunar_radius_m"] == LUNAR_REFERENCE_RADIUS_M
    for site in _sites(dataset):
        c = site["center"]
        xyz_km = selenographic_to_cartesian_me(c["latitude_deg"], c["longitude_east_deg"], c["elevation_m"]) / 1000.0
        assert np.allclose(c["cartesian_me_km"], xyz_km, atol=1e-3), site["id"]


def test_solar_summary_is_reproducible_from_published_series(dataset: dict) -> None:
    """Recompute the solar summary from the (rounded) published series and horizon mask."""
    mw = dataset["mission_window"]
    az = np.asarray(dataset["horizon_azimuths_deg"])
    for site in _sites(dataset):
        sky = site["sky_series"]
        recomputed = analyze_site_solar(
            sun_az_deg=np.asarray(sky["sun_az_deg"]),
            sun_el_deg=np.asarray(sky["sun_el_deg"]),
            sun_dist_au=np.asarray(mw["sun_dist_au"]),
            solar_angular_radius_deg=np.asarray(mw["solar_angular_radius_deg"]),
            horizon_az_deg=az,
            horizon_elev_deg=np.asarray(site["horizon_elev_deg"]),
            step_seconds=mw["step_seconds"],
        )["summary"]
        published = site["engineering_summary"]["solar"]
        assert recomputed["mean_illum_fraction"] == pytest.approx(published["mean_illum_fraction"], abs=2e-3)
        assert recomputed["sunlit_hours"] == pytest.approx(published["sunlit_hours"], abs=2.0)
        assert recomputed["max_continuous_shadow_hours"] == pytest.approx(
            published["max_continuous_shadow_hours"], abs=2.0
        )
        assert recomputed["energy_tracking_wh_m2"] == pytest.approx(published["energy_tracking_wh_m2"], rel=1e-3, abs=5)
        assert published["min_battery_100w_wh"] == pytest.approx(100.0 * published["max_continuous_shadow_hours"])


def test_dte_and_relay_summaries_are_reproducible_from_published_series(dataset: dict) -> None:
    mw = dataset["mission_window"]
    az = np.asarray(dataset["horizon_azimuths_deg"])
    earth_radius = np.asarray(mw["earth_angular_radius_deg"])
    step_h = mw["step_seconds"] / 3600.0
    for site in _sites(dataset):
        sky, comms = site["sky_series"], site["engineering_summary"]["comms"]
        horizon = interpolate_horizon_elev(np.asarray(sky["earth_az_deg"]), az, np.asarray(site["horizon_elev_deg"]))
        earth_el = np.asarray(sky["earth_el_deg"])
        centre = earth_el > horizon
        full = (earth_el - earth_radius) > horizon
        relay = np.asarray(sky["elfo_constellation_visible"], dtype=bool)
        one_sample_pct = 100.0 / len(earth_el)
        assert comms["dte_center_duty_cycle_pct"] == pytest.approx(centre.mean() * 100.0, abs=2 * one_sample_pct)
        assert comms["dte_full_disk_duty_cycle_pct"] == pytest.approx(full.mean() * 100.0, abs=2 * one_sample_pct)
        assert comms["elfo_constellation_duty_cycle_pct"] == pytest.approx(relay.mean() * 100.0, abs=0.01)
        assert comms["combined_dte_elfo_duty_cycle_pct"] == pytest.approx(
            (full | relay).mean() * 100.0, abs=2 * one_sample_pct
        )
        assert comms["max_blackout_dte_hours"] == pytest.approx(max_blackout_duration_hours(full, step_h), abs=2.0)
        # Ordering and derived quantities.
        assert comms["dte_full_disk_duty_cycle_pct"] <= comms["dte_center_duty_cycle_pct"]
        assert comms["elfo_pathfinder_duty_cycle_pct"] <= comms["elfo_constellation_duty_cycle_pct"]
        assert comms["combined_dte_elfo_duty_cycle_pct"] >= max(
            comms["dte_full_disk_duty_cycle_pct"], comms["elfo_constellation_duty_cycle_pct"]
        )
        assert comms["relay_coverage_gain_pct"] == pytest.approx(
            comms["combined_dte_elfo_duty_cycle_pct"] - comms["dte_full_disk_duty_cycle_pct"], abs=0.011
        )
        assert comms["max_blackout_combined_hours"] <= comms["max_blackout_dte_hours"]


def test_relay_series_respect_orbit_geometry(dataset: dict) -> None:
    preset = dataset["relay_presets"]["elfo_pathfinder"]
    for site in _sites(dataset):
        sky = site["sky_series"]
        alt = np.asarray(sky["elfo_primary_alt_km"])
        assert alt.min() >= preset["perilune_alt_km"] - 0.5
        assert alt.max() <= preset["apolune_alt_km"] + 0.5
        # Slant range to a satellite can never be shorter than its altitude above the site radius.
        site_alt_km = site["center"]["elevation_m"] / 1000.0
        assert np.all(np.asarray(sky["elfo_primary_range_km"]) >= alt - site_alt_km - 0.5)
        fspl = np.asarray(sky["elfo_constellation_best_fspl_db"])
        lo = compute_fspl_db(np.array([preset["perilune_alt_km"] - 10.0]), preset["freq_ghz"])[0]
        hi = compute_fspl_db(np.array([2.0 * (preset["apolune_alt_km"] + 1737.4)]), preset["freq_ghz"])[0]
        assert np.all((fspl > lo) & (fspl < hi))


def test_relay_presets_obey_kepler_third_law(dataset: dict) -> None:
    radius_km = LUNAR_REFERENCE_RADIUS_M / 1000.0
    for name, preset in dataset["relay_presets"].items():
        period_h = 2.0 * math.pi * math.sqrt(preset["a_km"] ** 3 / MOON_GM_KM3_S2) / 3600.0
        assert preset["period_hours"] == pytest.approx(period_h, abs=1e-3), name
        assert preset["apolune_alt_km"] == pytest.approx(preset["a_km"] * (1 + preset["e"]) - radius_km, abs=0.1)
        assert preset["perilune_alt_km"] == pytest.approx(preset["a_km"] * (1 - preset["e"]) - radius_km, abs=0.1)
        assert preset["perilune_alt_km"] > 0.0
    for key, obj in (("lro", LRO_PRESET), ("elfo_pathfinder", ELFO_PATHFINDER_PRESET), ("elfo_constellation", ELFO_CONSTELLATION_PRESET)):
        assert dataset["relay_presets"][key] == obj.to_contract_dict()


def test_published_scores_are_reproducible_from_published_inputs(dataset: dict) -> None:
    assert sum(DEFAULT_SCORE_WEIGHTS.values()) == pytest.approx(1.0)
    for site in _sites(dataset):
        c, summary = site["center"], site["engineering_summary"]
        score = compute_composite_landing_score(
            slope_deg=c["slope_deg"],
            mean_illum_fraction=summary["solar"]["mean_illum_fraction"],
            max_continuous_shadow_hours=summary["solar"]["max_continuous_shadow_hours"],
            dte_full_disk_duty_cycle_pct=summary["comms"]["dte_full_disk_duty_cycle_pct"],
            combined_dte_elfo_duty_cycle_pct=summary["comms"]["combined_dte_elfo_duty_cycle_pct"],
            psr_distance_m=c["psr_distance_m"],
            is_psr=c["is_psr"],
        )
        # Published slope is rounded to 0.01 deg => up to 0.04 on the slope sub-score.
        for key, value in score.items():
            assert summary["score"][key] == pytest.approx(value, abs=0.05), (site["id"], key)


def test_psr_classification_is_consistent_with_illumination(dataset: dict) -> None:
    for site in _sites(dataset):
        points = [(site["center"], site["engineering_summary"]["solar"]["mean_illum_fraction"])]
        points += [(n, n["mean_illum_fraction"]) for n in site["local_grid"]["nodes"]]
        for point, illum in points:
            if point["is_psr"]:
                assert illum == 0.0, site["id"]
                assert point["psr_distance_m"] == 0.0, site["id"]
            else:
                assert point["psr_distance_m"] > 0.0, site["id"]


def test_sunlit_hours_do_not_exceed_window(dataset: dict, window_hours: float) -> None:
    for site in _sites(dataset):
        solar = site["engineering_summary"]["solar"]
        assert 0.0 <= solar["sunlit_hours"] <= window_hours


@pytest.mark.xfail(
    strict=True,
    reason=(
        "ACHADO SPA-13: durações contínuas contam amostras (N=721) x passo em vez de intervalos, "
        "então sítios sempre sombreados/sem DTE publicam 721 h numa janela de 720 h "
        "(shackleton_psr_floor: max_continuous_shadow_hours, max_blackout_dte_hours, "
        "min_battery_100w_wh=72100; nós de grade PSR idem). Corrigir em solar.max_continuous_shadow_hours "
        "e comms.max_blackout_duration_hours e regenerar o dataset."
    ),
)
def test_continuous_durations_do_not_exceed_window(dataset: dict, window_hours: float) -> None:
    offenders = []
    for site in _sites(dataset):
        summary = site["engineering_summary"]
        values = {
            "max_continuous_shadow_hours": summary["solar"]["max_continuous_shadow_hours"],
            "max_blackout_dte_hours": summary["comms"]["max_blackout_dte_hours"],
            "max_blackout_combined_hours": summary["comms"]["max_blackout_combined_hours"],
        }
        for node in site["local_grid"]["nodes"]:
            values[f"node[{node['row']},{node['col']}].max_continuous_shadow_hours"] = node[
                "max_continuous_shadow_hours"
            ]
            values[f"node[{node['row']},{node['col']}].max_blackout_combined_hours"] = node[
                "max_blackout_combined_hours"
            ]
        offenders += [(site["id"], k, v) for k, v in values.items() if v > window_hours]
    assert not offenders, offenders[:5]


def test_csv_report_matches_dataset_and_is_ranked_by_score(dataset: dict) -> None:
    with REPORT_CSV_PATH.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    by_id = {s["id"]: s for s in _sites(dataset)}
    assert {r["site_id"] for r in rows} == set(by_id)
    totals = [float(r["landing_score_total"]) for r in rows]
    assert totals == sorted(totals, reverse=True)
    for row in rows:
        site = by_id[row["site_id"]]
        assert float(row["landing_score_total"]) == site["engineering_summary"]["score"]["total_0_100"]
        assert float(row["slope_deg"]) == site["center"]["slope_deg"]
        assert float(row["mean_illum_fraction"]) == site["engineering_summary"]["solar"]["mean_illum_fraction"]
        assert float(row["dte_full_disk_duty_cycle_pct"]) == (
            site["engineering_summary"]["comms"]["dte_full_disk_duty_cycle_pct"]
        )


def test_horizons_report_is_internally_consistent_with_dataset_provenance(dataset: dict) -> None:
    """Offline consistency only: this does NOT re-query JPL Horizons."""
    report = _load(HORIZONS_REPORT_PATH)
    sun, earth = report["sun_comparisons"], report["earth_comparisons"]
    assert len(sun) == len(earth) == report["sample_count"] > 0
    assert report["max_sun_angular_diff_deg"] == pytest.approx(max(c["angular_diff_deg"] for c in sun), abs=2e-6)
    assert report["max_earth_angular_diff_deg"] == pytest.approx(max(c["angular_diff_deg"] for c in earth), abs=2e-6)
    for comp in sun + earth:
        sep = float(
            angular_separation_deg(
                comp["spice_az_deg"], comp["spice_el_deg"], comp["horizons_az_deg"], comp["horizons_el_deg"]
            )
        )
        # Published az/el are rounded to 1e-5 deg.
        assert sep == pytest.approx(comp["angular_diff_deg"], abs=3e-5)
    site = next(s for s in _sites(dataset) if s["id"] == report["site_id"])
    stamps = dataset["mission_window"]["timestamps_utc"]
    for comp in sun:
        idx = stamps.index(comp["timestamp_utc"])
        assert site["sky_series"]["sun_az_deg"][idx] == pytest.approx(comp["spice_az_deg"], abs=1e-3)
        assert site["sky_series"]["sun_el_deg"][idx] == pytest.approx(comp["spice_el_deg"], abs=1e-3)
    for comp in earth:
        idx = stamps.index(comp["timestamp_utc"])
        assert site["sky_series"]["earth_az_deg"][idx] == pytest.approx(comp["spice_az_deg"], abs=1e-3)
        assert site["sky_series"]["earth_el_deg"][idx] == pytest.approx(comp["spice_el_deg"], abs=1e-3)


# --------------------------------------------------------------------------
# 2. Pure functions: analytical cases
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("observer_height_m", "grid_cells", "max_distance_m"),
    [(2.0, 401, 12_000.0), (1000.0, 2001, 75_000.0)],
)
@pytest.mark.parametrize(("lat_deg", "lon_deg"), [(-90.0, 0.0), (-89.9, 45.0)])
def test_smooth_sphere_horizon_equals_analytical_dip(
    observer_height_m: float, grid_cells: int, max_distance_m: float, lat_deg: float, lon_deg: float
) -> None:
    """On a featureless sphere the horizon is depressed by acos(R / (R + h)) in every azimuth."""
    dem = LolaSouthPoleDem.from_synthetic_array(np.zeros((grid_cells, grid_cells)), map_scale_m=80.0)
    radius = LUNAR_REFERENCE_RADIUS_M
    dip_deg = -math.degrees(math.acos(radius / (radius + observer_height_m)))
    # The tangent point must be inside the marched distance for the case to be meaningful.
    assert math.sqrt(2.0 * radius * observer_height_m) < max_distance_m
    az, horizon = dem.compute_horizon_profile(
        lat_deg, lon_deg, observer_height_m=observer_height_m, max_distance_m=max_distance_m, az_step_deg=30.0
    )
    assert np.all((az >= 0.0) & (az < 360.0))
    assert np.allclose(horizon, dip_deg, atol=1e-5)
    assert np.ptp(horizon) < 1e-9


def test_max_solar_elevation_envelope_known_values() -> None:
    az = np.array([0.0, 90.0, 180.0, 270.0])
    assert np.allclose(max_solar_elevation_curve(-90.0, az), 1.543, atol=1e-9)
    curve = max_solar_elevation_curve(-85.0, az)
    assert curve[0] == pytest.approx(5.0 + 1.543, abs=1e-6)  # towards the equator
    assert curve[2] == pytest.approx(1.543 - 5.0, abs=1e-6)  # across the pole
    assert curve[1] == pytest.approx(curve[3])


def test_solar_disk_fraction_analytical_values() -> None:
    radius = 0.27
    u = np.array([-2.0, -1.0, -0.5, 0.0, 0.5, 1.0, 2.0])
    frac = compute_solar_illum_fraction(u * radius, 0.0, radius)
    assert frac[0] == frac[1] == 0.0
    assert frac[3] == pytest.approx(0.5)
    assert frac[5] == frac[6] == 1.0
    assert np.all(np.diff(frac) >= 0.0)
    assert np.allclose(frac + frac[::-1], 1.0)
    # Circular segment at u = 0.5: 2/3 + sqrt(3)/(4 pi).
    assert frac[4] == pytest.approx(2.0 / 3.0 + math.sqrt(3.0) / (4.0 * math.pi))


def test_irradiance_follows_inverse_square_law() -> None:
    assert float(compute_solar_irradiance_w_m2(1.0)) == pytest.approx(SOLAR_CONSTANT_1AU_W_M2)
    assert float(compute_solar_irradiance_w_m2(2.0)) == pytest.approx(SOLAR_CONSTANT_1AU_W_M2 / 4.0)


def test_run_length_helpers_known_cases() -> None:
    assert max_continuous_shadow_hours(np.array([1, 0, 0, 0, 1, 0]), 1.0) == 3.0
    assert max_continuous_shadow_hours(np.array([1.0, 0.5, 1e-3]), 2.0) == 0.0
    assert max_blackout_duration_hours(np.array([True, False, False, True]), 0.5) == 1.0
    assert max_blackout_duration_hours(np.ones(5, dtype=bool), 1.0) == 0.0


def test_fspl_reference_values() -> None:
    assert float(compute_fspl_db(np.array([1.0]), 1.0)[0]) == pytest.approx(92.45, abs=0.01)
    near, far = compute_fspl_db(np.array([1000.0, 2000.0]), 2.25)
    assert far - near == pytest.approx(20.0 * math.log10(2.0))


def test_kepler_solver_and_propagation_known_cases() -> None:
    mean = np.linspace(0.0, 2.0 * math.pi, 73, endpoint=False)
    assert np.allclose(solve_kepler_eccentric_anomaly(mean, 0.0), mean)
    ecc = solve_kepler_eccentric_anomaly(mean, 0.58)
    assert np.allclose(ecc - 0.58 * np.sin(ecc), mean, atol=1e-9)

    a_km, e = 5740.0, 0.58
    period_s = 2.0 * math.pi * math.sqrt(a_km**3 / MOON_GM_KM3_S2)
    t = np.array([0.0, period_s / 2.0, period_s])
    pos = propagate_kepler_lunar_inertial(a_km, e, 57.8, 0.0, 90.0, 0.0, t)
    r = np.linalg.norm(pos, axis=1)
    assert r[0] == pytest.approx(a_km * (1 - e), rel=1e-9)  # perilune at M = 0
    assert r[1] == pytest.approx(a_km * (1 + e), rel=1e-9)  # apolune half a period later
    assert np.allclose(pos[2], pos[0], atol=1e-5)  # closed orbit
    # omega = +90 deg with apolune half a period later => apolune over the southern hemisphere.
    assert pos[1, 2] == pytest.approx(-a_km * (1 + e) * math.sin(math.radians(57.8)), rel=1e-9)

    circular = propagate_kepler_lunar_inertial(1787.4, 0.0, 90.0, 0.0, 0.0, 0.0, np.linspace(0, 7000, 50))
    assert np.allclose(np.linalg.norm(circular, axis=1), 1787.4)


def test_enu_frame_known_directions() -> None:
    for lat, lon in [(-89.45, 222.5), (-85.0, 0.0), (0.0, 90.0)]:
        rot = enu_rotation_matrix(lat, lon)
        assert np.allclose(rot @ rot.T, np.eye(3), atol=1e-12)
        assert np.linalg.det(rot) == pytest.approx(1.0)
        up = selenographic_to_cartesian_me(lat, lon, 0.0)
        _, el, rng = cartesian_me_to_enu_az_el(up / 1000.0, lat, lon)
        assert el == pytest.approx(90.0, abs=1e-5)
        assert rng == pytest.approx(LUNAR_REFERENCE_RADIUS_M / 1000.0)
    # From a southern site, the lunar north pole direction lies due north, the +Z axis elevation equals latitude.
    az, el, _ = cartesian_me_to_enu_az_el(np.array([0.0, 0.0, 1.0]), -85.0, 30.0)
    assert az == pytest.approx(0.0, abs=1e-9)
    assert el == pytest.approx(-85.0)
    assert np.allclose(selenographic_to_cartesian_me(-90.0, 0.0, 0.0), [0.0, 0.0, -LUNAR_REFERENCE_RADIUS_M], atol=1e-6)


def test_angular_separation_known_values() -> None:
    assert float(angular_separation_deg(0.0, 0.0, 90.0, 0.0)) == pytest.approx(90.0)
    assert float(angular_separation_deg(10.0, 90.0, 200.0, 90.0)) == pytest.approx(0.0, abs=1e-6)
    assert float(angular_separation_deg(359.0, 0.0, 1.0, 0.0)) == pytest.approx(2.0)


def test_horizon_interpolation_wraps_periodically() -> None:
    az = np.arange(0.0, 360.0, 90.0)
    el = np.array([0.0, 10.0, 20.0, 30.0])
    assert float(interpolate_horizon_elev(315.0, az, el)) == pytest.approx(15.0)
    assert float(interpolate_horizon_elev(360.0, az, el)) == pytest.approx(0.0)
    assert float(interpolate_horizon_elev(-45.0, az, el)) == pytest.approx(15.0)
    assert float(interpolate_horizon_elev(450.0, az, el)) == pytest.approx(10.0)


def test_moon_occultation_of_relay_to_earth_segment() -> None:
    earth = np.array([[384_400.0, 0.0, 0.0]])
    assert bool(check_segment_clears_moon(np.array([[5000.0, 0.0, 0.0]]), earth)[0])
    assert not bool(check_segment_clears_moon(np.array([[-5000.0, 0.0, 0.0]]), earth)[0])
    assert bool(check_segment_clears_moon(np.array([[0.0, 0.0, -5000.0]]), earth)[0])
    assert not bool(check_segment_clears_moon(np.array([[-5000.0, 0.0, -1000.0]]), earth)[0])


def test_utc_grid_is_inclusive_and_hourly() -> None:
    grid = build_utc_grid("2026-11-15T00:00:00Z", "2026-12-15T00:00:00Z", 1.0)
    assert len(grid) == 721
    assert grid[0] == "2026-11-15T00:00:00Z" and grid[-1] == "2026-12-15T00:00:00Z"
    with pytest.raises(ValueError):
        build_utc_grid("2026-11-15T00:00:00Z", "2026-11-16T00:00:00Z", 0.0)


def test_score_components_boundary_values() -> None:
    assert score_slope_safety(0.0) == score_slope_safety(2.0) == 100.0
    assert score_slope_safety(8.5) == pytest.approx(50.0)
    assert score_slope_safety(15.0) == score_slope_safety(40.0) == 0.0
    assert score_solar_power(1.0, 0.0) == pytest.approx(100.0)
    assert score_solar_power(0.0, 360.0) == 0.0
    assert score_solar_power(0.5, 180.0) == pytest.approx(50.0)
    assert score_psr_proximity(0.0, True) == 15.0
    assert score_psr_proximity(500.0, False) == 100.0
    assert score_psr_proximity(5000.0, False) == pytest.approx(20.0)
    assert score_psr_proximity(10_000.0, False) == 0.0
    best = compute_composite_landing_score(1.0, 1.0, 0.0, 100.0, 100.0, 400.0, False)
    worst = compute_composite_landing_score(30.0, 0.0, 720.0, 0.0, 0.0, 20_000.0, False)
    assert best["total_0_100"] == 100.0
    assert worst["total_0_100"] == 0.0
