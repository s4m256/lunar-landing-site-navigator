"""Ephemeris regression against an independent DE421 reference (runs in CI, no network).

``fixtures/independent_de421_reference.json`` was produced WITHOUT the SPICE toolkit by
``fixtures/generate_independent_de421_reference.py`` from PyPI data (skyfield-data DE421 SPK;
lunarsky copies of the pinned NAIF lunar PCK/FK). These tests check implementation and
conventions (frames, time scales, LT+S, topocentric projection) of the engine and of the
committed dataset. They do not test DE421 against reality nor against JPL Horizons.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from lunar_science.navigator.data_sources import NAIF_KERNELS
from lunar_science.navigator.dem_horizon import selenographic_to_cartesian_me
from lunar_science.navigator.ephemeris import (
    SpiceLunarEphemeris,
    angular_separation_deg,
    cartesian_me_to_enu_az_el,
    subsolar_latitude_deg,
    topocentric_series_from_moon_centered,
    wrapped_angle_diff_deg,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = REPO_ROOT / "science" / ".cache"
FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "independent_de421_reference.json").read_text(encoding="utf-8"))
DATASET_PATH = REPO_ROOT / "outputs" / "datasets" / "south_pole_precomputed.v1.json"
HORIZONS_PATH = REPO_ROOT / "outputs" / "validation" / "horizons_cross_validation.json"
# The dataset stores angles rounded to 3 decimals: half a unit plus 1e-5 deg of model margin.
DATASET_ROUNDING_TOL_DEG = 0.0005 + 1e-5


def _fixture_base() -> dict:
    n = len(FIXTURE["timestamps_utc"])
    return {
        "timestamps_utc": FIXTURE["timestamps_utc"],
        "et_seconds": np.asarray(FIXTURE["et_seconds"]),
        "sun_pos_me_km": np.asarray(FIXTURE["sun_pos_me_km"]),
        "earth_pos_me_km": np.asarray(FIXTURE["earth_pos_me_km"]),
        "j2000_to_moon_me": np.tile(np.eye(3), (n, 1, 1)),
        "libration_sub_earth_lat_deg": np.zeros(n),
        "libration_sub_earth_lon_deg": np.zeros(n),
    }


def _has_cached_kernels() -> bool:
    return all((CACHE_DIR / asset.filename).is_file() for asset in NAIF_KERNELS)


def test_fixture_provenance_is_declared() -> None:
    pins = {k.filename: k.sha256 for k in NAIF_KERNELS}
    inputs = FIXTURE["inputs"]
    # Lunar orientation inputs are byte-identical to the pinned NAIF kernels; the SPK is not.
    assert inputs["bpc"]["sha256"] == pins["moon_pa_de421_1900-2050.bpc"]
    assert inputs["fk"]["sha256"] == pins["moon_080317.tf"]
    assert inputs["spk"]["sha256"] != pins["de421.bsp"]
    assert "skyfield-data" in inputs["spk"]["source"]
    assert len(FIXTURE["timestamps_utc"]) == 121
    assert "not DE421 accuracy" in FIXTURE["description"]


def test_engine_topocentric_projection_matches_independent_projection() -> None:
    site = FIXTURE["reference_site"]
    me = selenographic_to_cartesian_me(site["latitude_deg"], site["longitude_east_deg"], site["elevation_m"])
    series = topocentric_series_from_moon_centered(_fixture_base(), me, site["latitude_deg"], site["longitude_east_deg"])
    for key, az, el in (("sun", series.sun_az_deg, series.sun_el_deg), ("earth", series.earth_az_deg, series.earth_el_deg)):
        ref = site["independent_topocentric"][key]
        sep = angular_separation_deg(az, el, np.asarray(ref["az_deg"]), np.asarray(ref["el_deg"]))
        assert float(np.max(sep)) < 1e-9


def test_committed_sky_series_match_independent_de421_geometry() -> None:
    dataset = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    stamps = dataset["mission_window"]["timestamps_utc"]
    missing = [t for t in FIXTURE["timestamps_utc"] if t not in stamps]
    assert not missing, (
        "The committed dataset no longer contains the fixture epochs; regenerate "
        "tests/fixtures/independent_de421_reference.json for the new window."
    )
    idx = [stamps.index(t) for t in FIXTURE["timestamps_utc"]]
    base = _fixture_base()
    for site in dataset["sites"]:
        c = site["center"]
        me = selenographic_to_cartesian_me(c["latitude_deg"], c["longitude_east_deg"], c["elevation_m"])
        series = topocentric_series_from_moon_centered(base, me, c["latitude_deg"], c["longitude_east_deg"])
        sky = site["sky_series"]
        for key, az, el in (("sun", series.sun_az_deg, series.sun_el_deg), ("earth", series.earth_az_deg, series.earth_el_deg)):
            az_committed = np.asarray(sky[f"{key}_az_deg"])[idx]
            el_committed = np.asarray(sky[f"{key}_el_deg"])[idx]
            d_el = float(np.max(np.abs(el - el_committed)))
            d_az = float(np.max(np.abs(wrapped_angle_diff_deg(az, az_committed)) * np.cos(np.radians(el))))
            assert d_el <= DATASET_ROUNDING_TOL_DEG, (site["id"], key, d_el)
            assert d_az <= DATASET_ROUNDING_TOL_DEG, (site["id"], key, d_az)


def test_committed_horizons_artifact_spice_columns_match_independent_de421() -> None:
    """Checks the ``spice_*`` columns only; the ``horizons_*`` columns cannot be checked offline."""
    if not HORIZONS_PATH.exists():
        pytest.skip("No Horizons artifact: the comparison was not run for the committed dataset.")
    report = json.loads(HORIZONS_PATH.read_text(encoding="utf-8"))
    me = selenographic_to_cartesian_me(report["latitude_deg"], report["longitude_east_deg"], report["elevation_m"])
    series = topocentric_series_from_moon_centered(_fixture_base(), me, report["latitude_deg"], report["longitude_east_deg"])
    for key, az, el in (("sun_comparisons", series.sun_az_deg, series.sun_el_deg), ("earth_comparisons", series.earth_az_deg, series.earth_el_deg)):
        for row in report[key]:
            i = FIXTURE["timestamps_utc"].index(row["timestamp_utc"])
            sep = float(angular_separation_deg(az[i], el[i], row["spice_az_deg"], row["spice_el_deg"]))
            assert sep < 1e-5, (key, row["timestamp_utc"], sep)  # artifact rounds to 1e-5 deg


@pytest.mark.skipif(not _has_cached_kernels(), reason="Cached NAIF kernels not present (always the case in CI)")
def test_spice_engine_matches_independent_de421_reference() -> None:
    with SpiceLunarEphemeris(CACHE_DIR, allow_download=False) as eph:
        base = eph.moon_centered_ephemeris(FIXTURE["timestamps_utc"], aberration="LT+S")
    for key in ("sun_pos_me_km", "earth_pos_me_km"):
        a = np.asarray(base[key])
        b = np.asarray(FIXTURE[key])
        cos = np.sum(a * b, axis=1) / (np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1))
        sin = np.linalg.norm(np.cross(a, b), axis=1) / (np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1))
        assert float(np.max(np.degrees(np.arctan2(sin, cos)))) < 1e-6, key


def test_window_subsolar_latitude_documents_southern_summer() -> None:
    lat = subsolar_latitude_deg(np.asarray(FIXTURE["sun_pos_me_km"]))
    assert float(lat.min()) == pytest.approx(FIXTURE["window_subsolar_latitude_deg"]["min"], abs=1e-12)
    # Committed window: sub-solar latitude between about -1.557 and -1.372 deg (southern summer).
    assert -1.56 < float(lat.min()) < -1.55 and -1.38 < float(lat.max()) < -1.36


def test_target_at_sub_site_point_is_at_zenith_and_small_separations_are_resolved() -> None:
    for lat, lon in ((-89.45, 222.5), (-84.361, 31.889), (0.0, 0.0)):
        up = selenographic_to_cartesian_me(lat, lon, 0.0) / 1000.0
        _, el, _ = cartesian_me_to_enu_az_el(up * 3.0 - up, lat, lon)
        assert el == pytest.approx(90.0, abs=1e-9)
    # 1e-7 deg must not collapse to 0 (the arccos form quantizes near 1e-6 deg).
    assert float(angular_separation_deg(123.0, 1.2, 123.0, 1.2 + 1e-7)) == pytest.approx(1e-7, rel=1e-6)
