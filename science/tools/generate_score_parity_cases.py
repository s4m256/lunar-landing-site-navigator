#!/usr/bin/env python3
"""Write ``contracts/examples/landing-score-parity-cases.json`` from the Python score.

Each case gives the inputs of ``compute_composite_landing_score`` and the outputs computed here,
so ``frontend/src/navigator/math.ts`` can be checked against the same table (TS <-> Python parity).
Most inputs are SYNTHETIC values chosen to hit branches (slope limit, PSR ramp breakpoints, unknown
distance, relay on/off, custom and zero weights, a rounding tie); two cases copy the published
center summaries of committed sites. Run from the repository root::

    .venv/bin/python science/tools/generate_score_parity_cases.py
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from lunar_science.navigator.scoring import (
    DEFAULT_SCORE_WEIGHTS,
    DEFAULT_SLOPE_LIMIT_DEG,
    SCORE_MODEL,
    LandingScoreWeights,
    compute_composite_landing_score,
    is_slope_eliminated,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
CASES_PATH = REPO_ROOT / "contracts" / "examples" / "landing-score-parity-cases.json"
DATASET_PATH = REPO_ROOT / "outputs" / "datasets" / "south_pole_precomputed.v1.json"
COMMITTED_SITES = ("shackleton_ridge", "de_gerlache_rim_2")

BASE = {
    "slope_deg": 1.0,
    "mean_illum_fraction": 0.9,
    "max_continuous_shadow_hours": 10.0,
    "dte_full_disk_duty_cycle_pct": 80.0,
    "combined_dte_elfo_duty_cycle_pct": 100.0,
    "psr_distance_m": 800.0,
    "is_psr": False,
    "use_relay": True,
    "slope_limit_deg": DEFAULT_SLOPE_LIMIT_DEG,
    "weights": dict(DEFAULT_SCORE_WEIGHTS),
}

SYNTHETIC_CASES: list[tuple[str, dict[str, Any]]] = [
    ("flat_lit_near_psr", {}),
    ("slope_at_limit_is_not_eliminated", {"slope_deg": 12.0}),
    ("slope_just_above_limit_is_eliminated", {"slope_deg": 12.01}),
    ("slope_above_default_but_below_custom_limit", {"slope_deg": 13.0, "slope_limit_deg": 14.0}),
    ("slope_limit_disabled", {"slope_deg": 30.0, "slope_limit_deg": None}),
    ("slope_ramp_middle", {"slope_deg": 8.5}),
    ("unknown_psr_distance_gets_no_credit", {"psr_distance_m": None}),
    ("inside_psr_dark", {"psr_distance_m": 0.0, "is_psr": True, "mean_illum_fraction": 0.0, "max_continuous_shadow_hours": 721.0, "dte_full_disk_duty_cycle_pct": 0.0}),
    ("psr_distance_500", {"psr_distance_m": 500.0}),
    ("psr_distance_2750", {"psr_distance_m": 2750.0}),
    ("psr_distance_5000", {"psr_distance_m": 5000.0}),
    ("psr_distance_5200_former_sentinel_value", {"psr_distance_m": 5200.0}),
    ("psr_distance_7500", {"psr_distance_m": 7500.0}),
    ("psr_distance_beyond_zero", {"psr_distance_m": 20000.0}),
    ("relay_off_uses_dte_only", {"use_relay": False}),
    ("shadow_beyond_scale_is_clamped", {"max_continuous_shadow_hours": 500.0}),
    ("custom_weights", {"weights": {"safety": 0.5, "power": 0.2, "comms": 0.2, "science_psr": 0.1}}),
    ("zero_weights", {"weights": {"safety": 0.0, "power": 0.0, "comms": 0.0, "science_psr": 0.0}}),
    ("rounding_tie_goes_to_even", {"use_relay": False, "dte_full_disk_duty_cycle_pct": 12.125}),
]


def _expected(inputs: dict[str, Any]) -> dict[str, Any]:
    score = compute_composite_landing_score(
        slope_deg=inputs["slope_deg"],
        mean_illum_fraction=inputs["mean_illum_fraction"],
        max_continuous_shadow_hours=inputs["max_continuous_shadow_hours"],
        dte_full_disk_duty_cycle_pct=inputs["dte_full_disk_duty_cycle_pct"],
        combined_dte_elfo_duty_cycle_pct=inputs["combined_dte_elfo_duty_cycle_pct"],
        psr_distance_m=inputs["psr_distance_m"],
        is_psr=inputs["is_psr"],
        weights=LandingScoreWeights(**inputs["weights"]),
        use_relay=inputs["use_relay"],
        slope_limit_deg=inputs["slope_limit_deg"],
    )
    return {**score, "eliminated": is_slope_eliminated(inputs["slope_deg"], inputs["slope_limit_deg"])}


def _committed_cases() -> list[tuple[str, dict[str, Any]]]:
    dataset = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    by_id = {s["id"]: s for s in dataset["sites"]}
    cases = []
    for site_id in COMMITTED_SITES:
        site = by_id[site_id]
        c, summary = site["center"], site["engineering_summary"]
        cases.append(
            (
                f"committed_center_{site_id}",
                {
                    "slope_deg": c["slope_deg"],
                    "mean_illum_fraction": summary["solar"]["mean_illum_fraction"],
                    "max_continuous_shadow_hours": summary["solar"]["max_continuous_shadow_hours"],
                    "dte_full_disk_duty_cycle_pct": summary["comms"]["dte_full_disk_duty_cycle_pct"],
                    "combined_dte_elfo_duty_cycle_pct": summary["comms"]["combined_dte_elfo_duty_cycle_pct"],
                    "psr_distance_m": c["psr_distance_m"],
                    "is_psr": c["is_psr"],
                    "slope_limit_deg": dataset["provenance"]["conventions"]["clps_slope_limit_deg"],
                },
            )
        )
    return cases


def build_cases() -> dict[str, Any]:
    cases = []
    for case_id, overrides in SYNTHETIC_CASES + _committed_cases():
        inputs = {**BASE, **overrides}
        cases.append({"id": case_id, "input": inputs, "expected": _expected(inputs)})
    return {
        "description": (
            "TS <-> Python parity table for the ILLUSTRATIVE landing index. Inputs are SYNTHETIC except the "
            "committed_center_* cases (published center summaries); expected values come from "
            "lunar_science.navigator.scoring. Regenerate with science/tools/generate_score_parity_cases.py."
        ),
        "model_version": SCORE_MODEL["model_version"],
        "cases": cases,
    }


def main() -> int:
    CASES_PATH.write_text(json.dumps(build_cases(), indent=2) + "\n", encoding="utf-8")
    print(f"wrote {CASES_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
