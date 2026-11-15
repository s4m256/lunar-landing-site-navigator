"""Generate ``independent_de421_reference.json`` without the SPICE toolkit.

Not run by the test suite or CI; the JSON it writes is committed. Inputs come from PyPI only
(NAIF/PDS hosts are not needed):

* ``--spk`` ``de421.bsp`` from ``skyfield-data==7.0.0`` (SHA-256 a20a7139..., a different file
  packaging than the NAIF ``de421.bsp`` pinned in ``data_sources.py``).
* ``--bpc`` ``moon_pa_de421_1900-2050.bpc`` and ``--fk`` ``moon_080317.tf`` from
  ``lunarsky==1.0.1.post2``; both SHA-256 values equal the NAIF pins in ``data_sources.py``.

Method (all written here, no CSPICE call):

* UTC -> TDB: TT = UTC + 37 s + 32.184 s (same leap-second table as ``naif0012.tls``, whose last
  entry is 2017-01-01) and TDB - TT = K sin(E), E = M + EB sin(M), M = M0 + M1 * t, with the NAIF
  LSK constants K = 1.657e-3 s, EB = 1.671e-2, M0 = 6.239996, M1 = 1.99096871e-7 rad/s.
* Positions: jplephem SPK segments SSB->Sun, SSB->EMB, EMB->Earth, EMB->Moon (km, TDB).
* Apparent direction from the Moon center, matching SPICE ``LT+S`` with observer MOON: one
  Newtonian light-time iteration, then stellar aberration by rotating the light-time-corrected
  direction toward the Moon's barycentric velocity by asin(|u x v/c|).
* Orientation: J2000 -> MOON_PA_DE421 from the binary PCK Euler angles (R3(w) R1(delta) R3(phi))
  read with jplephem; MOON_PA_DE421 -> MOON_ME_DE421 = R1(-a3) R2(-a2) R3(-a1) with the
  TKFRAME_31007 angles parsed from the FK.

This checks implementation and conventions (frames, time scales, aberration, topocentric
projection) against an independent code path on the same DE421 data. It does not test DE421
against reality, nor against JPL Horizons.

Usage::

    python -I generate_independent_de421_reference.py --spk de421.bsp \
        --bpc moon_pa_de421_1900-2050.bpc --fk moon_080317.tf --out independent_de421_reference.json
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import re
from pathlib import Path

import numpy as np
from jplephem.pck import PCK
from jplephem.spk import SPK

EXPECTED_SHA256 = {
    "spk": "a20a7139da04cbc462454634918e9a9ca69127044e2cc9d4f9c16e238d2deedc",
    "bpc": "656f90616403d75a75f0cd6c8830fc5b44f8cb4facb5ccb8915e752b397520cf",
    "fk": "78732477b96f9863e7b0d65bcee3c22b8707ca5ed0db56d1173319cb2e8c7993",
}
C_KM_S = 299_792.458
ARCSEC = math.pi / 180.0 / 3600.0
J2000_JD = 2451545.0
# Window of the committed dataset, sampled every 6 h (includes the 2-day Horizons grid).
WINDOW_START = dt.datetime(2026, 11, 15, tzinfo=dt.timezone.utc)
WINDOW_HOURS = 720
STEP_HOURS = 6
# Reference site of the committed Horizons comparison artifact.
REFERENCE_SITE = {"latitude_deg": -89.45, "longitude_east_deg": 222.5, "elevation_m": 1953.07}
LUNAR_RADIUS_KM = 1737.4


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def r1(a: float) -> np.ndarray:
    c, s = math.cos(a), math.sin(a)
    return np.array([[1.0, 0.0, 0.0], [0.0, c, s], [0.0, -s, c]])


def r2(a: float) -> np.ndarray:
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0.0, -s], [0.0, 1.0, 0.0], [s, 0.0, c]])


def r3(a: float) -> np.ndarray:
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, s, 0.0], [-s, c, 0.0], [0.0, 0.0, 1.0]])


def tdb_seconds_from_utc(t: dt.datetime) -> float:
    """TDB seconds past J2000 for a UTC instant after 2017-01-01 (NAIF LSK model)."""
    naive = (t.replace(tzinfo=None) - dt.datetime(2000, 1, 1, 12)).total_seconds()
    tt = naive + 37.0 + 32.184
    m = 6.239996 + 1.99096871e-7 * tt
    e = m + 1.671e-2 * math.sin(m)
    return tt + 1.657e-3 * math.sin(e)


def parse_pa_to_me(fk_text: str) -> np.ndarray:
    angles = re.search(r"TKFRAME_31007_ANGLES\s*=\s*\(([^)]*)\)", fk_text)
    axes = re.search(r"TKFRAME_31007_AXES\s*=\s*\(([^)]*)\)", fk_text)
    units = re.search(r"TKFRAME_31007_UNITS\s*=\s*'([^']*)'", fk_text)
    if not (angles and axes and units) or units.group(1).strip().upper() != "ARCSECONDS":
        raise ValueError("TKFRAME_31007 block not found or not in arcseconds")
    a = [float(x) for x in angles.group(1).replace(",", " ").split()]
    ax = [int(x) for x in axes.group(1).replace(",", " ").split()]
    if ax != [3, 2, 1] or len(a) != 3:
        raise ValueError(f"Unexpected TKFRAME_31007 axes {ax}")
    return r1(-a[2] * ARCSEC) @ r2(-a[1] * ARCSEC) @ r3(-a[0] * ARCSEC)


class IndependentDe421:
    def __init__(self, spk_path: Path, bpc_path: Path, fk_path: Path) -> None:
        self.spk = SPK.open(str(spk_path))
        pck = PCK.open(str(bpc_path))
        (self.pa_segment,) = [s for s in pck.segments if s.body == 31006 and s.frame == 1]
        self.pa_to_me = parse_pa_to_me(fk_path.read_text(encoding="latin-1"))

    def _pos(self, code: int, jd: np.ndarray) -> np.ndarray:
        if code == 10:
            return self.spk[0, 10].compute(jd)
        return self.spk[0, 3].compute(jd) + self.spk[3, code].compute(jd)

    def _moon_state(self, jd: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        p0, v0 = self.spk[0, 3].compute_and_differentiate(jd)
        p1, v1 = self.spk[3, 301].compute_and_differentiate(jd)
        return p0 + p1, (v0 + v1) / 86400.0  # km, km/s

    def j2000_to_me(self, et: np.ndarray) -> np.ndarray:
        jd = J2000_JD + et / 86400.0
        phi, delta, w = self.pa_segment.compute(jd, 0.0, derivative=False)
        mats = np.empty((len(et), 3, 3))
        for i in range(len(et)):
            mats[i] = self.pa_to_me @ r3(w[i]) @ r1(delta[i]) @ r3(phi[i])
        return mats

    def apparent_j2000(self, code: int, et: np.ndarray) -> np.ndarray:
        """Apparent (LT+S) position of ``code`` seen from the Moon center, J2000 km, shape (N, 3)."""
        jd = J2000_JD + et / 86400.0
        pm, vm = self._moon_state(jd)
        lt = np.linalg.norm(self._pos(code, jd) - pm, axis=0) / C_KM_S
        d = self._pos(code, jd - lt / 86400.0) - pm  # one light-time iteration, as SPICE "LT"
        d = d.T
        rng = np.linalg.norm(d, axis=1)
        u = d / rng[:, None]
        beta = vm.T / C_KM_S
        perp = beta - np.sum(u * beta, axis=1)[:, None] * u  # = sin(phi) * unit perpendicular
        sin_phi = np.linalg.norm(perp, axis=1)
        u_app = np.sqrt(1.0 - sin_phi**2)[:, None] * u + perp
        return u_app * rng[:, None]

    def moon_centered_me(self, et: np.ndarray) -> dict[str, np.ndarray]:
        m = self.j2000_to_me(et)
        sun = np.einsum("nij,nj->ni", m, self.apparent_j2000(10, et))
        earth = np.einsum("nij,nj->ni", m, self.apparent_j2000(399, et))
        return {"sun_pos_me_km": sun, "earth_pos_me_km": earth, "j2000_to_moon_me": m}


def topocentric_az_el(vec_me_km: np.ndarray, lat_deg: float, lon_deg: float, elev_m: float) -> tuple[np.ndarray, np.ndarray]:
    """Independent ENU projection (dot products with explicit East/North/Up unit vectors)."""
    la, lo = math.radians(lat_deg), math.radians(lon_deg)
    r = LUNAR_RADIUS_KM + elev_m / 1000.0
    up = np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])
    east = np.array([-math.sin(lo), math.cos(lo), 0.0])
    north = np.cross(up, east)
    d = vec_me_km - r * up
    az = np.degrees(np.arctan2(d @ east, d @ north)) % 360.0
    el = np.degrees(np.arcsin((d @ up) / np.linalg.norm(d, axis=1)))
    return az, el


def subsolar_lat(sun_me: np.ndarray) -> np.ndarray:
    return np.degrees(np.arcsin(sun_me[:, 2] / np.linalg.norm(sun_me, axis=1)))


def long_span_subsolar_extremes(eph: IndependentDe421) -> dict[str, object]:
    """Extremes of the Moon-centered sub-solar latitude in MOON_ME over the BPC span.

    Daily scan from 1900-01-02 to 2049-12-31 (TDB), then hourly refinement +/-2 days around the
    global minimum and maximum.
    """
    t0 = (dt.datetime(1900, 1, 2) - dt.datetime(2000, 1, 1, 12)).total_seconds()
    t1 = (dt.datetime(2049, 12, 31) - dt.datetime(2000, 1, 1, 12)).total_seconds()
    et = np.arange(t0, t1, 86400.0)
    lat = np.empty(len(et))
    for start in range(0, len(et), 5000):
        chunk = et[start : start + 5000]
        lat[start : start + 5000] = subsolar_lat(eph.moon_centered_me(chunk)["sun_pos_me_km"])
    out: dict[str, object] = {}
    for name, idx in (("min", int(np.argmin(lat))), ("max", int(np.argmax(lat)))):
        fine = np.arange(et[idx] - 2 * 86400.0, et[idx] + 2 * 86400.0, 3600.0)
        fine_lat = subsolar_lat(eph.moon_centered_me(fine)["sun_pos_me_km"])
        j = int(np.argmin(fine_lat) if name == "min" else np.argmax(fine_lat))
        when = dt.datetime(2000, 1, 1, 12) + dt.timedelta(seconds=float(fine[j]))
        out[f"{name}_deg"] = float(fine_lat[j])
        out[f"{name}_epoch_tdb"] = when.strftime("%Y-%m-%dT%H:%M:%S")
    out["scan"] = "daily 1900-01-02..2049-12-31 TDB, hourly refinement +/-2 d around each extreme"
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--spk", type=Path, required=True)
    parser.add_argument("--bpc", type=Path, required=True)
    parser.add_argument("--fk", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    for key in ("spk", "bpc", "fk"):
        digest = sha256(getattr(args, key))
        if digest != EXPECTED_SHA256[key]:
            raise SystemExit(f"{key}: SHA-256 {digest} != expected {EXPECTED_SHA256[key]}")

    eph = IndependentDe421(args.spk, args.bpc, args.fk)
    stamps = [WINDOW_START + dt.timedelta(hours=h) for h in range(0, WINDOW_HOURS + 1, STEP_HOURS)]
    et = np.array([tdb_seconds_from_utc(t) for t in stamps])
    base = eph.moon_centered_me(et)
    ref_az = {}
    for key in ("sun", "earth"):
        az, el = topocentric_az_el(
            base[f"{key}_pos_me_km"],
            REFERENCE_SITE["latitude_deg"],
            REFERENCE_SITE["longitude_east_deg"],
            REFERENCE_SITE["elevation_m"],
        )
        ref_az[key] = {"az_deg": az.tolist(), "el_deg": el.tolist()}
    window_lat = subsolar_lat(base["sun_pos_me_km"])

    fixture = {
        "description": (
            "Independent (no SPICE toolkit) DE421 apparent Sun/Earth geometry seen from the Moon "
            "center in MOON_ME, for regression tests of the navigator engine and of the committed "
            "dataset. Tests implementation and conventions, not DE421 accuracy nor Horizons."
        ),
        "generator": "science/tests/fixtures/generate_independent_de421_reference.py",
        "generated_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "inputs": {
            "spk": {"file": "de421.bsp", "source": "PyPI skyfield-data==7.0.0", "sha256": EXPECTED_SHA256["spk"]},
            "bpc": {"file": "moon_pa_de421_1900-2050.bpc", "source": "PyPI lunarsky==1.0.1.post2", "sha256": EXPECTED_SHA256["bpc"]},
            "fk": {"file": "moon_080317.tf", "source": "PyPI lunarsky==1.0.1.post2", "sha256": EXPECTED_SHA256["fk"]},
        },
        "method": {
            "time": "TT = UTC + 69.184 s (37 leap seconds, as naif0012.tls); TDB - TT = 1.657e-3 sin(E) s",
            "aberration": "LT+S from the Moon center: one Newtonian light-time iteration, then stellar aberration with the Moon barycentric velocity",
            "orientation": "J2000->MOON_PA_DE421 from BPC Euler angles (3-1-3); MOON_PA_DE421->MOON_ME_DE421 from TKFRAME_31007 (R1(-a3) R2(-a2) R3(-a1))",
            "units": "km, MOON_ME axes, Moon-centered apparent positions",
        },
        "timestamps_utc": [t.strftime("%Y-%m-%dT%H:%M:%SZ") for t in stamps],
        "et_seconds": et.tolist(),
        "sun_pos_me_km": base["sun_pos_me_km"].tolist(),
        "earth_pos_me_km": base["earth_pos_me_km"].tolist(),
        "reference_site": {**REFERENCE_SITE, "sphere_radius_km": LUNAR_RADIUS_KM, "independent_topocentric": ref_az},
        "window_subsolar_latitude_deg": {"min": float(window_lat.min()), "max": float(window_lat.max())},
        "subsolar_latitude_extremes_1900_2050": long_span_subsolar_extremes(eph),
    }
    args.out.write_text(json.dumps(fixture, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {args.out} ({len(stamps)} epochs)")


if __name__ == "__main__":
    main()
