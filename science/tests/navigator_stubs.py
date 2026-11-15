"""SYNTHETIC test doubles for the navigator (no network, no SPICE kernels).

Nothing here is physical data or a real JPL Horizons response:

* ``SyntheticEphemeris`` is an analytic, non-physical Sun/Earth geometry used only to exercise the
  pipeline code paths in CI.
* ``SyntheticHorizons`` answers like the Horizons API (JSON with a CSV observer table modeled on
  the documented quantity-4 format) using ``SyntheticEphemeris`` plus optional offsets.
"""

from __future__ import annotations

import json
import math
from typing import Any
from urllib.parse import parse_qs, urlsplit

import numpy as np

from lunar_science.navigator.data_sources import AU_IN_KM, NAIF_KERNELS, SYNODIC_PERIOD_DAYS
from lunar_science.navigator.dem_horizon import selenographic_to_cartesian_me
from lunar_science.navigator.ephemeris import (
    build_utc_grid,
    parse_step_size_hours,
    parse_utc_iso,
    topocentric_series_from_moon_centered,
)

_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


class SyntheticEphemeris:
    """Analytic, NON-PHYSICAL geometry: Sun at fixed sub-solar latitude circling once per synodic
    month in the body-fixed frame, Earth fixed in that frame, identity frame rotation."""

    def __init__(self, subsolar_lat_deg: float = -1.5, sub_earth_lat_deg: float = -3.0) -> None:
        self.subsolar_lat_deg = subsolar_lat_deg
        self.sub_earth_lat_deg = sub_earth_lat_deg

    def __enter__(self) -> "SyntheticEphemeris":
        return self

    def __exit__(self, *exc: Any) -> None:
        return None

    def provenance(self) -> dict[str, Any]:
        return {
            "engine": "SYNTHETIC TEST EPHEMERIS (analytic, not physical)",
            "frame": "synthetic body-fixed frame",
            "correction": "none",
            "kernels": [{"filename": "synthetic", "url": "local://synthetic-test", "sha256": "0" * 64}],
        }

    def moon_centered_ephemeris(self, timestamps_utc: list[str], aberration: str = "LT+S") -> dict[str, Any]:
        t0 = parse_utc_iso(timestamps_utc[0])
        t = np.array([(parse_utc_iso(ts) - t0).total_seconds() for ts in timestamps_utc])
        lam = -2.0 * math.pi * t / (SYNODIC_PERIOD_DAYS * 86400.0)
        d = math.radians(self.subsolar_lat_deg)
        n = len(t)
        sun = AU_IN_KM * np.column_stack([math.cos(d) * np.cos(lam), math.cos(d) * np.sin(lam), np.full(n, math.sin(d))])
        e = math.radians(self.sub_earth_lat_deg)
        earth = np.tile(384_400.0 * np.array([math.cos(e), 0.0, math.sin(e)]), (n, 1))
        return {
            "timestamps_utc": list(timestamps_utc),
            "et_seconds": 846_000_000.0 + t,
            "sun_pos_me_km": sun,
            "earth_pos_me_km": earth,
            "j2000_to_moon_me": np.tile(np.eye(3), (n, 1, 1)),
            "libration_sub_earth_lat_deg": np.full(n, self.sub_earth_lat_deg),
            "libration_sub_earth_lon_deg": np.zeros(n),
        }

    def compute_topocentric_series(
        self,
        site_me_m: np.ndarray,
        lat_deg: float,
        lon_east_deg: float,
        timestamps_utc: list[str],
        aberration: str = "LT+S",
        precomputed_moon_centered: dict[str, Any] | None = None,
    ) -> Any:
        base = precomputed_moon_centered or self.moon_centered_ephemeris(timestamps_utc)
        return topocentric_series_from_moon_centered(base, site_me_m, lat_deg, lon_east_deg)

    def engine(self, site_me_m: np.ndarray, lat_deg: float, lon_east_deg: float, timestamps_utc: list[str]) -> Any:
        """Signature expected by ``validate_ephemeris_against_horizons(engine=...)``."""
        return self.compute_topocentric_series(site_me_m, lat_deg, lon_east_deg, timestamps_utc)


def horizons_date(ts: str) -> str:
    d = parse_utc_iso(ts)
    return f"{d.year:04d}-{_MONTHS[d.month - 1]}-{d.day:02d} {d.hour:02d}:{d.minute:02d}"


def synthetic_horizons_body(rows: list[tuple[str, float, float]], table: str | None = None) -> bytes:
    """JSON body shaped like a Horizons API reply. ``table`` overrides the $$SOE..$$EOE block."""
    if table is None:
        table = "\n".join(f" {horizons_date(ts)}, , ,{az:.6f},{el:.6f}," for ts, az, el in rows)
    result = (
        "*** SYNTHETIC TEST FIXTURE - NOT A JPL HORIZONS RESPONSE ***\n"
        " Date__(UT)__HR:MN, , ,Azi_(a-app),Elev_(a-app),\n"
        "$$SOE\n" + table + "\n$$EOE\n"
    )
    return json.dumps({"signature": {"source": "SYNTHETIC TEST FIXTURE", "version": "0"}, "result": result}).encode("utf-8")


class SyntheticHorizons:
    """Callable ``fetch(url, timeout_s)`` that answers from ``SyntheticEphemeris`` geometry."""

    def __init__(
        self,
        ephemeris: SyntheticEphemeris | None = None,
        el_offset_deg: dict[str, float] | None = None,
        drop_last_row: dict[str, bool] | None = None,
    ) -> None:
        self.ephemeris = ephemeris or SyntheticEphemeris()
        self.el_offset_deg = el_offset_deg or {}
        self.drop_last_row = drop_last_row or {}
        self.calls: list[str] = []

    def __call__(self, url: str, timeout_s: float) -> tuple[int, bytes]:
        self.calls.append(url)
        q = {k: v[0].strip("'") for k, v in parse_qs(urlsplit(url).query).items()}
        lon, lat, elev_km = (float(x) for x in q["SITE_COORD"].split(","))
        start = q["START_TIME"].replace(" ", "T") + ":00Z"
        stop = q["STOP_TIME"].replace(" ", "T") + ":00Z"
        stamps = build_utc_grid(start, stop, parse_step_size_hours(q["STEP_SIZE"]))
        series = self.ephemeris.engine(selenographic_to_cartesian_me(lat, lon, elev_km * 1000.0), lat, lon, stamps)
        target = q["COMMAND"]
        az, el = (series.sun_az_deg, series.sun_el_deg) if target == "10" else (series.earth_az_deg, series.earth_el_deg)
        rows = [(ts, float(a), float(e) + self.el_offset_deg.get(target, 0.0)) for ts, a, e in zip(stamps, az, el)]
        if self.drop_last_row.get(target):
            rows = rows[:-1]
        return 200, synthetic_horizons_body(rows)


def kernel_provenance() -> list[dict[str, str]]:
    return [{"filename": k.filename, "url": k.url, "sha256": k.sha256} for k in NAIF_KERNELS]
