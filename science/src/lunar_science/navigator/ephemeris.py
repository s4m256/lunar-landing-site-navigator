"""SPICE MOON_ME ephemeris engine and JPL Horizons comparison.

The engine is NAIF SPICE (``spiceypy``). ``cross_check_skyfield_sun_earth`` is an optional
helper that reads the *same* kernel files through Skyfield; it can only detect implementation
differences, not errors in the kernels, and it is not run by the pipeline or by CI.

The Horizons comparison (``validate_ephemeris_against_horizons``) retains the raw responses,
checks that Horizons returned exactly the requested epochs for both targets, and reports
``status = "verified"`` only when every sample is within a declared tolerance; otherwise
``"failed"`` with the numbers. Transport failures raise :class:`HorizonsNetworkError`; any other
problem (malformed or empty table, wrong epochs, rejected query) raises
:class:`HorizonsResponseError` and is never reported as a network problem.
"""

from __future__ import annotations

import csv
import hashlib
import http.client
import io
import json
import math
import re
import socket
import ssl
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Iterable
from urllib.error import HTTPError, URLError
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

#: Default acceptance tolerance for SPICE vs Horizons, as the spherical separation between the
#: two apparent directions of each target at each epoch.
DEFAULT_HORIZONS_TOLERANCE_DEG = 1e-3

#: Why ``DEFAULT_HORIZONS_TOLERANCE_DEG`` has this value. Recorded in every report.
HORIZONS_TOLERANCE_RATIONALE = (
    "Product-level acceptance threshold proposed in SPA-10, not an accuracy claim for either "
    "ephemeris: 0.001 deg (3.6 arcsec) is below 0.4% of the solar angular radius (~0.267 deg) "
    "and about 1/40 of one 80 m DEM pixel seen from the 120 km horizon range (~0.038 deg), so "
    "differences below it do not change the illumination or line-of-sight products."
)

#: HTTP status codes treated as "service unreachable from here" (proxy refusal, auth required by a
#: proxy, timeouts, throttling, server outage). Any other HTTP error means Horizons answered and
#: rejected the request, which is a request/response problem, not a network problem.
_NETWORK_HTTP_STATUS = frozenset({403, 407, 408, 429, 500, 502, 503, 504})


class HorizonsError(RuntimeError):
    """Base class for Horizons comparison errors."""


class HorizonsNetworkError(HorizonsError):
    """Horizons could not be reached (transport failure). The only error the pipeline tolerates."""


class HorizonsResponseError(HorizonsError):
    """Horizons was reached but the response cannot be used (rejected, malformed, empty, wrong epochs)."""


@dataclass(frozen=True)
class HorizonsQueryResult:
    """One Horizons observer-table query with its raw evidence and parsed rows."""

    target_command: str
    request_url: str
    request_params: dict[str, str]
    retrieved_utc: str
    http_status: int | None
    response_text: str
    response_sha256: str
    rows: tuple[dict[str, Any], ...] = field(default_factory=tuple)

    def evidence_dict(self) -> dict[str, Any]:
        """Raw evidence to retain next to the validation artifact (includes the full response)."""
        return {
            "target_command": self.target_command,
            "request_url": self.request_url,
            "request_params": dict(self.request_params),
            "retrieved_utc": self.retrieved_utc,
            "http_status": self.http_status,
            "response_sha256": self.response_sha256,
            "response_text": self.response_text,
        }


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
    """Spherical angular separation in degrees between two (az, el) directions.

    Uses the Vincenty (atan2) form, which stays accurate for tiny separations; the ``arccos``
    form quantizes at ~1e-6 deg in float64, comparable to the SPICE-Horizons residuals.
    """
    az1 = np.radians(az1_deg)
    el1 = np.radians(el1_deg)
    az2 = np.radians(az2_deg)
    el2 = np.radians(el2_deg)
    daz = az2 - az1
    num = np.hypot(
        np.cos(el2) * np.sin(daz),
        np.cos(el1) * np.sin(el2) - np.sin(el1) * np.cos(el2) * np.cos(daz),
    )
    den = np.sin(el1) * np.sin(el2) + np.cos(el1) * np.cos(el2) * np.cos(daz)
    return np.degrees(np.arctan2(num, den))


def wrapped_angle_diff_deg(a_deg: np.ndarray | float, b_deg: np.ndarray | float) -> np.ndarray:
    """Signed difference ``a - b`` wrapped to [-180, 180) deg (359.99999 vs 0.00001 -> -0.00002)."""
    return np.mod(np.asarray(a_deg, dtype=np.float64) - np.asarray(b_deg, dtype=np.float64) + 180.0, 360.0) - 180.0


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

    def provenance(self) -> dict[str, Any]:
        """``provenance.ephemeris`` block of the dataset (no cross-check is claimed here)."""
        return {
            "engine": "NAIF SPICE (spiceypy)",
            "frame": "MOON_ME (Mean Earth / Polar Axis DE421)",
            "correction": "LT+S",
            "kernels": [{"filename": k.filename, "url": k.url, "sha256": k.sha256} for k in NAIF_KERNELS],
        }

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
        return topocentric_series_from_moon_centered(base, site_me_m, lat_deg, lon_east_deg)


def subsolar_latitude_deg(sun_pos_me_km: np.ndarray) -> np.ndarray:
    """Latitude (deg) of the Moon-centered Sun direction in MOON_ME, i.e. the sub-solar latitude."""
    v = np.asarray(sun_pos_me_km, dtype=np.float64)
    return np.degrees(np.arcsin(np.clip(v[..., 2] / np.linalg.norm(v, axis=-1), -1.0, 1.0)))


def topocentric_series_from_moon_centered(
    base: dict[str, Any],
    site_me_m: np.ndarray,
    lat_deg: float,
    lon_east_deg: float,
) -> TopocentricEphemerisSeries:
    """Topocentric Sun & Earth series for one site from Moon-centered MOON_ME vectors.

    ``base`` holds the arrays produced by :meth:`SpiceLunarEphemeris.moon_centered_ephemeris`
    (apparent Sun/Earth positions as seen from the Moon center, km). The site vector is
    subtracted here; no SPICE call is made, so this path is testable without kernels.
    """
    site_me_km = np.asarray(site_me_m, dtype=np.float64) / 1000.0
    sun_delta_km = np.asarray(base["sun_pos_me_km"]) - site_me_km[np.newaxis, :]
    earth_delta_km = np.asarray(base["earth_pos_me_km"]) - site_me_km[np.newaxis, :]

    sun_az, sun_el, sun_rng = cartesian_me_to_enu_az_el(sun_delta_km, lat_deg, lon_east_deg)
    earth_az, earth_el, earth_rng = cartesian_me_to_enu_az_el(earth_delta_km, lat_deg, lon_east_deg)

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
    """Skyfield MOON_ME_DE421 topocentric Sun & Earth Az/El from the same cached kernel files.

    Not independent of the data: it reads the same DE421/PA kernels as the SPICE engine, so it
    can only reveal implementation or convention differences. The pipeline never calls it and the
    only test that does is skipped when kernels are not cached (always the case in CI).
    """
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


HorizonsFetcher = Callable[[str, float], tuple[int | None, bytes]]

_STEP_SIZE_RE = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*(d|day|days|h|hour|hours|m|min|mins|minute|minutes)\s*$", re.IGNORECASE)
# Horizons calendar dates ("2026-Nov-15 00:00", optional seconds/fraction); English month names
# are parsed explicitly so the result does not depend on the process locale.
_HORIZONS_DATE_RE = re.compile(r"^(\d{4})-([A-Za-z]{3})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$")
_MONTHS = {m: i for i, m in enumerate(("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"), start=1)}


def _parse_horizons_date(text: str) -> datetime | None:
    match = _HORIZONS_DATE_RE.match(text.strip())
    if not match or match.group(2).lower() not in _MONTHS:
        return None
    year, _, day, hour, minute, second, frac = match.groups()
    micro = int((frac or "0")[:6].ljust(6, "0"))
    try:
        return datetime(int(year), _MONTHS[match.group(2).lower()], int(day), int(hour), int(minute), int(second or 0), micro, tzinfo=timezone.utc)
    except ValueError:
        return None


def parse_step_size_hours(step_size: str) -> float:
    """Convert a Horizons STEP_SIZE such as ``'2 d'``, ``'6 h'`` or ``'30 m'`` into hours.

    Horizons also accepts a bare integer meaning "number of intervals"; that form is rejected
    here because the expected epoch grid could not be rebuilt locally.
    """
    match = _STEP_SIZE_RE.match(step_size)
    if not match:
        raise ValueError(f"Unsupported Horizons STEP_SIZE {step_size!r}; use '<n> d', '<n> h' or '<n> m'.")
    value = float(match.group(1))
    unit = match.group(2).lower()
    hours = value * (24.0 if unit.startswith("d") else 1.0 if unit.startswith("h") else 1.0 / 60.0)
    if hours <= 0:
        raise ValueError("Horizons STEP_SIZE must be positive.")
    return hours


def fetch_horizons_url(url: str, timeout_s: float) -> tuple[int | None, bytes]:
    """Plain HTTPS GET returning ``(http_status, body)``; failures are classified by the caller."""
    with urlopen(url, timeout=timeout_s) as resp:
        status = getattr(resp, "status", None)
        return (int(status) if status is not None else None), resp.read()


#: Exceptions that mean "the service could not be reached" (urllib wraps socket/DNS/TLS errors in
#: URLError; reads can raise timeouts, resets or truncated-response errors).
_TRANSPORT_ERRORS: tuple[type[BaseException], ...] = (
    URLError,
    TimeoutError,
    ConnectionError,
    ssl.SSLError,
    socket.gaierror,
    socket.herror,
    http.client.HTTPException,
)


def _fetch_classified(fetch: HorizonsFetcher, url: str, timeout_s: float) -> tuple[int | None, bytes]:
    """Call ``fetch`` and turn transport failures into :class:`HorizonsNetworkError`.

    HTTP statuses in ``_NETWORK_HTTP_STATUS`` count as unreachable; any other HTTP error means
    Horizons answered and rejected the request (:class:`HorizonsResponseError`). Every other
    exception propagates unchanged, so a bug is never reported as a network problem.
    """
    try:
        return fetch(url, timeout_s)
    except HTTPError as exc:
        if exc.code in _NETWORK_HTTP_STATUS:
            raise HorizonsNetworkError(f"HTTP {exc.code} {exc.reason} while contacting Horizons") from exc
        try:
            detail = exc.read()[:500].decode("utf-8", errors="replace")
        except Exception:  # pragma: no cover - best effort detail only
            detail = ""
        raise HorizonsResponseError(
            f"Horizons rejected the request: HTTP {exc.code} {exc.reason} {detail}".strip()
        ) from exc
    except _TRANSPORT_ERRORS as exc:
        raise HorizonsNetworkError(f"{type(exc).__name__}: {exc}") from exc


def build_horizons_observer_params(
    lat_deg: float,
    lon_east_deg: float,
    elevation_m: float,
    start_utc: str,
    stop_utc: str,
    step_size: str,
    target_command: str,
) -> dict[str, str]:
    """Horizons API parameters for apparent topocentric Az/El from a lunar surface site.

    ``EXTRA_PREC`` and ``APPARENT='AIRLESS'`` follow the SPA-9 audit recommendation; the output
    format they produce was not checked against the live service in SPA-10 (host blocked).
    """
    lon_clean = lon_east_deg % 360.0
    elev_km = elevation_m / 1000.0
    start_fmt = parse_utc_iso(start_utc).strftime("%Y-%m-%d %H:%M")
    stop_fmt = parse_utc_iso(stop_utc).strftime("%Y-%m-%d %H:%M")
    return {
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
        "APPARENT": "'AIRLESS'",
        "EXTRA_PREC": "'YES'",
    }


def parse_horizons_observer_table(result_text: str) -> list[dict[str, Any]]:
    """Parse the ``$$SOE``/``$$EOE`` CSV block of a quantity-4 (Az/El) observer table.

    Every non-blank line must parse; nothing is skipped silently. Raises
    :class:`HorizonsResponseError` for missing/duplicated markers, an empty table, unparsable
    dates or non-finite/out-of-range angles.
    """
    if not isinstance(result_text, str):
        raise HorizonsResponseError("Horizons 'result' is not a string.")
    if result_text.count("$$SOE") != 1 or result_text.count("$$EOE") != 1:
        raise HorizonsResponseError(
            "Expected exactly one $$SOE/$$EOE ephemeris table in the Horizons response: "
            + result_text[:500]
        )
    if result_text.index("$$SOE") > result_text.index("$$EOE"):
        raise HorizonsResponseError("Horizons $$SOE/$$EOE markers are out of order.")

    block = result_text.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
    rows: list[dict[str, Any]] = []
    for line_no, line in enumerate(block.splitlines(), start=1):
        if not line.strip():
            continue
        cols = next(csv.reader(io.StringIO(line)))
        parsed = _parse_horizons_date(cols[0]) if cols else None
        if parsed is None:
            raise HorizonsResponseError(f"Unparsable Horizons date on table line {line_no}: {line!r}")
        values = [c.strip() for c in cols[1:] if c.strip()]
        if len(values) < 2:
            raise HorizonsResponseError(f"Horizons table line {line_no} lacks Az/El columns: {line!r}")
        try:
            az_deg, el_deg = float(values[-2]), float(values[-1])
        except ValueError as exc:
            raise HorizonsResponseError(f"Non-numeric Az/El on Horizons table line {line_no}: {line!r}") from exc
        if not (math.isfinite(az_deg) and math.isfinite(el_deg) and 0.0 <= az_deg <= 360.0 and -90.0 <= el_deg <= 90.0):
            raise HorizonsResponseError(f"Out-of-range Az/El on Horizons table line {line_no}: {line!r}")
        # Keep any fractional second so it can never be silently matched to a whole-second epoch.
        fmt = "%Y-%m-%dT%H:%M:%S.%fZ" if parsed.microsecond else "%Y-%m-%dT%H:%M:%SZ"
        rows.append({"timestamp_utc": parsed.strftime(fmt), "az_deg": az_deg, "el_deg": el_deg})
    if not rows:
        raise HorizonsResponseError("Horizons ephemeris table is empty.")
    return rows


def query_jpl_horizons_topocentric(
    lat_deg: float,
    lon_east_deg: float,
    elevation_m: float,
    start_utc: str,
    stop_utc: str,
    step_size: str,
    target_command: str,
    timeout_s: float = 45.0,
    fetch: HorizonsFetcher | None = None,
) -> HorizonsQueryResult:
    """Query JPL Horizons for apparent topocentric Az/El from a lunar site, keeping raw evidence.

    ``fetch(url, timeout_s) -> (http_status, body_bytes)`` can be injected (tests use stubs).
    """
    params = build_horizons_observer_params(
        lat_deg, lon_east_deg, elevation_m, start_utc, stop_utc, step_size, target_command
    )
    url = f"{HORIZONS_API_URL}?{urlencode(params)}"
    retrieved_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    status, body = _fetch_classified(fetch or fetch_horizons_url, url, timeout_s)
    sha256 = hashlib.sha256(body).hexdigest()
    try:
        text = body.decode("utf-8")
        payload = json.loads(text)
    except (UnicodeDecodeError, ValueError) as exc:
        raise HorizonsResponseError(f"Horizons response is not UTF-8 JSON: {body[:200]!r}") from exc
    if not isinstance(payload, dict):
        raise HorizonsResponseError("Horizons response JSON is not an object.")
    if "error" in payload:
        raise HorizonsResponseError(f"Horizons returned an error: {str(payload['error'])[:500]}")
    rows = parse_horizons_observer_table(payload.get("result"))
    return HorizonsQueryResult(
        target_command=target_command,
        request_url=url,
        request_params=params,
        retrieved_utc=retrieved_utc,
        http_status=status,
        response_text=text,
        response_sha256=sha256,
        rows=tuple(rows),
    )


def _finite_or_none(value: float) -> float | None:
    value = float(value)
    return value if math.isfinite(value) else None


def _check_rows_match_grid(query: HorizonsQueryResult, expected: list[str], label: str) -> None:
    got = [str(r["timestamp_utc"]) for r in query.rows]
    if got == expected:
        return
    if len(got) != len(expected):
        raise HorizonsResponseError(
            f"Horizons {label} table has {len(got)} rows but {len(expected)} epochs were requested "
            f"({expected[0]} .. {expected[-1]})."
        )
    first = next(i for i, (a, b) in enumerate(zip(got, expected)) if a != b)
    raise HorizonsResponseError(
        f"Horizons {label} epoch {first} is {got[first]} but {expected[first]} was requested."
    )


def compare_engine_with_horizons(
    expected_timestamps: list[str],
    engine_series: Any,
    sun_query: HorizonsQueryResult,
    earth_query: HorizonsQueryResult,
    tolerance_deg: float = DEFAULT_HORIZONS_TOLERANCE_DEG,
) -> dict[str, Any]:
    """Compare engine Sun/Earth Az/El with two Horizons queries and decide ``verified``/``failed``.

    ``engine_series`` needs ``sun_az_deg``, ``sun_el_deg``, ``earth_az_deg``, ``earth_el_deg``
    arrays aligned with ``expected_timestamps``. Both Horizons tables must contain exactly the
    expected epochs. The status is ``verified`` only if every separation is finite and
    ``<= tolerance_deg``.
    """
    if not (isinstance(tolerance_deg, (int, float)) and math.isfinite(tolerance_deg) and tolerance_deg > 0):
        raise ValueError("tolerance_deg must be a positive finite number of degrees.")
    if not expected_timestamps:
        raise ValueError("No epochs requested for the Horizons comparison.")
    if len(sun_query.rows) != len(earth_query.rows):
        raise HorizonsResponseError(
            f"Horizons returned {len(sun_query.rows)} Sun rows but {len(earth_query.rows)} Earth rows."
        )
    _check_rows_match_grid(sun_query, expected_timestamps, "Sun (10)")
    _check_rows_match_grid(earth_query, expected_timestamps, "Earth (399)")

    def _target(az_eng: np.ndarray, el_eng: np.ndarray, query: HorizonsQueryResult) -> tuple[list[dict[str, Any]], dict[str, float]]:
        az_eng = np.asarray(az_eng, dtype=np.float64)
        el_eng = np.asarray(el_eng, dtype=np.float64)
        if az_eng.shape != (len(expected_timestamps),) or el_eng.shape != az_eng.shape:
            raise ValueError("Engine series length does not match the requested epochs.")
        az_h = np.array([float(r["az_deg"]) for r in query.rows])
        el_h = np.array([float(r["el_deg"]) for r in query.rows])
        sep = np.asarray(angular_separation_deg(az_eng, el_eng, az_h, el_h), dtype=np.float64)
        daz = np.abs(wrapped_angle_diff_deg(az_eng, az_h))
        delv = np.abs(el_eng - el_h)
        ok = np.isfinite(sep) & (sep <= tolerance_deg)
        rows = [
            {
                "timestamp_utc": ts,
                "spice_az_deg": _finite_or_none(az_eng[i]),
                "spice_el_deg": _finite_or_none(el_eng[i]),
                "horizons_az_deg": float(az_h[i]),
                "horizons_el_deg": float(el_h[i]),
                "angular_diff_deg": _finite_or_none(sep[i]),
                "within_tolerance": bool(ok[i]),
            }
            for i, ts in enumerate(expected_timestamps)
        ]
        finite = bool(np.all(np.isfinite(sep)))
        stats = {
            # A non-finite engine value makes the maximum undefined (reported as null).
            "max_angular_diff_deg": float(np.max(sep)) if finite else None,
            "max_az_diff_deg": float(np.max(daz)) if finite else None,
            "max_el_diff_deg": float(np.max(delv)) if finite else None,
            "exceeding": int(np.sum(~ok)),
        }
        return rows, stats

    sun_rows, sun_stats = _target(engine_series.sun_az_deg, engine_series.sun_el_deg, sun_query)
    earth_rows, earth_stats = _target(engine_series.earth_az_deg, engine_series.earth_el_deg, earth_query)
    exceeding = sun_stats["exceeding"] + earth_stats["exceeding"]
    return {
        "status": "verified" if exceeding == 0 else "failed",
        "tolerance_deg": float(tolerance_deg),
        "tolerance_metric": "spherical separation between engine and Horizons apparent directions, per target and epoch",
        "tolerance_rationale": HORIZONS_TOLERANCE_RATIONALE,
        "sample_count": len(expected_timestamps),
        "samples_exceeding_tolerance": {"sun": sun_stats["exceeding"], "earth": earth_stats["exceeding"]},
        "max_sun_angular_diff_deg": sun_stats["max_angular_diff_deg"],
        "max_earth_angular_diff_deg": earth_stats["max_angular_diff_deg"],
        "max_sun_az_diff_deg": sun_stats["max_az_diff_deg"],
        "max_sun_el_diff_deg": sun_stats["max_el_diff_deg"],
        "max_earth_az_diff_deg": earth_stats["max_az_diff_deg"],
        "max_earth_el_diff_deg": earth_stats["max_el_diff_deg"],
        "sun_comparisons": sun_rows,
        "earth_comparisons": earth_rows,
        "horizons_queries": [sun_query.evidence_dict(), earth_query.evidence_dict()],
    }


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
    tolerance_deg: float = DEFAULT_HORIZONS_TOLERANCE_DEG,
    fetch: HorizonsFetcher | None = None,
    engine: Callable[[np.ndarray, float, float, list[str]], Any] | None = None,
    timeout_s: float = 45.0,
) -> dict[str, Any]:
    """Compare SPICE MOON_ME topocentric Sun/Earth directions against JPL Horizons.

    The engine is evaluated on the locally rebuilt request grid (not on whatever epochs Horizons
    returns) and both Horizons tables must match that grid. ``fetch`` and ``engine`` can be
    injected; by default the network and the cached SPICE kernels are used.
    """
    from .dem_horizon import selenographic_to_cartesian_me

    expected = build_utc_grid(start_utc, stop_utc, parse_step_size_hours(step_size))
    sun_query = query_jpl_horizons_topocentric(
        lat_deg, lon_east_deg, elevation_m, start_utc, stop_utc, step_size, "10", timeout_s, fetch
    )
    earth_query = query_jpl_horizons_topocentric(
        lat_deg, lon_east_deg, elevation_m, start_utc, stop_utc, step_size, "399", timeout_s, fetch
    )
    site_me = selenographic_to_cartesian_me(lat_deg, lon_east_deg, elevation_m)

    if engine is None:
        with SpiceLunarEphemeris(cache_dir, allow_download=False) as spice_eph:
            series = spice_eph.compute_topocentric_series(
                site_me_m=site_me,
                lat_deg=lat_deg,
                lon_east_deg=lon_east_deg,
                timestamps_utc=expected,
                aberration="LT+S",
            )
    else:
        series = engine(site_me, lat_deg, lon_east_deg, expected)

    comparison = compare_engine_with_horizons(expected, series, sun_query, earth_query, tolerance_deg)
    return {
        "site_id": site_id,
        "site_name": site_name,
        "latitude_deg": lat_deg,
        "longitude_east_deg": lon_east_deg,
        "elevation_m": elevation_m,
        "frame": "MOON_ME (de421.bsp + moon_pa_de421_1900-2050.bpc)",
        "aberration": "LT+S",
        "requested_grid": {
            "start_utc": expected[0],
            "stop_utc": expected[-1],
            "step_size": step_size,
            "sample_count": len(expected),
        },
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "scope": "Sun and Earth center directions at one site only; does not validate DEM horizons, illumination, communications or the landing score.",
        **comparison,
    }


HORIZONS_REPORT_FILENAME = "horizons_cross_validation.json"
HORIZONS_RAW_DIRNAME = "horizons_raw"


def write_horizons_validation_artifacts(validation_dir: Path, report: dict[str, Any]) -> dict[str, Path]:
    """Write the comparison report plus the exact raw Horizons responses next to it.

    Any previous raw directory is replaced so evidence from different runs is never mixed. The
    report keeps request parameters, retrieval time and SHA-256, and points to the raw files.
    """
    import shutil

    validation_dir = Path(validation_dir)
    validation_dir.mkdir(parents=True, exist_ok=True)
    raw_dir = validation_dir / HORIZONS_RAW_DIRNAME
    if raw_dir.exists():
        shutil.rmtree(raw_dir)
    raw_dir.mkdir()

    written: dict[str, Path] = {}
    report_out = dict(report)
    queries_out: list[dict[str, Any]] = []
    for query in report.get("horizons_queries", []):
        entry = dict(query)
        text = entry.pop("response_text")
        raw_path = raw_dir / f"target_{entry['target_command']}.response.json"
        raw_bytes = text.encode("utf-8")
        if hashlib.sha256(raw_bytes).hexdigest() != entry["response_sha256"]:
            raise ValueError(f"Retained Horizons response for target {entry['target_command']} does not match its SHA-256.")
        raw_path.write_bytes(raw_bytes)
        entry["response_file"] = f"{HORIZONS_RAW_DIRNAME}/{raw_path.name}"
        queries_out.append(entry)
        written[f"horizons_raw_{entry['target_command']}"] = raw_path
    if not queries_out:
        raise ValueError("Horizons report has no retained raw responses; refusing to write it.")
    report_out["horizons_queries"] = queries_out

    report_path = validation_dir / HORIZONS_REPORT_FILENAME
    report_path.write_text(json.dumps(report_out, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    written["horizons_validation"] = report_path
    return written


def remove_horizons_validation_artifacts(validation_dir: Path) -> list[Path]:
    """Delete a previous report and raw responses so they cannot sit next to a newer dataset."""
    import shutil

    validation_dir = Path(validation_dir)
    removed: list[Path] = []
    report_path = validation_dir / HORIZONS_REPORT_FILENAME
    if report_path.exists():
        report_path.unlink()
        removed.append(report_path)
    raw_dir = validation_dir / HORIZONS_RAW_DIRNAME
    if raw_dir.exists():
        shutil.rmtree(raw_dir)
        removed.append(raw_dir)
    return removed
