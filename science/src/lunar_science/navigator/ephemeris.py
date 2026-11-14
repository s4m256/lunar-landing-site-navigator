"""SPICE MOON_ME / Skyfield ephemeris engine and JPL Horizons cross-validator."""

from __future__ import annotations

import csv
import io
import json
import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable
from urllib.parse import urlencode
from urllib.request import urlopen

import numpy as np
import spiceypy as spice

from .data_sources import (
    AU_IN_KM,
    EARTH_RADIUS_KM,
    LUNAR_REFERENCE_RADIUS_M,
    NAIF_KERNELS,
    SOLAR_RADIUS_KM,
    ensure_assets,
)

HORIZONS_API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"


@dataclass(frozen=True)
class TopocentricEphemerisSeries:
    """Time series of topocentric Sun & Earth geometry in local ENU frame."""

    timestamps_utc: list[str]
    et_seconds: np.ndarray
    sun_az_deg: np.ndarray
    sun_el_deg: np.ndarray
    sun_range_km: np.ndarray
    sun_dist_au: np.ndarray
    sun_angular_radius_deg: np.ndarray
    earth_az_deg: np.ndarray
    earth_el_deg: np.ndarray
    earth_range_km: np.ndarray
    earth_angular_radius_deg: np.ndarray
    earth_pos_me_km: np.ndarray
    j2000_to_moon_me: np.ndarray
    libration_sub_earth_lat_deg: np.ndarray
    libration_sub_earth_lon_deg: np.ndarray


def enu_rotation_matrix(lat_deg: float, lon_east_deg: float) -> np.ndarray:
    """Return 3x3 matrix mapping MOON_ME Cartesian delta-vectors to local (East, North, Up)."""
    lat_rad = math.radians(lat_deg)
    lon_rad = math.radians(lon_east_deg)
    sin_lat, cos_lat = math.sin(lat_rad), math.cos(lat_rad)
    sin_lon, cos_lon = math.sin(lon_rad), math.cos(lon_rad)
    return np.array(
        [
            [-sin_lon, cos_lon, 0.0],
            [-sin_lat * cos_lon, -sin_lat * sin_lon, cos_lat],
            [cos_lat * cos_lon, cos_lat * sin_lon, sin_lat],
        ],
        dtype=np.float64,
    )


def cartesian_me_to_enu_az_el(
    delta_me_km: np.ndarray,
    lat_deg: float,
    lon_east_deg: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Project (..., 3) MOON_ME relative vectors into (az_deg, el_deg, range_km)."""
    rot = enu_rotation_matrix(lat_deg, lon_east_deg)
    delta = np.asarray(delta_me_km, dtype=np.float64)
    single = delta.ndim == 1
    if single:
        delta = delta[np.newaxis, :]
    enu = delta @ rot.T
    east = enu[:, 0]
    north = enu[:, 1]
    up = enu[:, 2]
    rng = np.linalg.norm(enu, axis=1)
    safe_rng = np.maximum(rng, 1e-12)
    az_deg = np.mod(np.degrees(np.arctan2(east, north)), 360.0)
    el_deg = np.degrees(np.arcsin(np.clip(up / safe_rng, -1.0, 1.0)))
    if single:
        return az_deg[0], el_deg[0], rng[0]
    return az_deg, el_deg, rng


def angular_separation_deg(
    az1_deg: np.ndarray | float,
    el1_deg: np.ndarray | float,
    az2_deg: np.ndarray | float,
    el2_deg: np.ndarray | float,
) -> np.ndarray:
    """Spherical angular separation in degrees between two (az, el) directions."""
    az1 = np.radians(az1_deg)
    el1 = np.radians(el1_deg)
    az2 = np.radians(az2_deg)
    el2 = np.radians(el2_deg)
    cos_sep = np.sin(el1) * np.sin(el2) + np.cos(el1) * np.cos(el2) * np.cos(az1 - az2)
    return np.degrees(np.arccos(np.clip(cos_sep, -1.0, 1.0)))


def parse_utc_iso(timestamp_utc: str) -> datetime:
    """Parse an ISO-8601 UTC string (with trailing Z or offset) as aware UTC datetime."""
    cleaned = timestamp_utc.strip()
    if cleaned.endswith("Z"):
        cleaned = cleaned[:-1] + "+00:00"
    dt = datetime.fromisoformat(cleaned)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def build_utc_grid(start_utc: str, stop_utc: str, step_hours: float) -> list[str]:
    """Build inclusive ISO-8601 UTC grid from start_utc through stop_utc."""
    if step_hours <= 0:
        raise ValueError("step_hours must be positive.")
    start_dt = parse_utc_iso(start_utc)
    stop_dt = parse_utc_iso(stop_utc)
    step = timedelta(hours=step_hours)
    timestamps: list[str] = []
    current = start_dt
    while current <= stop_dt + timedelta(microseconds=1):
        timestamps.append(current.strftime("%Y-%m-%dT%H:%M:%SZ"))
        current += step
    return timestamps


class SpiceLunarEphemeris:
    """Context-managed NAIF SPICE lunar ephemeris session in MOON_ME body-fixed frame."""

    def __init__(self, cache_dir: Path, allow_download: bool = False) -> None:
        self.cache_dir = Path(cache_dir)
        self._loaded_paths: list[Path] = []
        ensure_assets(self.cache_dir, NAIF_KERNELS, allow_download=allow_download)
        try:
            for asset in NAIF_KERNELS:
                path = (self.cache_dir / asset.filename).resolve()
                spice.furnsh(str(path))
                self._loaded_paths.append(path)
        except Exception:
            self.close()
            raise

    def __enter__(self) -> "SpiceLunarEphemeris":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()

    def close(self) -> None:
        """Unload all SPICE kernels furnished by this instance."""
        for path in reversed(self._loaded_paths):
            try:
                spice.unload(str(path))
            except Exception:
                pass
        self._loaded_paths.clear()

    def utc_list_to_et(self, timestamps_utc: Iterable[str]) -> np.ndarray:
        """Convert ISO-8601 UTC strings to SPICE Ephemeris Time (TDB seconds past J2000)."""
        ets = [float(spice.str2et(ts.rstrip("Z"))) for ts in timestamps_utc]
        return np.asarray(ets, dtype=np.float64)

    def moon_centered_ephemeris(
        self,
        timestamps_utc: list[str],
        aberration: str = "LT+S",
    ) -> dict[str, np.ndarray | list[str]]:
        """Compute Moon-centered Sun/Earth vectors and J2000->MOON_ME matrices once per epoch."""
        et_seconds = self.utc_list_to_et(timestamps_utc)
        n = len(et_seconds)
        sun_pos_me_km = np.empty((n, 3), dtype=np.float64)
        earth_pos_me_km = np.empty((n, 3), dtype=np.float64)
        j2000_to_moon_me = np.empty((n, 3, 3), dtype=np.float64)

        for idx, et in enumerate(et_seconds):
            sun_vec, _ = spice.spkpos("SUN", float(et), "MOON_ME", aberration, "MOON")
            earth_vec, _ = spice.spkpos("EARTH", float(et), "MOON_ME", aberration, "MOON")
            sun_pos_me_km[idx] = sun_vec
            earth_pos_me_km[idx] = earth_vec
            j2000_to_moon_me[idx] = spice.pxform("J2000", "MOON_ME", float(et))

        earth_rng = np.linalg.norm(earth_pos_me_km, axis=1)
        lib_lat = np.degrees(np.arcsin(np.clip(earth_pos_me_km[:, 2] / earth_rng, -1.0, 1.0)))
        lib_lon = np.degrees(np.arctan2(earth_pos_me_km[:, 1], earth_pos_me_km[:, 0]))

        return {
            "timestamps_utc": timestamps_utc,
            "et_seconds": et_seconds,
            "sun_pos_me_km": sun_pos_me_km,
            "earth_pos_me_km": earth_pos_me_km,
            "j2000_to_moon_me": j2000_to_moon_me,
            "libration_sub_earth_lat_deg": lib_lat,
            "libration_sub_earth_lon_deg": lib_lon,
        }

    def compute_topocentric_series(
        self,
        site_me_m: np.ndarray,
        lat_deg: float,
        lon_east_deg: float,
        timestamps_utc: list[str],
        aberration: str = "LT+S",
        precomputed_moon_centered: dict[str, np.ndarray | list[str]] | None = None,
    ) -> TopocentricEphemerisSeries:
        """Compute full topocentric Sun & Earth series for one lunar site."""
        base = (
            precomputed_moon_centered
            if precomputed_moon_centered is not None
            else self.moon_centered_ephemeris(timestamps_utc, aberration=aberration)
        )
        site_me_km = np.asarray(site_me_m, dtype=np.float64) / 1000.0
        sun_delta_km = np.asarray(base["sun_pos_me_km"]) - site_me_km[np.newaxis, :]
        earth_delta_km = np.asarray(base["earth_pos_me_km"]) - site_me_km[np.newaxis, :]

        sun_az, sun_el, sun_rng = cartesian_me_to_enu_az_el(sun_delta_km, lat_deg, lon_east_deg)
        earth_az, earth_el, earth_rng = cartesian_me_to_enu_az_el(
            earth_delta_km, lat_deg, lon_east_deg
        )

        sun_ang_rad = np.degrees(np.arcsin(np.clip(SOLAR_RADIUS_KM / sun_rng, -1.0, 1.0)))
        earth_ang_rad = np.degrees(np.arcsin(np.clip(EARTH_RADIUS_KM / earth_rng, -1.0, 1.0)))

        return TopocentricEphemerisSeries(
            timestamps_utc=list(base["timestamps_utc"]),
            et_seconds=np.asarray(base["et_seconds"]),
            sun_az_deg=sun_az,
            sun_el_deg=sun_el,
            sun_range_km=sun_rng,
            sun_dist_au=sun_rng / AU_IN_KM,
            sun_angular_radius_deg=sun_ang_rad,
            earth_az_deg=earth_az,
            earth_el_deg=earth_el,
            earth_range_km=earth_rng,
            earth_angular_radius_deg=earth_ang_rad,
            earth_pos_me_km=np.asarray(base["earth_pos_me_km"]),
            j2000_to_moon_me=np.asarray(base["j2000_to_moon_me"]),
            libration_sub_earth_lat_deg=np.asarray(base["libration_sub_earth_lat_deg"]),
            libration_sub_earth_lon_deg=np.asarray(base["libration_sub_earth_lon_deg"]),
        )


def cross_check_skyfield_sun_earth(
    cache_dir: Path,
    lat_deg: float,
    lon_east_deg: float,
    elevation_m: float,
    timestamps_utc: list[str],
) -> dict[str, list[float]]:
    """Compute independent Skyfield MOON_ME_DE421 topocentric Sun & Earth Az/El."""
    from skyfield.api import Loader, PlanetaryConstants

    load = Loader(str(cache_dir), verbose=False)
    ts = load.timescale()
    eph = load("de421.bsp")
    pc = PlanetaryConstants()
    pc.read_text(load("moon_080317.tf"))
    pc.read_text(load("moon_assoc_me.tf"))
    pc.read_text(load("pck00010.tpc"))
    pc.read_binary(load("moon_pa_de421_1900-2050.bpc"))
    moon = eph["moon"]
    frame = pc.build_frame_named("MOON_ME_DE421")

    dts = [parse_utc_iso(s) for s in timestamps_utc]
    t = ts.from_datetimes(dts)
    site_topo = pc.build_latlon_degrees(
        frame,
        latitude_degrees=lat_deg,
        longitude_degrees=lon_east_deg,
        elevation_m=elevation_m,
    )
    observer = moon + site_topo

    sun_app = observer.at(t).observe(eph["sun"]).apparent()
    earth_app = observer.at(t).observe(eph["earth"]).apparent()
    sun_alt, sun_az, _ = sun_app.altaz()
    earth_alt, earth_az, _ = earth_app.altaz()

    return {
        "sun_az_deg": [float(x) for x in np.atleast_1d(sun_az.degrees)],
        "sun_el_deg": [float(x) for x in np.atleast_1d(sun_alt.degrees)],
        "earth_az_deg": [float(x) for x in np.atleast_1d(earth_az.degrees)],
        "earth_el_deg": [float(x) for x in np.atleast_1d(earth_alt.degrees)],
    }


def query_jpl_horizons_topocentric(
    lat_deg: float,
    lon_east_deg: float,
    elevation_m: float,
    start_utc: str,
    stop_utc: str,
    step_size: str,
    target_command: str,
    timeout_s: float = 45.0,
) -> list[dict[str, float | str]]:
    """Query NASA JPL Horizons API for topocentric Moon site apparent Az/El."""
    lon_clean = lon_east_deg % 360.0
    elev_km = elevation_m / 1000.0
    start_fmt = parse_utc_iso(start_utc).strftime("%Y-%m-%d %H:%M")
    stop_fmt = parse_utc_iso(stop_utc).strftime("%Y-%m-%d %H:%M")

    params = {
        "format": "json",
        "COMMAND": f"'{target_command}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon_clean:.6f},{lat_deg:.6f},{elev_km:.5f}'",
        "START_TIME": f"'{start_fmt}'",
        "STOP_TIME": f"'{stop_fmt}'",
        "STEP_SIZE": f"'{step_size}'",
        "QUANTITIES": "'4'",
        "CSV_FORMAT": "'YES'",
        "CAL_FORMAT": "'CAL'",
    }
    url = f"{HORIZONS_API_URL}?{urlencode(params)}"
    with urlopen(url, timeout=timeout_s) as resp:
        payload = json.loads(resp.read().decode("utf-8"))

    result_text = payload.get("result", "")
    if "$$SOE" not in result_text or "$$EOE" not in result_text:
        raise RuntimeError(f"Unexpected JPL Horizons response: {result_text[:500]}")

    block = result_text.split("$$SOE", 1)[1].split("$$EOE", 1)[0].strip()
    rows: list[dict[str, float | str]] = []
    reader = csv.reader(io.StringIO(block))
    for cols in reader:
        if len(cols) < 5:
            continue
        date_str = cols[0].strip()
        dt = datetime.strptime(date_str, "%Y-%b-%d %H:%M").replace(tzinfo=timezone.utc)
        az_deg = float(cols[3].strip())
        el_deg = float(cols[4].strip())
        rows.append(
            {
                "timestamp_utc": dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "az_deg": az_deg,
                "el_deg": el_deg,
            }
        )
    return rows


def validate_ephemeris_against_horizons(
    cache_dir: Path,
    site_id: str,
    site_name: str,
    lat_deg: float,
    lon_east_deg: float,
    elevation_m: float,
    start_utc: str = "2026-11-15T00:00:00Z",
    stop_utc: str = "2026-12-14T00:00:00Z",
    step_size: str = "2 d",
) -> dict:
    """Compare SPICE MOON_ME topocentric Sun/Earth directions against JPL Horizons."""
    from .dem_horizon import selenographic_to_cartesian_me

    sun_rows = query_jpl_horizons_topocentric(
        lat_deg, lon_east_deg, elevation_m, start_utc, stop_utc, step_size, "10"
    )
    earth_rows = query_jpl_horizons_topocentric(
        lat_deg, lon_east_deg, elevation_m, start_utc, stop_utc, step_size, "399"
    )
    timestamps = [str(r["timestamp_utc"]) for r in sun_rows]
    site_me = selenographic_to_cartesian_me(lat_deg, lon_east_deg, elevation_m)

    with SpiceLunarEphemeris(cache_dir, allow_download=False) as spice_eph:
        series = spice_eph.compute_topocentric_series(
            site_me_m=site_me,
            lat_deg=lat_deg,
            lon_east_deg=lon_east_deg,
            timestamps_utc=timestamps,
            aberration="LT+S",
        )

    sun_diffs: list[dict[str, float | str]] = []
    earth_diffs: list[dict[str, float | str]] = []
    for i, ts in enumerate(timestamps):
        sun_sep = float(
            angular_separation_deg(
                series.sun_az_deg[i],
                series.sun_el_deg[i],
                float(sun_rows[i]["az_deg"]),
                float(sun_rows[i]["el_deg"]),
            )
        )
        sun_diffs.append(
            {
                "timestamp_utc": ts,
                "spice_az_deg": round(float(series.sun_az_deg[i]), 5),
                "spice_el_deg": round(float(series.sun_el_deg[i]), 5),
                "horizons_az_deg": round(float(sun_rows[i]["az_deg"]), 5),
                "horizons_el_deg": round(float(sun_rows[i]["el_deg"]), 5),
                "angular_diff_deg": round(sun_sep, 6),
            }
        )
        earth_sep = float(
            angular_separation_deg(
                series.earth_az_deg[i],
                series.earth_el_deg[i],
                float(earth_rows[i]["az_deg"]),
                float(earth_rows[i]["el_deg"]),
            )
        )
        earth_diffs.append(
            {
                "timestamp_utc": ts,
                "spice_az_deg": round(float(series.earth_az_deg[i]), 5),
                "spice_el_deg": round(float(series.earth_el_deg[i]), 5),
                "horizons_az_deg": round(float(earth_rows[i]["az_deg"]), 5),
                "horizons_el_deg": round(float(earth_rows[i]["el_deg"]), 5),
                "angular_diff_deg": round(earth_sep, 6),
            }
        )

    sun_max = max(d["angular_diff_deg"] for d in sun_diffs)
    earth_max = max(d["angular_diff_deg"] for d in earth_diffs)
    return {
        "site_id": site_id,
        "site_name": site_name,
        "latitude_deg": lat_deg,
        "longitude_east_deg": lon_east_deg,
        "elevation_m": elevation_m,
        "frame": "MOON_ME (de421.bsp + moon_pa_de421_1900-2050.bpc)",
        "aberration": "LT+S",
        "max_sun_angular_diff_deg": sun_max,
        "max_earth_angular_diff_deg": earth_max,
        "sample_count": len(timestamps),
        "sun_comparisons": sun_diffs,
        "earth_comparisons": earth_diffs,
    }
