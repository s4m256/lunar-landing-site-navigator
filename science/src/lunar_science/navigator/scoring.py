"""Composite Landing Score (0-100) balancing CLPS slope safety, power, comms, and PSR science."""

from __future__ import annotations

from dataclasses import dataclass

DEFAULT_SCORE_WEIGHTS = {
    "safety": 0.25,
    "power": 0.35,
    "comms": 0.25,
    "science_psr": 0.15,
}


@dataclass(frozen=True)
class LandingScoreWeights:
    safety: float = DEFAULT_SCORE_WEIGHTS["safety"]
    power: float = DEFAULT_SCORE_WEIGHTS["power"]
    comms: float = DEFAULT_SCORE_WEIGHTS["comms"]
    science_psr: float = DEFAULT_SCORE_WEIGHTS["science_psr"]


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def score_slope_safety(slope_deg: float) -> float:
    """CLPS landing hazard score: 100 at <=2 deg, linear decay to 0 at >=15 deg."""
    return _clamp(100.0 * (15.0 - slope_deg) / 13.0)


def score_solar_power(mean_illum_fraction: float, max_continuous_shadow_hours: float) -> float:
    """Power viability (0-100): 70% mean illumination + 30% continuous-shadow resilience."""
    illum_score = _clamp(mean_illum_fraction * 100.0)
    shadow_resilience = _clamp(100.0 * (1.0 - max_continuous_shadow_hours / 360.0))
    return _clamp(0.70 * illum_score + 0.30 * shadow_resilience)


def score_comms_availability(
    dte_full_disk_duty_cycle_pct: float,
    combined_dte_elfo_duty_cycle_pct: float,
    use_relay: bool = True,
) -> float:
    """Telecom score (0-100): combines native DTE capability and ELFO relay resilience."""
    if not use_relay:
        return _clamp(dte_full_disk_duty_cycle_pct)
    return _clamp(0.65 * combined_dte_elfo_duty_cycle_pct + 0.35 * dte_full_disk_duty_cycle_pct)


def score_psr_proximity(psr_distance_m: float, is_psr: bool) -> float:
    """Science value score (0-100): optimal on sunlit terrain within rover reach of a PSR."""
    if is_psr:
        return 15.0
    if psr_distance_m <= 500.0:
        return 100.0
    if psr_distance_m <= 5000.0:
        return _clamp(100.0 - 80.0 * (psr_distance_m - 500.0) / 4500.0)
    return _clamp(20.0 * (1.0 - (psr_distance_m - 5000.0) / 5000.0))


def compute_composite_landing_score(
    slope_deg: float,
    mean_illum_fraction: float,
    max_continuous_shadow_hours: float,
    dte_full_disk_duty_cycle_pct: float,
    combined_dte_elfo_duty_cycle_pct: float,
    psr_distance_m: float,
    is_psr: bool,
    weights: LandingScoreWeights | None = None,
    use_relay: bool = True,
) -> dict[str, float]:
    """Compute broken-down and total 0-100 Landing Score."""
    w = weights or LandingScoreWeights()
    w_sum = max(w.safety + w.power + w.comms + w.science_psr, 1e-9)

    s_safety = score_slope_safety(slope_deg)
    s_power = score_solar_power(mean_illum_fraction, max_continuous_shadow_hours)
    s_comms = score_comms_availability(
        dte_full_disk_duty_cycle_pct, combined_dte_elfo_duty_cycle_pct, use_relay=use_relay
    )
    s_psr = score_psr_proximity(psr_distance_m, is_psr)

    total = (w.safety * s_safety + w.power * s_power + w.comms * s_comms + w.science_psr * s_psr) / w_sum
    return {
        "total_0_100": round(_clamp(total), 2),
        "safety_slope_0_100": round(s_safety, 2),
        "power_0_100": round(s_power, 2),
        "comms_0_100": round(s_comms, 2),
        "science_psr_0_100": round(s_psr, 2),
    }
