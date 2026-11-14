"""Direct-to-Earth (DTE) and Relay Constellation (ELFO / LRO) link analysis."""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from .data_sources import LUNAR_REFERENCE_RADIUS_M, MOON_GM_KM3_S2
from .ephemeris import TopocentricEphemerisSeries, cartesian_me_to_enu_az_el

SPEED_OF_LIGHT_M_S = 299_792_458.0
LUNAR_RADIUS_KM = LUNAR_REFERENCE_RADIUS_M / 1000.0


@dataclass(frozen=True)
class RelayOrbitPreset:
    """Keplerian parameters for a lunar communications relay constellation."""

    key: str
    name: str
    a_km: float
    e: float
    i_deg: float
    omega_deg: float
    raans_deg: tuple[float, ...]
    mean_anomalies_deg: tuple[float, ...]
    max_range_km: float
    antenna_mask_deg: float
    freq_ghz: float

    @property
    def satellites_count(self) -> int:
        return len(self.raans_deg)

    @property
    def period_seconds(self) -> float:
        return 2.0 * math.pi * math.sqrt((self.a_km**3) / MOON_GM_KM3_S2)

    @property
    def period_hours(self) -> float:
        return self.period_seconds / 3600.0

    @property
    def apolune_alt_km(self) -> float:
        return self.a_km * (1.0 + self.e) - LUNAR_RADIUS_KM

    @property
    def perilune_alt_km(self) -> float:
        return self.a_km * (1.0 - self.e) - LUNAR_RADIUS_KM

    def to_contract_dict(self) -> dict[str, float | int | str]:
        return {
            "name": self.name,
            "satellites_count": self.satellites_count,
            "a_km": round(self.a_km, 3),
            "e": round(self.e, 4),
            "i_deg": round(self.i_deg, 3),
            "omega_deg": round(self.omega_deg, 3),
            "period_hours": round(self.period_hours, 4),
            "apolune_alt_km": round(self.apolune_alt_km, 2),
            "perilune_alt_km": round(self.perilune_alt_km, 2),
            "max_range_km": round(self.max_range_km, 1),
            "antenna_mask_deg": round(self.antenna_mask_deg, 2),
            "freq_ghz": round(self.freq_ghz, 4),
        }


LRO_PRESET = RelayOrbitPreset(
    key="lro",
    name="LRO-like Polar Orbiter (50 km)",
    a_km=LUNAR_RADIUS_KM + 50.0,
    e=0.0,
    i_deg=90.0,
    omega_deg=90.0,
    raans_deg=(0.0,),
    mean_anomalies_deg=(0.0,),
    max_range_km=1200.0,
    antenna_mask_deg=5.0,
    freq_ghz=2.271,
)

ELFO_PATHFINDER_PRESET = RelayOrbitPreset(
    key="elfo_pathfinder",
    name="ELFO Single Relay (Lunar Pathfinder)",
    a_km=5740.0,
    e=0.58,
    i_deg=57.8,
    omega_deg=90.0,
    raans_deg=(0.0,),
    mean_anomalies_deg=(180.0,),
    max_range_km=12000.0,
    antenna_mask_deg=5.0,
    freq_ghz=2.25,
)

ELFO_CONSTELLATION_PRESET = RelayOrbitPreset(
    key="elfo_constellation",
    name="ELFO 3-Sat Phased Constellation (LunaNet South Pole)",
    a_km=5740.0,
    e=0.58,
    i_deg=57.8,
    omega_deg=90.0,
    raans_deg=(0.0, 120.0, 240.0),
    mean_anomalies_deg=(180.0, 60.0, 300.0),
    max_range_km=12000.0,
    antenna_mask_deg=5.0,
    freq_ghz=2.25,
)

RELAY_PRESETS: dict[str, RelayOrbitPreset] = {
    "lro": LRO_PRESET,
    "elfo_pathfinder": ELFO_PATHFINDER_PRESET,
    "elfo_constellation": ELFO_CONSTELLATION_PRESET,
}


def interpolate_horizon_elev(
    az_deg: np.ndarray | float,
    horizon_az_deg: np.ndarray,
    horizon_elev_deg: np.ndarray,
) -> np.ndarray:
    """Periodic linear interpolation of local horizon elevation angle h_horiz(Az)."""
    az_arr = np.mod(np.asarray(az_deg, dtype=np.float64), 360.0)
    az_grid = np.asarray(horizon_az_deg, dtype=np.float64)
    el_grid = np.asarray(horizon_elev_deg, dtype=np.float64)
    if az_grid[0] > 0.0:
        az_ext = np.concatenate([[0.0], az_grid, [360.0]])
        el_ext = np.concatenate([[el_grid[-1]], el_grid, [el_grid[0]]])
    else:
        az_ext = np.concatenate([az_grid, [360.0]])
        el_ext = np.concatenate([el_grid, [el_grid[0]]])
    return np.interp(az_arr, az_ext, el_ext)


def solve_kepler_eccentric_anomaly(mean_anomaly_rad: np.ndarray, e: float) -> np.ndarray:
    """Solve Kepler equation M = E - e sin(E) via damped Newton-Raphson iterations."""
    m = np.mod(np.asarray(mean_anomaly_rad, dtype=np.float64), 2.0 * math.pi)
    if e < 1e-10:
        return m
    ecc = m.copy()
    for _ in range(12):
        f = ecc - e * np.sin(ecc) - m
        fp = 1.0 - e * np.cos(ecc)
        step = f / fp
        ecc -= step
        if float(np.max(np.abs(step))) < 1e-11:
            break
    return ecc


def propagate_kepler_lunar_inertial(
    a_km: float,
    e: float,
    i_deg: float,
    raan_deg: float,
    omega_deg: float,
    m0_deg: float,
    dt_seconds: np.ndarray,
) -> np.ndarray:
    """Propagate Keplerian orbit in Moon-equatorial inertial frame, returning (N, 3) km."""
    n_rad_s = math.sqrt(MOON_GM_KM3_S2 / (a_km**3))
    m_rad = math.radians(m0_deg) + n_rad_s * np.asarray(dt_seconds, dtype=np.float64)
    ecc = solve_kepler_eccentric_anomaly(m_rad, e)

    cos_e = np.cos(ecc)
    sin_e = np.sin(ecc)
    sqrt_one_minus_e2 = math.sqrt(max(0.0, 1.0 - e * e))
    x_orb = a_km * (cos_e - e)
    y_orb = a_km * sqrt_one_minus_e2 * sin_e

    om = math.radians(omega_deg)
    inc = math.radians(i_deg)
    raan = math.radians(raan_deg)

    cO, sO = math.cos(raan), math.sin(raan)
    co, so = math.cos(om), math.sin(om)
    ci, si = math.cos(inc), math.sin(inc)

    px = cO * co - sO * so * ci
    py = sO * co + cO * so * ci
    pz = so * si

    qx = -cO * so - sO * co * ci
    qy = -sO * so + cO * co * ci
    qz = co * si

    x = px * x_orb + qx * y_orb
    y = py * x_orb + qy * y_orb
    z = pz * x_orb + qz * y_orb
    return np.column_stack([x, y, z])


def propagate_preset_in_moon_me(
    preset: RelayOrbitPreset,
    et_seconds: np.ndarray,
    j2000_to_moon_me: np.ndarray,
) -> np.ndarray:
    """Return satellite positions (S, N, 3) in MOON_ME frame (km) across all S satellites.

    The inertial orbital plane is anchored to the Moon's equatorial pole at the mission window
    start epoch so frozen inclination ``i`` and South Pole apolune ``omega = +90 deg`` stay fixed
    relative to the lunar equator while the Moon rotates beneath the inertial orbit.
    """
    dt_seconds = np.asarray(et_seconds, dtype=np.float64) - float(et_seconds[0])
    # Lunar equatorial inertial -> MOON_ME(t): R(t) @ R(t0)^T
    r_me0_to_j2000 = np.asarray(j2000_to_moon_me[0], dtype=np.float64).T
    r_eq_to_me = np.einsum("nij,jk->nik", j2000_to_moon_me, r_me0_to_j2000)

    all_sats: list[np.ndarray] = []
    for raan_deg, m0_deg in zip(preset.raans_deg, preset.mean_anomalies_deg, strict=True):
        pos_inertial = propagate_kepler_lunar_inertial(
            a_km=preset.a_km,
            e=preset.e,
            i_deg=preset.i_deg,
            raan_deg=raan_deg,
            omega_deg=preset.omega_deg,
            m0_deg=m0_deg,
            dt_seconds=dt_seconds,
        )
        pos_me = np.einsum("nij,nj->ni", r_eq_to_me, pos_inertial)
        all_sats.append(pos_me)
    return np.stack(all_sats, axis=0)


def check_segment_clears_moon(
    sat_pos_me_km: np.ndarray,
    earth_pos_me_km: np.ndarray,
    occultation_radius_km: float = LUNAR_RADIUS_KM,
) -> np.ndarray:
    """Check condition 3: finite segment sat -> Earth does not intersect Moon sphere."""
    d = earth_pos_me_km - sat_pos_me_km
    dd = np.sum(d * d, axis=-1)
    safe_dd = np.maximum(dd, 1e-12)
    s_star = np.clip(-np.sum(sat_pos_me_km * d, axis=-1) / safe_dd, 0.0, 1.0)
    closest = sat_pos_me_km + s_star[..., np.newaxis] * d
    dist_center = np.linalg.norm(closest, axis=-1)
    sat_radius = np.linalg.norm(sat_pos_me_km, axis=-1)
    return (dist_center > occultation_radius_km) & (sat_radius > occultation_radius_km)


def compute_fspl_db(range_km: np.ndarray, freq_ghz: float) -> np.ndarray:
    """Free-Space Path Loss in dB: FSPL = 20*log10(4*pi*d*f/c)."""
    range_m = np.maximum(np.asarray(range_km, dtype=np.float64), 1e-3) * 1000.0
    freq_hz = freq_ghz * 1e9
    return 20.0 * np.log10((4.0 * math.pi * range_m * freq_hz) / SPEED_OF_LIGHT_M_S)


def max_blackout_duration_hours(link_mask: np.ndarray, step_hours: float) -> float:
    """Return longest contiguous outage interval (hours) across boolean visibility series."""
    max_run = 0
    current = 0
    for ok in np.asarray(link_mask, dtype=bool):
        if ok:
            current = 0
        else:
            current += 1
            if current > max_run:
                max_run = current
    return float(max_run * step_hours)


def evaluate_relay_preset(
    preset: RelayOrbitPreset,
    site_me_m: np.ndarray,
    lat_deg: float,
    lon_east_deg: float,
    horizon_az_deg: np.ndarray,
    horizon_elev_deg: np.ndarray,
    et_seconds: np.ndarray,
    earth_pos_me_km: np.ndarray,
    j2000_to_moon_me: np.ndarray,
) -> dict[str, np.ndarray]:
    """Evaluate 3-condition relay link visibility for every satellite & epoch."""
    site_me_km = np.asarray(site_me_m, dtype=np.float64) / 1000.0
    sat_pos_me_km = propagate_preset_in_moon_me(preset, et_seconds, j2000_to_moon_me)
    s_count, n_epochs, _ = sat_pos_me_km.shape

    sat_alt_km = np.linalg.norm(sat_pos_me_km, axis=-1) - LUNAR_RADIUS_KM
    sat_az_deg = np.empty((s_count, n_epochs), dtype=np.float64)
    sat_el_deg = np.empty((s_count, n_epochs), dtype=np.float64)
    sat_range_km = np.empty((s_count, n_epochs), dtype=np.float64)
    terrain_ok = np.zeros((s_count, n_epochs), dtype=bool)
    range_ok = np.zeros((s_count, n_epochs), dtype=bool)
    earth_los_ok = np.zeros((s_count, n_epochs), dtype=bool)

    for s_idx in range(s_count):
        delta = sat_pos_me_km[s_idx] - site_me_km[np.newaxis, :]
        az, el, rng = cartesian_me_to_enu_az_el(delta, lat_deg, lon_east_deg)
        sat_az_deg[s_idx] = az
        sat_el_deg[s_idx] = el
        sat_range_km[s_idx] = rng
        horiz = interpolate_horizon_elev(az, horizon_az_deg, horizon_elev_deg)
        terrain_ok[s_idx] = el > (horiz + preset.antenna_mask_deg)
        range_ok[s_idx] = rng <= preset.max_range_km
        earth_los_ok[s_idx] = check_segment_clears_moon(sat_pos_me_km[s_idx], earth_pos_me_km)

    sat_visible = terrain_ok & range_ok & earth_los_ok
    sat_fspl_db = compute_fspl_db(sat_range_km, preset.freq_ghz)

    any_visible = np.any(sat_visible, axis=0)
    # Pick visible satellite with minimum FSPL when available; else minimum FSPL overall
    masked_fspl = np.where(sat_visible, sat_fspl_db, np.inf)
    best_visible_idx = np.argmin(masked_fspl, axis=0)
    fallback_idx = np.argmin(sat_fspl_db, axis=0)
    best_idx = np.where(any_visible, best_visible_idx, fallback_idx)
    epoch_indices = np.arange(n_epochs)

    return {
        "sat_visible": sat_visible,
        "any_visible": any_visible,
        "primary_az_deg": sat_az_deg[0],
        "primary_el_deg": sat_el_deg[0],
        "primary_alt_km": sat_alt_km[0],
        "primary_range_km": sat_range_km[0],
        "primary_earth_los": earth_los_ok[0],
        "primary_visible": sat_visible[0],
        "best_alt_km": sat_alt_km[best_idx, epoch_indices],
        "best_fspl_db": sat_fspl_db[best_idx, epoch_indices],
    }


def analyze_site_comms(
    ephemeris: TopocentricEphemerisSeries,
    site_me_m: np.ndarray,
    lat_deg: float,
    lon_east_deg: float,
    horizon_az_deg: np.ndarray,
    horizon_elev_deg: np.ndarray,
    step_seconds: int,
    high_res_lro: dict[str, np.ndarray] | None = None,
) -> dict[str, object]:
    """Compute DTE, ELFO Pathfinder/Constellation, and LRO comms metrics and series."""
    horiz_at_earth = interpolate_horizon_elev(
        ephemeris.earth_az_deg, horizon_az_deg, horizon_elev_deg
    )
    dte_center_mask = ephemeris.earth_el_deg > horiz_at_earth
    dte_full_mask = (ephemeris.earth_el_deg - ephemeris.earth_angular_radius_deg) > horiz_at_earth

    elfo = evaluate_relay_preset(
        preset=ELFO_CONSTELLATION_PRESET,
        site_me_m=site_me_m,
        lat_deg=lat_deg,
        lon_east_deg=lon_east_deg,
        horizon_az_deg=horizon_az_deg,
        horizon_elev_deg=horizon_elev_deg,
        et_seconds=ephemeris.et_seconds,
        earth_pos_me_km=ephemeris.earth_pos_me_km,
        j2000_to_moon_me=ephemeris.j2000_to_moon_me,
    )

    lro_series = evaluate_relay_preset(
        preset=LRO_PRESET,
        site_me_m=site_me_m,
        lat_deg=lat_deg,
        lon_east_deg=lon_east_deg,
        horizon_az_deg=horizon_az_deg,
        horizon_elev_deg=horizon_elev_deg,
        et_seconds=ephemeris.et_seconds,
        earth_pos_me_km=ephemeris.earth_pos_me_km,
        j2000_to_moon_me=ephemeris.j2000_to_moon_me,
    )

    # Use high-resolution 5-minute evaluation for LRO duty cycle when available (avoids 113m orbit aliasing)
    if high_res_lro is not None:
        lro_hr = evaluate_relay_preset(
            preset=LRO_PRESET,
            site_me_m=site_me_m,
            lat_deg=lat_deg,
            lon_east_deg=lon_east_deg,
            horizon_az_deg=horizon_az_deg,
            horizon_elev_deg=horizon_elev_deg,
            et_seconds=high_res_lro["et_seconds"],
            earth_pos_me_km=high_res_lro["earth_pos_me_km"],
            j2000_to_moon_me=high_res_lro["j2000_to_moon_me"],
        )
        lro_duty_pct = float(np.mean(lro_hr["any_visible"]) * 100.0)
    else:
        lro_duty_pct = float(np.mean(lro_series["any_visible"]) * 100.0)

    step_hours = step_seconds / 3600.0
    dte_center_pct = float(np.mean(dte_center_mask) * 100.0)
    dte_full_pct = float(np.mean(dte_full_mask) * 100.0)
    elfo_single_pct = float(np.mean(elfo["primary_visible"]) * 100.0)
    elfo_const_pct = float(np.mean(elfo["any_visible"]) * 100.0)
    combined_mask = dte_full_mask | elfo["any_visible"]
    combined_pct = float(np.mean(combined_mask) * 100.0)

    visible_elfo = elfo["any_visible"]
    if np.any(visible_elfo):
        mean_elfo_alt_km = float(np.mean(elfo["best_alt_km"][visible_elfo]))
        mean_elfo_fspl_db = float(np.mean(elfo["best_fspl_db"][visible_elfo]))
    else:
        mean_elfo_alt_km = float(np.mean(elfo["best_alt_km"]))
        mean_elfo_fspl_db = float(np.mean(elfo["best_fspl_db"]))

    summary = {
        "dte_center_duty_cycle_pct": round(dte_center_pct, 2),
        "dte_full_disk_duty_cycle_pct": round(dte_full_pct, 2),
        "elfo_pathfinder_duty_cycle_pct": round(elfo_single_pct, 2),
        "elfo_constellation_duty_cycle_pct": round(elfo_const_pct, 2),
        "lro_duty_cycle_pct": round(lro_duty_pct, 2),
        "combined_dte_elfo_duty_cycle_pct": round(combined_pct, 2),
        "relay_coverage_gain_pct": round(combined_pct - dte_full_pct, 2),
        "max_blackout_dte_hours": round(max_blackout_duration_hours(dte_full_mask, step_hours), 2),
        "max_blackout_combined_hours": round(max_blackout_duration_hours(combined_mask, step_hours), 2),
        "mean_elfo_altitude_km": round(mean_elfo_alt_km, 2),
        "mean_elfo_fspl_db": round(mean_elfo_fspl_db, 2),
    }

    series = {
        "elfo_primary_az_deg": [round(float(x), 3) for x in elfo["primary_az_deg"]],
        "elfo_primary_el_deg": [round(float(x), 3) for x in elfo["primary_el_deg"]],
        "elfo_primary_alt_km": [round(float(x), 2) for x in elfo["primary_alt_km"]],
        "elfo_primary_range_km": [round(float(x), 2) for x in elfo["primary_range_km"]],
        "elfo_primary_earth_los": [bool(x) for x in elfo["primary_earth_los"]],
        "elfo_constellation_visible": [bool(x) for x in elfo["any_visible"]],
        "elfo_constellation_best_alt_km": [round(float(x), 2) for x in elfo["best_alt_km"]],
        "elfo_constellation_best_fspl_db": [round(float(x), 2) for x in elfo["best_fspl_db"]],
        "lro_visible": [bool(x) for x in lro_series["any_visible"]],
    }

    return {"summary": summary, "series": series}
