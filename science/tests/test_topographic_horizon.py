"""Analytic/synthetic checks ONLY. These fixtures are never exported as LOLA data."""
import math

import numpy as np
import pytest

from lunar_science.topographic_horizon import TerrainUnavailable, ray_destination, ray_horizon_profile

R = 1_737_400.0


def profile(surface, azimuths=(0.0,), distances=(1000.0,), height=0.0, latitude=0.0, longitude=0.0):
    return ray_horizon_profile(latitude, longitude, height, azimuths, distances, surface, R)


def test_flat_sphere_ground_level_matches_exact_curvature():
    distances = [80.0, 160.0, 240.0]
    # At h=0, elevation of each sphere sample is exactly -psi/2; nearest wins.
    actual = profile(lambda lat, lon: 0.0, (0.0, 90.0, 180.0, 270.0), distances)
    assert actual == pytest.approx(np.full(4, -math.degrees(distances[0]/R/2)), abs=1e-11)


def test_smooth_sphere_observer_dip_and_radial_convergence():
    analytic_dip = -math.degrees(math.acos(R/(R+2.0)))
    errors = []
    for step in (320.0, 160.0, 80.0, 40.0):
        value = profile(lambda lat, lon: 0.0, distances=np.arange(step, 12000.1, step), height=2.0)[0]
        errors.append(abs(value-analytic_dip))
    assert all(later <= earlier + 1e-12 for earlier, later in zip(errors, errors[1:]))
    assert errors[-1] < 1e-5


def test_known_mountain_height_and_range():
    # Origin at equator; positive latitude puts a 100m ridge exactly 1000m north.
    mountain_lat = math.degrees(1000.0/R)
    def synthetic(lat, lon):
        return 100.0 if abs(lat-mountain_lat) < 1e-8 and abs(lon) < 1e-8 else 0.0
    value = profile(synthetic)[0]
    psi = 1000.0/R
    expected = math.degrees(math.atan2((R+100)*math.cos(psi)-R, (R+100)*math.sin(psi)))
    assert value == pytest.approx(expected, abs=1e-10)


def test_known_crater_rim_is_azimuth_symmetric_at_south_pole():
    # Synthetic floor at -100m, rim at 0m, 1000m from the pole.
    def crater(lat, lon):
        return -100.0 if lat == -90 else 0.0
    actual = profile(crater, (0.0, 90.0, 180.0, 270.0), latitude=-90.0)
    psi = 1000.0/R
    expected = math.degrees(math.atan2(R*math.cos(psi)-(R-100), R*math.sin(psi)))
    assert actual == pytest.approx(np.full(4, expected), abs=1e-10)


def test_cardinal_azimuth_longitude_wrap_and_polar_meridian():
    north = ray_destination(0, 0, 0, 1000)
    east = ray_destination(0, 0, 90, 1000)
    assert north[0] == pytest.approx(math.degrees(1000/R))
    assert north[1] == pytest.approx(0)
    assert east[0] == pytest.approx(0, abs=1e-12)
    assert east[1] == pytest.approx(math.degrees(1000/R))
    wrapped = ray_destination(0, 359.99, 90, 1000)
    assert wrapped[1] == pytest.approx((359.99+math.degrees(1000/R)) % 360)
    assert ray_destination(-90, 45, 0, 1000)[1] == pytest.approx(45)
    assert ray_destination(-90, 45, 90, 1000)[1] == pytest.approx(135)


def test_angular_convergence_resolves_known_narrow_mountain():
    # A 100m peak at bearing 10°. Coarse 20° rays miss it, 10° and 5° resolve it.
    def synthetic(lat, lon):
        if abs(lat) < 1e-12 and abs(lon) < 1e-12:
            return 0.0
        bearing = math.degrees(math.atan2(math.radians(lon), math.radians(lat))) % 360
        return 100.0 if abs(bearing-10.0) < 0.01 else 0.0
    maxima = [float(np.max(profile(synthetic, np.arange(0, 40, step)))) for step in (20, 10, 5)]
    assert maxima[0] < 0
    assert maxima[1] > 5
    assert maxima[2] == pytest.approx(maxima[1])


@pytest.mark.parametrize('missing', [None, float('nan'), float('inf')])
def test_missing_origin_or_ray_fails_closed(missing):
    with pytest.raises(TerrainUnavailable):
        profile(lambda lat, lon: missing)
    with pytest.raises(TerrainUnavailable):
        profile(lambda lat, lon: 0.0 if lat == 0 else missing)


def test_explicit_coverage_error_propagates_instead_of_clipping():
    def bounded(lat, lon):
        if lat > 0.01:
            raise TerrainUnavailable('outside coverage/border')
        return 0.0
    with pytest.raises(TerrainUnavailable, match='outside coverage'):
        profile(bounded, distances=[1000, 2000])


@pytest.mark.parametrize('latitude,longitude', [(91,0),(-91,0),(0,-1),(0,360),(float('nan'),0)])
def test_invalid_coordinates_rejected(latitude, longitude):
    with pytest.raises(ValueError):
        ray_destination(latitude, longitude, 0, 1000)


@pytest.mark.parametrize('height', [-1, float('inf'), float('nan')])
def test_invalid_observer_height_rejected(height):
    with pytest.raises(ValueError):
        profile(lambda lat, lon: 0.0, height=height)


@pytest.mark.parametrize('azimuths,distances', [([], [1]), ([0, 360], [1]), ([90, 0], [1]), ([0], []), ([0], [0]), ([0], [2, 1]), ([0], [math.pi*R])])
def test_invalid_sampling_grid_rejected(azimuths, distances):
    with pytest.raises(ValueError):
        profile(lambda lat, lon: 0.0, azimuths, distances)
