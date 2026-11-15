"""ILLUSTRATIVE composite Landing Score (0-100). Not a validated scientific ranking.

Every weight and threshold below is an unsourced placeholder kept configurable (SPA-9 audit
section 6.4): the 0.25/0.35/0.25/0.15 weights, the 70/30 power blend, the 360 h shadow
normalization, the 65/35 communications blend, the 15 points given to PSR points, the
500-5000 m "rover reach" ramp and the 2-15 deg slope ramp. No sensitivity or uncertainty analysis
exists. Use the index to explore trade-offs, not to rank sites scientifically.

Hard constraint: a slope above ``slope_limit_deg`` (default ``DEFAULT_SLOPE_LIMIT_DEG``, the value
published as ``conventions.clps_slope_limit_deg``, itself without a cited source) eliminates the
point: ``total_0_100`` and ``safety_slope_0_100`` are 0 whatever the other terms.

Communications saturation: with relay enabled the comms term is
``0.65 * combined_dte_elfo + 0.35 * dte``. The ELFO constellation in ``comms.py`` is a
hypothetical 3-satellite scenario; in the committed dataset it brings the combined duty cycle to
100 % at all 10 sites, so every site, including the Shackleton PSR floor with 0 % DTE, receives at
least 65 comms points (16.25 total points). The term then mostly reflects the assumed relay, not
the site. Compare with ``use_relay=False``.

Single source of the parameters (SPA-12): ``contracts/landing-score-model.v1.json``, packaged as
``lunar_science/schemas/landing-score-model.v1.json`` (byte-identical copy, checked in tests). The
frontend (``frontend/src/navigator/math.ts``) reads the same file, implements the same formulas in
the same operation order and rounds the same way; ``contracts/examples/landing-score-parity-cases.json``
pins both implementations to identical outputs.
"""

from __future__ import annotations

import importlib.resources
import json
from dataclasses import dataclass
from typing import Any

_MODEL_KEYS = {
    "weights": {"safety", "power", "comms", "science_psr"},
    "slope": {"full_score_max_deg", "zero_score_deg", "default_elimination_limit_deg"},
    "power": {"illumination_weight", "shadow_weight", "shadow_scale_hours"},
    "comms": {"relay_combined_weight", "dte_weight"},
    "science_psr": {
        "inside_psr_points",
        "unknown_distance_points",
        "near_max_m",
        "near_points",
        "ramp_end_m",
        "ramp_end_points",
        "zero_m",
    },
    "rounding": {"decimals", "ties"},
}


def load_score_model() -> dict[str, Any]:
    """The packaged ``landing-score-model.v1.json``; raises if its structure is not the expected one."""
    text = (
        importlib.resources.files("lunar_science")
        .joinpath("schemas/landing-score-model.v1.json")
        .read_text(encoding="utf-8")
    )
    model = json.loads(text)
    for block, keys in _MODEL_KEYS.items():
        if set(model.get(block, {})) != keys:
            raise ValueError(f"landing-score-model.v1.json: block {block!r} must have exactly {sorted(keys)}")
    # Python's round() is round-half-even on the exact binary value: the model must say so.
    if model["rounding"]["ties"] != "half_even" or model.get("illustrative") is not True:
        raise ValueError("landing-score-model.v1.json: unsupported rounding or missing 'illustrative: true'")
    return model


SCORE_MODEL = load_score_model()
_SLOPE = SCORE_MODEL["slope"]
_POWER = SCORE_MODEL["power"]
_COMMS = SCORE_MODEL["comms"]
_PSR = SCORE_MODEL["science_psr"]
_DECIMALS = int(SCORE_MODEL["rounding"]["decimals"])

#: Illustrative, unsourced weights (see module docstring).
DEFAULT_SCORE_WEIGHTS = dict(SCORE_MODEL["weights"])

#: Slope above which a point is eliminated. Unsourced placeholder; replace with the certified
#: slope tolerance of the lander being studied.
DEFAULT_SLOPE_LIMIT_DEG = float(_SLOPE["default_elimination_limit_deg"])


@dataclass(frozen=True)
class LandingScoreWeights:
    """Illustrative, unsourced weights (see module docstring)."""

    safety: float = DEFAULT_SCORE_WEIGHTS["safety"]
    power: float = DEFAULT_SCORE_WEIGHTS["power"]
    comms: float = DEFAULT_SCORE_WEIGHTS["comms"]
    science_psr: float = DEFAULT_SCORE_WEIGHTS["science_psr"]


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def is_slope_eliminated(slope_deg: float, slope_limit_deg: float | None = DEFAULT_SLOPE_LIMIT_DEG) -> bool:
    """True when the slope exceeds the hard limit (``None`` disables the constraint)."""
    return slope_limit_deg is not None and slope_deg > slope_limit_deg


def score_slope_safety(slope_deg: float) -> float:
    """Illustrative slope ramp: 100 at <=2 deg, linear decay to 0 at >=15 deg (unsourced)."""
    full, zero = _SLOPE["full_score_max_deg"], _SLOPE["zero_score_deg"]
    return _clamp(100.0 * (zero - slope_deg) / (zero - full))


def score_solar_power(mean_illum_fraction: float, max_continuous_shadow_hours: float) -> float:
    """Illustrative power term: 70% mean illumination + 30% shadow resilience (360 h scale).

    Both inputs depend on the analysis window; the committed dataset covers only ~30 days of
    southern summer, so this term is a best-season value, not an annual one.
    """
    illum_score = _clamp(mean_illum_fraction * 100.0)
    shadow_resilience = _clamp(100.0 * (1.0 - max_continuous_shadow_hours / _POWER["shadow_scale_hours"]))
    return _clamp(_POWER["illumination_weight"] * illum_score + _POWER["shadow_weight"] * shadow_resilience)


def score_comms_availability(
    dte_full_disk_duty_cycle_pct: float,
    combined_dte_elfo_duty_cycle_pct: float,
    use_relay: bool = True,
) -> float:
    """Illustrative comms term: 65% DTE+relay + 35% DTE, or DTE only when ``use_relay=False``.

    With the hypothetical ELFO constellation the combined duty cycle saturates at 100 % (see
    module docstring), so the relay branch floors this term at 65 for any site.
    """
    if not use_relay:
        return _clamp(dte_full_disk_duty_cycle_pct)
    return _clamp(
        _COMMS["relay_combined_weight"] * combined_dte_elfo_duty_cycle_pct
        + _COMMS["dte_weight"] * dte_full_disk_duty_cycle_pct
    )


def score_psr_proximity(psr_distance_m: float | None, is_psr: bool) -> float:
    """Illustrative science term: best on sunlit terrain within an assumed rover reach of a PSR.

    ``psr_distance_m=None`` means no PSR point was found within the search radius: the distance is
    unknown (only bounded below), so no proximity credit is given (0). The search radius is not
    used as if it were a measured distance.
    """
    if is_psr:
        return float(_PSR["inside_psr_points"])
    if psr_distance_m is None:
        return float(_PSR["unknown_distance_points"])
    near, near_pts = _PSR["near_max_m"], _PSR["near_points"]
    end, end_pts, zero = _PSR["ramp_end_m"], _PSR["ramp_end_points"], _PSR["zero_m"]
    if psr_distance_m <= near:
        return float(near_pts)
    if psr_distance_m <= end:
        return _clamp(near_pts - (near_pts - end_pts) * (psr_distance_m - near) / (end - near))
    return _clamp(end_pts * (1.0 - (psr_distance_m - end) / (zero - end)))


def compute_composite_landing_score(
    slope_deg: float,
    mean_illum_fraction: float,
    max_continuous_shadow_hours: float,
    dte_full_disk_duty_cycle_pct: float,
    combined_dte_elfo_duty_cycle_pct: float,
    psr_distance_m: float | None,
    is_psr: bool,
    weights: LandingScoreWeights | None = None,
    use_relay: bool = True,
    slope_limit_deg: float | None = DEFAULT_SLOPE_LIMIT_DEG,
) -> dict[str, float]:
    """Compute the illustrative 0-100 Landing Score and its components.

    Returns exactly the keys of the ``score`` object in ``navigator-dataset.v1``. A slope above
    ``slope_limit_deg`` sets ``total_0_100`` and ``safety_slope_0_100`` to 0 (eliminated); the
    other components are still reported for transparency.
    """
    w = weights or LandingScoreWeights()
    w_sum = max(w.safety + w.power + w.comms + w.science_psr, 1e-9)

    eliminated = is_slope_eliminated(slope_deg, slope_limit_deg)
    s_safety = 0.0 if eliminated else score_slope_safety(slope_deg)
    s_power = score_solar_power(mean_illum_fraction, max_continuous_shadow_hours)
    s_comms = score_comms_availability(
        dte_full_disk_duty_cycle_pct, combined_dte_elfo_duty_cycle_pct, use_relay=use_relay
    )
    s_psr = score_psr_proximity(psr_distance_m, is_psr)

    if eliminated:
        total = 0.0
    else:
        total = (w.safety * s_safety + w.power * s_power + w.comms * s_comms + w.science_psr * s_psr) / w_sum
    return {
        "total_0_100": round(_clamp(total), _DECIMALS),
        "safety_slope_0_100": round(s_safety, _DECIMALS),
        "power_0_100": round(s_power, _DECIMALS),
        "comms_0_100": round(s_comms, _DECIMALS),
        "science_psr_0_100": round(s_psr, _DECIMALS),
    }
