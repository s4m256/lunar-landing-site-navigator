"""Solar disk partial-eclipse illumination, panel power, and survival battery sizing."""

from __future__ import annotations

import math

import numpy as np

from .comms import interpolate_horizon_elev
from .data_sources import SOLAR_CONSTANT_1AU_W_M2

DEFAULT_PANEL_EFFICIENCY = 0.28
BASELINE_SURVIVAL_LOAD_W = 100.0


def compute_solar_illum_fraction(
    sun_el_deg: np.ndarray | float,
    horizon_at_sun_az_deg: np.ndarray | float,
    solar_angular_radius_deg: np.ndarray | float,
) -> np.ndarray:
    """Exact circular-segment solar disk fraction f_illum(t) in [0, 1]."""
    delta_h = np.asarray(sun_el_deg, dtype=np.float64) - np.asarray(
        horizon_at_sun_az_deg, dtype=np.float64
    )
    radius = np.maximum(np.asarray(solar_angular_radius_deg, dtype=np.float64), 1e-6)
    u = delta_h / radius

    result = np.empty_like(u, dtype=np.float64)
    full = u >= 1.0
    dark = u <= -1.0
    partial = ~(full | dark)

    result[full] = 1.0
    result[dark] = 0.0
    if np.any(partial):
        up = np.clip(u[partial], -1.0, 1.0)
        result[partial] = (1.0 / math.pi) * np.arccos(-up) + (up / math.pi) * np.sqrt(
            np.maximum(0.0, 1.0 - up * up)
        )
    return result


def compute_solar_irradiance_w_m2(sun_dist_au: np.ndarray | float) -> np.ndarray:
    """Instantaneous top-of-Moon solar irradiance G(t) = 1361 / d_au^2 [W/m^2]."""
    d = np.maximum(np.asarray(sun_dist_au, dtype=np.float64), 1e-3)
    return SOLAR_CONSTANT_1AU_W_M2 / (d * d)


def sun_unit_vectors_enu(
    sun_az_deg: np.ndarray,
    sun_el_deg: np.ndarray,
) -> np.ndarray:
    """Unit direction vectors s_hat(t) in local (East, North, Up) coordinates."""
    az = np.radians(sun_az_deg)
    el = np.radians(sun_el_deg)
    cos_el = np.cos(el)
    return np.column_stack(
        [
            cos_el * np.sin(az),
            cos_el * np.cos(az),
            np.sin(el),
        ]
    )


def max_continuous_shadow_hours(f_illum: np.ndarray, step_hours: float) -> float:
    """Longest continuous zero-illumination interval (hours)."""
    max_run = 0
    current = 0
    for val in np.asarray(f_illum, dtype=np.float64):
        if val <= 1e-6:
            current += 1
            if current > max_run:
                max_run = current
        else:
            current = 0
    return float(max_run * step_hours)


def integrate_trapezoid_wh(power_w: np.ndarray, dt_hours: float) -> float:
    """Integrate power curve over uniform dt_hours using trapezoidal rule."""
    arr = np.asarray(power_w, dtype=np.float64)
    if len(arr) < 2:
        return 0.0
    return float(np.trapezoid(arr, dx=dt_hours))


def analyze_site_solar(
    sun_az_deg: np.ndarray,
    sun_el_deg: np.ndarray,
    sun_dist_au: np.ndarray,
    solar_angular_radius_deg: np.ndarray,
    horizon_az_deg: np.ndarray,
    horizon_elev_deg: np.ndarray,
    step_seconds: int,
    panel_efficiency: float = DEFAULT_PANEL_EFFICIENCY,
    survival_load_w: float = BASELINE_SURVIVAL_LOAD_W,
) -> dict[str, object]:
    """Compute solar illumination fraction, panel yields (W/m^2 & Wh/m^2), and battery sizing."""
    horiz_at_sun = interpolate_horizon_elev(sun_az_deg, horizon_az_deg, horizon_elev_deg)
    f_illum = compute_solar_illum_fraction(sun_el_deg, horiz_at_sun, solar_angular_radius_deg)
    g_w_m2 = compute_solar_irradiance_w_m2(sun_dist_au)

    sun_el_rad = np.radians(sun_el_deg)
    s_enu = sun_unit_vectors_enu(sun_az_deg, sun_el_deg)

    # 1. Vertical azimuth-tracking panel: tracks azimuth, faces horizon -> cos(sun_el)
    p_track_w_m2 = panel_efficiency * g_w_m2 * f_illum * np.maximum(0.0, np.cos(sun_el_rad))
    # 2. Fixed vertical panel facing North (equatorward at Moon South Pole): n = (0, 1, 0)
    p_fixed_north_w_m2 = panel_efficiency * g_w_m2 * f_illum * np.maximum(0.0, s_enu[:, 1])
    # 3. Fixed horizontal flat-deck panel: n = (0, 0, 1)
    p_fixed_horiz_w_m2 = panel_efficiency * g_w_m2 * f_illum * np.maximum(0.0, s_enu[:, 2])

    step_hours = step_seconds / 3600.0
    total_hours = max(step_hours * max(len(f_illum) - 1, 1), step_hours)
    energy_track = integrate_trapezoid_wh(p_track_w_m2, step_hours)
    energy_north = integrate_trapezoid_wh(p_fixed_north_w_m2, step_hours)
    energy_horiz = integrate_trapezoid_wh(p_fixed_horiz_w_m2, step_hours)

    mean_illum = float(np.mean(f_illum))
    sunlit_hours = float(integrate_trapezoid_wh((f_illum > 1e-6).astype(np.float64), step_hours))
    shadow_max_h = max_continuous_shadow_hours(f_illum, step_hours)
    min_battery_wh = survival_load_w * shadow_max_h

    summary = {
        "mean_illum_fraction": round(min(1.0, max(0.0, mean_illum)), 4),
        "sunlit_hours": round(min(total_hours, max(0.0, sunlit_hours)), 2),
        "max_continuous_shadow_hours": round(shadow_max_h, 2),
        "energy_tracking_wh_m2": round(max(0.0, energy_track), 1),
        "energy_fixed_north_wh_m2": round(max(0.0, energy_north), 1),
        "energy_fixed_horiz_wh_m2": round(max(0.0, energy_horiz), 1),
        "min_battery_100w_wh": round(max(0.0, min_battery_wh), 1),
    }

    return {
        "summary": summary,
        "f_illum": f_illum,
        "g_w_m2": g_w_m2,
        "p_track_w_m2": p_track_w_m2,
        "p_fixed_north_w_m2": p_fixed_north_w_m2,
        "p_fixed_horiz_w_m2": p_fixed_horiz_w_m2,
    }
