"""Unit, physics, and contract tests for lunar_science.navigator."""

from __future__ import annotations

import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

from lunar_science.navigator.comms import (
    ELFO_CONSTELLATION_PRESET,
    check_segment_clears_moon,
    compute_fspl_db,
    interpolate_horizon_elev,
    max_blackout_duration_hours,
    propagate_kepler_lunar_inertial,
)
from lunar_science.navigator.data_sources import (
    DEFAULT_SOUTH_POLE_SITES,
    LUNAR_REFERENCE_RADIUS_M,
    NAIF_KERNELS,
    CandidateSiteSpec,
)
from lunar_science.navigator.dem_horizon import (
    LolaSouthPoleDem,
    parse_pds3_lbl,
    selenographic_to_cartesian_me,
)
from lunar_science.navigator.ephemeris import (
    angular_separation_deg,
    cartesian_me_to_enu_az_el,
    cross_check_skyfield_sun_earth,
    enu_rotation_matrix,
    SpiceLunarEphemeris,
)
from lunar_science.navigator.pipeline import run_navigator_pipeline, validate_dataset_schema
from lunar_science.navigator.scoring import compute_composite_landing_score
from lunar_science.navigator.solar import (
    analyze_site_solar,
    compute_solar_illum_fraction,
    compute_solar_irradiance_w_m2,
    max_continuous_shadow_hours,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = REPO_ROOT / "science" / ".cache"


def _has_cached_kernels() -> bool:
    return all((CACHE_DIR / asset.filename).is_file() for asset in NAIF_KERNELS)


def test_pds3_label_parser_and_projection_roundtrip(tmp_path: Path) -> None:
    sample_lbl = """
    RECORD_BYTES = 15200
    FILE_RECORDS = 7600
    LINE_SAMPLES = 7600
    LINES = 7600
    MAP_SCALE = 80 <m/pix>
    SAMPLE_PROJECTION_OFFSET = 3799.5
    LINE_PROJECTION_OFFSET = 3799.5
    SCALING_FACTOR = 0.5
    OFFSET = 1737400.0
    """
    lbl_file = tmp_path / "sample.lbl"
    lbl_file.write_text(sample_lbl, encoding="utf-8")
    meta = parse_pds3_lbl(lbl_file)
    assert meta.lines == 7600
    assert meta.line_samples == 7600
    assert meta.map_scale_m == pytest.approx(80.0)
    assert meta.scaling_factor == pytest.approx(0.5)

    dem = LolaSouthPoleDem.from_synthetic_array(np.zeros((101, 101), dtype=np.float32), map_scale_m=80.0)
    for lat_in, lon_in in [(-89.45, 222.5), (-86.0, 2.7), (-84.6, 31.0), (-88.15, 278.0)]:
        x, y = dem.latlon_to_xy_m(lat_in, lon_in)
        lat_out, lon_out = dem.xy_m_to_latlon(x, y)
        assert lat_out == pytest.approx(lat_in, abs=1e-7)
        assert ((lon_out - lon_in + 180.0) % 360.0 - 180.0) == pytest.approx(0.0, abs=1e-7)


def test_synthetic_slope_and_crater_horizon() -> None:
    # Planar tilted ramp rising Northward (+y in polar stereographic near pole) with slope arctan(0.2)
    n = 301
    half = n // 2
    scale_m = 100.0
    yy, xx = np.mgrid[0:n, 0:n]
    dy_m = (half - yy) * scale_m
    ramp = 0.2 * dy_m
    dem = LolaSouthPoleDem.from_synthetic_array(ramp, map_scale_m=scale_m)
    slope = dem.compute_slope_deg(-90.0, 0.0)
    expected_slope = math.degrees(math.atan(0.2))
    assert slope == pytest.approx(expected_slope, abs=0.05)

    # Bowl crater centered at pole: flat rim at +2000m outside r=2000m, flat floor at -1000m inside r=2000m
    n_c = 201
    half_c = n_c // 2
    yc, xc = np.mgrid[0:n_c, 0:n_c]
    r_m = np.hypot((xc - half_c) * 100.0, (half_c - yc) * 100.0)
    bowl = np.where(r_m <= 2000.0, -1000.0, 2000.0)
    dem_bowl = LolaSouthPoleDem.from_synthetic_array(bowl, map_scale_m=100.0)
    az, horiz = dem_bowl.compute_horizon_profile(
        -90.0, 0.0, observer_height_m=0.0, max_distance_m=6000.0, step_m=100.0, az_step_deg=5.0
    )
    # Rim rises 3000m over ~2100m distance -> atan(3000/2100) ~ 55 deg
    assert float(np.min(horiz)) > 50.0
    assert dem_bowl.is_site_psr(-90.0, horiz, az) is True


def test_enu_basis_and_solar_circular_segment() -> None:
    rot = enu_rotation_matrix(-85.0, 45.0)
    assert np.allclose(rot @ rot.T, np.eye(3), atol=1e-12)
    assert np.linalg.det(rot) == pytest.approx(1.0, abs=1e-12)

    site_vec = np.array([1.0, 0.0, 0.0])  # at 0 deg lat, 0 deg lon
    # Pure East unit displacement from (lat=0, lon=0) is +Y
    az_e, el_e, _ = cartesian_me_to_enu_az_el(np.array([0.0, 100.0, 0.0]), 0.0, 0.0)
    assert az_e == pytest.approx(90.0, abs=1e-6)
    assert el_e == pytest.approx(0.0, abs=1e-6)
    # Pure Up is +X at (0, 0)
    _, el_u, _ = cartesian_me_to_enu_az_el(site_vec * 100.0, 0.0, 0.0)
    assert el_u == pytest.approx(90.0, abs=1e-6)

    # Solar circular segment boundary checks
    delta_sun = 0.267
    f = compute_solar_illum_fraction(
        sun_el_deg=np.array([-1.0, -delta_sun, 0.0, 0.1, delta_sun, 1.5]),
        horizon_at_sun_az_deg=np.zeros(6),
        solar_angular_radius_deg=delta_sun,
    )
    assert f[0] == 0.0
    assert f[1] == 0.0
    assert f[2] == pytest.approx(0.5, abs=1e-9)
    assert 0.5 < f[3] < 1.0
    assert f[4] == 1.0
    assert f[5] == 1.0

    # Irradiance inversely proportional to d^2
    assert compute_solar_irradiance_w_m2(1.0) == pytest.approx(1361.0, abs=1e-9)
    assert compute_solar_irradiance_w_m2(2.0) == pytest.approx(1361.0 / 4.0, abs=1e-9)

    # Shadow run and panel comparison
    assert max_continuous_shadow_hours(np.array([1.0, 0.0, 0.0, 0.0, 0.5, 0.0]), 1.0) == 3.0
    solar_out = analyze_site_solar(
        sun_az_deg=np.linspace(0.0, 360.0, 121),
        sun_el_deg=np.full(121, 1.2),
        sun_dist_au=np.ones(121),
        solar_angular_radius_deg=np.full(121, 0.267),
        horizon_az_deg=np.arange(0.0, 360.0, 5.0),
        horizon_elev_deg=np.zeros(72),
        step_seconds=3600,
    )
    s_sum = solar_out["summary"]
    assert s_sum["mean_illum_fraction"] == pytest.approx(1.0)
    assert s_sum["energy_tracking_wh_m2"] > s_sum["energy_fixed_north_wh_m2"]
    assert s_sum["energy_fixed_north_wh_m2"] > s_sum["energy_fixed_horiz_wh_m2"]


def test_relay_occultation_kepler_and_fspl() -> None:
    earth_pos = np.array([[384_400.0, 0.0, 0.0], [384_400.0, 0.0, 0.0], [384_400.0, 0.0, 0.0]])
    sat_pos = np.array(
        [
            [-3000.0, 0.0, 0.0],  # Behind Moon -> occulted
            [3000.0, 0.0, 0.0],   # In front of Moon -> clear
            [0.0, 0.0, -7000.0],  # South polar apolune -> clear
        ]
    )
    clear = check_segment_clears_moon(sat_pos, earth_pos)
    assert list(clear) == [False, True, True]

    # ELFO apolune over South Pole (omega=90 deg, m0=180 deg -> r_z < 0 at t=0)
    pos = propagate_kepler_lunar_inertial(
        a_km=ELFO_CONSTELLATION_PRESET.a_km,
        e=ELFO_CONSTELLATION_PRESET.e,
        i_deg=ELFO_CONSTELLATION_PRESET.i_deg,
        raan_deg=0.0,
        omega_deg=90.0,
        m0_deg=180.0,
        dt_seconds=np.array([0.0]),
    )
    r_km = float(np.linalg.norm(pos[0]))
    assert r_km == pytest.approx(5740.0 * (1.0 + 0.58), abs=1e-6)
    assert pos[0, 2] < -6000.0  # Over Southern hemisphere

    assert max_blackout_duration_hours(np.array([True, False, False, True, False]), 2.0) == 4.0
    fspl = float(compute_fspl_db(np.array([5000.0]), 2.25)[0])
    assert 170.0 < fspl < 180.0
    assert float(interpolate_horizon_elev(359.5, np.array([0.0, 180.0]), np.array([2.0, -2.0]))) == pytest.approx(1.988888, abs=1e-4)


def test_landing_score_tradeoffs() -> None:
    ideal = compute_composite_landing_score(
        slope_deg=2.0,
        mean_illum_fraction=0.85,
        max_continuous_shadow_hours=36.0,
        dte_full_disk_duty_cycle_pct=60.0,
        combined_dte_elfo_duty_cycle_pct=99.0,
        psr_distance_m=450.0,
        is_psr=False,
    )
    steep = compute_composite_landing_score(
        slope_deg=16.0,
        mean_illum_fraction=0.85,
        max_continuous_shadow_hours=36.0,
        dte_full_disk_duty_cycle_pct=60.0,
        combined_dte_elfo_duty_cycle_pct=99.0,
        psr_distance_m=450.0,
        is_psr=False,
    )
    psr_no_relay = compute_composite_landing_score(
        slope_deg=4.0,
        mean_illum_fraction=0.0,
        max_continuous_shadow_hours=720.0,
        dte_full_disk_duty_cycle_pct=0.0,
        combined_dte_elfo_duty_cycle_pct=96.0,
        psr_distance_m=0.0,
        is_psr=True,
        use_relay=False,
    )
    psr_with_relay = compute_composite_landing_score(
        slope_deg=4.0,
        mean_illum_fraction=0.0,
        max_continuous_shadow_hours=720.0,
        dte_full_disk_duty_cycle_pct=0.0,
        combined_dte_elfo_duty_cycle_pct=96.0,
        psr_distance_m=0.0,
        is_psr=True,
        use_relay=True,
    )
    assert 0.0 <= ideal["total_0_100"] <= 100.0
    assert steep["safety_slope_0_100"] == 0.0
    assert ideal["total_0_100"] > steep["total_0_100"]
    assert psr_with_relay["comms_0_100"] > psr_no_relay["comms_0_100"]
    assert psr_with_relay["science_psr_0_100"] < ideal["science_psr_0_100"]


@pytest.mark.skipif(not _has_cached_kernels(), reason="Cached NAIF kernels not present")
def test_spice_vs_skyfield_and_mini_pipeline_contract() -> None:
    timestamps = ["2026-11-15T00:00:00Z", "2026-11-29T12:00:00Z"]
    site_me = selenographic_to_cartesian_me(-89.45, 222.5, 1400.0)
    with SpiceLunarEphemeris(CACHE_DIR, allow_download=False) as eph:
        spice_res = eph.compute_topocentric_series(site_me, -89.45, 222.5, timestamps)
    sky_res = cross_check_skyfield_sun_earth(CACHE_DIR, -89.45, 222.5, 1400.0, timestamps)

    for i in range(len(timestamps)):
        sun_sep = float(
            angular_separation_deg(
                spice_res.sun_az_deg[i],
                spice_res.sun_el_deg[i],
                sky_res["sun_az_deg"][i],
                sky_res["sun_el_deg"][i],
            )
        )
        earth_sep = float(
            angular_separation_deg(
                spice_res.earth_az_deg[i],
                spice_res.earth_el_deg[i],
                sky_res["earth_az_deg"][i],
                sky_res["earth_el_deg"][i],
            )
        )
        assert sun_sep < 0.005
        assert earth_sep < 0.005

    # Mini end-to-end pipeline contract validation on synthetic DEM + real SPICE kernels
    synth_dem = LolaSouthPoleDem.from_synthetic_array(np.zeros((201, 201), dtype=np.float32), map_scale_m=200.0)
    mini_sites = (
        CandidateSiteSpec(
            site_id="test_pole_a",
            name="Test Pole A",
            category="reference_ridge",
            latitude_deg=-89.8,
            longitude_east_deg=0.0,
            description="Synthetic flat polar plateau.",
        ),
        CandidateSiteSpec(
            site_id="test_pole_b",
            name="Test Pole B",
            category="artemis_candidate",
            latitude_deg=-89.8,
            longitude_east_deg=180.0,
            description="Synthetic far-side polar site.",
        ),
    )
    dataset, _ = run_navigator_pipeline(
        cache_dir=CACHE_DIR,
        sites=mini_sites,
        start_utc="2026-11-15T00:00:00Z",
        end_utc="2026-11-16T00:00:00Z",
        step_seconds=3600,
        az_step_deg=5.0,
        grid_spacing_m=500.0,
        grid_size=3,
        allow_download=False,
        run_horizons_check=False,
        dem_override=synth_dem,
    )
    validate_dataset_schema(dataset)
    assert len(dataset["sites"]) == 2


def test_cli_no_args_smoke_keeps_status_contract() -> None:
    proc = subprocess.run(
        [sys.executable, "-m", "lunar_science"],
        capture_output=True,
        text=True,
        check=True,
    )
    payload = json.loads(proc.stdout.strip())
    assert payload["schema_version"] == "1.0.0"
    assert payload["status"] == "not_implemented"


def test_committed_precomputed_outputs_conform_to_schema() -> None:
    dataset_path = REPO_ROOT / "outputs" / "datasets" / "south_pole_precomputed.v1.json"
    frontend_path = REPO_ROOT / "frontend" / "src" / "data" / "south_pole_precomputed.v1.json"
    horizons_path = REPO_ROOT / "outputs" / "validation" / "horizons_cross_validation.json"

    assert dataset_path.is_file(), "Expected precomputed dataset in outputs/datasets/"
    assert frontend_path.is_file(), "Expected bundled dataset in frontend/src/data/"
    assert horizons_path.is_file(), "Expected Horizons validation report in outputs/validation/"

    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    validate_dataset_schema(dataset)
    assert len(dataset["sites"]) == 10
    assert dataset["provenance"]["horizons_validation"]["status"] == "verified"

    by_id = {s["id"]: s for s in dataset["sites"]}
    assert by_id["shackleton_psr_floor"]["center"]["is_psr"] is True
    assert by_id["shackleton_psr_floor"]["engineering_summary"]["solar"]["mean_illum_fraction"] == 0.0
    assert by_id["shackleton_psr_floor"]["engineering_summary"]["comms"]["dte_full_disk_duty_cycle_pct"] == 0.0
    assert by_id["shackleton_psr_floor"]["engineering_summary"]["comms"]["relay_coverage_gain_pct"] > 90.0

    horizons = json.loads(horizons_path.read_text(encoding="utf-8"))
    assert horizons["max_sun_angular_diff_deg"] < 0.005
    assert horizons["max_earth_angular_diff_deg"] < 0.005
