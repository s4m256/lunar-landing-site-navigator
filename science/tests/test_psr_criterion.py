"""Single PSR criterion, ephemeris-derived solar envelope and declared slope baseline.

The envelope cross-check is analytic; the DE421 extreme comes from the independent fixture
(``fixtures/independent_de421_reference.json``). DEMs here are SYNTHETIC.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pytest

from lunar_science.navigator.dem_horizon import (
    DE421_SUBSOLAR_LAT_SOUTH_EXTREME_DEG,
    MAX_SOLAR_ANGULAR_RADIUS_DEG,
    LolaSouthPoleDem,
    PsrCriterion,
    is_permanently_shadowed,
    max_solar_elevation_curve,
)
from lunar_science.navigator.ephemeris import cartesian_me_to_enu_az_el, subsolar_latitude_deg

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "independent_de421_reference.json").read_text(encoding="utf-8"))


def test_single_psr_criterion_includes_solar_radius_and_envelope() -> None:
    az = np.arange(0.0, 360.0, 10.0)
    envelope = max_solar_elevation_curve(-89.45, az)
    crit = PsrCriterion()
    dem = LolaSouthPoleDem.from_synthetic_array(np.zeros((11, 11)), map_scale_m=80.0)
    just_below = envelope + MAX_SOLAR_ANGULAR_RADIUS_DEG - 1e-6
    at_top_limb = envelope + MAX_SOLAR_ANGULAR_RADIUS_DEG
    assert not is_permanently_shadowed(-89.45, az, just_below, crit)
    assert is_permanently_shadowed(-89.45, az, at_top_limb, crit)
    # The DEM method is the same function, not a second criterion.
    assert dem.is_site_psr(-89.45, at_top_limb, az) is True
    assert dem.is_site_psr(-89.45, just_below, az) is False
    # A more southern sub-solar latitude raises the envelope.
    stricter = PsrCriterion(subsolar_lat_extreme_deg=-1.7)
    assert not is_permanently_shadowed(-89.45, az, at_top_limb, stricter)


def test_default_psr_envelope_bounds_the_de421_extreme() -> None:
    extreme = FIXTURE["subsolar_latitude_extremes_1900_2050"]["min_deg"]
    assert DE421_SUBSOLAR_LAT_SOUTH_EXTREME_DEG <= extreme < DE421_SUBSOLAR_LAT_SOUTH_EXTREME_DEG + 1e-3
    assert PsrCriterion().subsolar_lat_extreme_deg == DE421_SUBSOLAR_LAT_SOUTH_EXTREME_DEG
    # The old fixed -1.543 deg was already exceeded inside the committed window.
    window_min = float(subsolar_latitude_deg(np.asarray(FIXTURE["sun_pos_me_km"])).min())
    assert window_min < -1.543
    assert DE421_SUBSOLAR_LAT_SOUTH_EXTREME_DEG < window_min


@pytest.mark.parametrize("site_lat", [-89.45, -86.0, -83.7])
@pytest.mark.parametrize("subsolar_lat", [-1.591, -1.0, 0.5])
def test_solar_envelope_formula_matches_enu_projection(site_lat: float, subsolar_lat: float) -> None:
    """Analytic cross-check of two code paths: envelope formula vs ENU projection of a Sun direction."""
    site_lon = 37.0
    for sub_lon in np.arange(0.0, 360.0, 15.0):
        d, lon = math.radians(subsolar_lat), math.radians(sub_lon)
        sun_dir = np.array([math.cos(d) * math.cos(lon), math.cos(d) * math.sin(lon), math.sin(d)])
        az, el, _ = cartesian_me_to_enu_az_el(sun_dir, site_lat, site_lon)
        expected = float(max_solar_elevation_curve(site_lat, np.array([az]), subsolar_lat_deg=subsolar_lat)[0])
        assert el == pytest.approx(expected, abs=1e-9)


def test_slope_baseline_is_declared_as_two_pixels() -> None:
    assert LolaSouthPoleDem.from_synthetic_array(np.zeros((11, 11)), map_scale_m=80.0).slope_baseline_m == 160.0
    assert LolaSouthPoleDem.from_synthetic_array(np.zeros((11, 11)), map_scale_m=200.0).slope_baseline_m == 400.0


def test_standalone_psr_search_returns_none_instead_of_radius() -> None:
    dem = LolaSouthPoleDem.from_synthetic_array(np.zeros((101, 101)), map_scale_m=200.0)
    assert dem.estimate_nearest_psr_distance_m(-89.8, 0.0, search_radius_m=1000.0, coarse_step_m=500.0) is None
