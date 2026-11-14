"""Small spherical ray sampler, NOT a LOLA reader or a validated lunar terrain product.

A future DEM adapter must first establish projection, datum/frame, pixel validity and
coverage. Its callback must return None (or raise TerrainUnavailable) for every
nodata/out-of-coverage query; this module never clips or invents elevations.
"""
from collections.abc import Callable, Sequence
import math

import numpy as np


class TerrainUnavailable(ValueError):
    """A required terrain query is unavailable or invalid; no profile is returned."""


def _coordinate(latitude_deg: float, longitude_east_deg: float) -> None:
    if not math.isfinite(latitude_deg) or not -90 <= latitude_deg <= 90:
        raise ValueError('Planetocentric latitude must be finite in [-90,90]')
    if not math.isfinite(longitude_east_deg) or not 0 <= longitude_east_deg < 360:
        raise ValueError('East longitude must be finite in [0,360)')


def ray_destination(latitude_deg: float, longitude_east_deg: float,
                    azimuth_deg: float, distance_m: float,
                    radius_m: float = 1_737_400.0) -> tuple[float, float]:
    """Great-circle destination; azimuth clockwise from local north, east=90°.

    The supplied longitude defines the meridian at a geographic pole. Distance
    follows the reference sphere, not a measured topographic path.
    """
    _coordinate(latitude_deg, longitude_east_deg)
    if not math.isfinite(radius_m) or radius_m <= 0:
        raise ValueError('Reference radius must be positive and finite')
    if not math.isfinite(distance_m) or not 0 <= distance_m < math.pi * radius_m:
        raise ValueError('Distance must be finite in [0, pi*radius)')
    if not math.isfinite(azimuth_deg) or not 0 <= azimuth_deg < 360:
        raise ValueError('Azimuth must be finite in [0,360)')
    # A Cartesian tangent basis remains stable at the poles.
    latitude, longitude, azimuth = map(math.radians, (latitude_deg, longitude_east_deg, azimuth_deg))
    up = np.array([math.cos(latitude)*math.cos(longitude), math.cos(latitude)*math.sin(longitude), math.sin(latitude)])
    north = np.array([-math.sin(latitude)*math.cos(longitude), -math.sin(latitude)*math.sin(longitude), math.cos(latitude)])
    east = np.array([-math.sin(longitude), math.cos(longitude), 0.0])
    angular_distance = distance_m / radius_m
    vector = up*math.cos(angular_distance) + (north*math.cos(azimuth) + east*math.sin(azimuth))*math.sin(angular_distance)
    return (math.degrees(math.atan2(float(vector[2]), math.hypot(float(vector[0]), float(vector[1])))),
            math.degrees(math.atan2(float(vector[1]), float(vector[0]))) % 360)


def ray_horizon_profile(latitude_deg: float, longitude_east_deg: float,
                        observer_height_m: float, azimuths_deg: Sequence[float],
                        distances_m: Sequence[float],
                        elevation_at: Callable[[float, float], float | None],
                        radius_m: float = 1_737_400.0) -> np.ndarray:
    """Maximum sampled terrain elevation angle for each requested ray.

    Elevations are radial meters above the same reference sphere. Observer height
    is meters above the terrain at the origin, which is queried separately.
    The function returns no profile if ANY requested query is missing. A profile
    covers only its supplied distances/azimuths: convergence and far coverage
    must be assessed separately before physical interpretation.
    """
    _coordinate(latitude_deg, longitude_east_deg)
    if not math.isfinite(radius_m) or radius_m <= 0:
        raise ValueError('Reference radius must be positive and finite')
    if not math.isfinite(observer_height_m) or observer_height_m < 0:
        raise ValueError('Observer height must be finite and nonnegative')
    azimuths = np.asarray(azimuths_deg, dtype=float)
    distances = np.asarray(distances_m, dtype=float)
    if azimuths.ndim != 1 or len(azimuths) == 0 or not np.all(np.isfinite(azimuths)) or np.any(azimuths < 0) or np.any(azimuths >= 360) or np.any(np.diff(azimuths) <= 0):
        raise ValueError('Azimuths must be finite, distinct, increasing and in [0,360)')
    if distances.ndim != 1 or len(distances) == 0 or not np.all(np.isfinite(distances)) or np.any(distances <= 0) or np.any(distances >= math.pi*radius_m) or np.any(np.diff(distances) <= 0):
        raise ValueError('Distances must be positive finite increasing values below pi*radius')

    def sample(lat: float, lon: float) -> float:
        value = elevation_at(lat, lon)
        if value is None or not math.isfinite(value) or radius_m + value <= 0:
            raise TerrainUnavailable(f'Invalid/nodata/uncovered terrain at ({lat}, {lon})')
        return float(value)

    origin_radius = radius_m + sample(latitude_deg, longitude_east_deg) + observer_height_m
    output = []
    for azimuth in azimuths:
        maximum = -90.0
        for distance in distances:
            lat, lon = ray_destination(latitude_deg, longitude_east_deg, float(azimuth), float(distance), radius_m)
            terrain_radius = radius_m + sample(lat, lon)
            psi = distance / radius_m
            # Stable equivalent to (R+z)*cos(psi) - observer_radius.
            up = (terrain_radius - origin_radius) - 2*terrain_radius*math.sin(psi/2)**2
            horizontal = terrain_radius*math.sin(psi)
            maximum = max(maximum, math.degrees(math.atan2(up, horizontal)))
        output.append(maximum)
    return np.asarray(output)
