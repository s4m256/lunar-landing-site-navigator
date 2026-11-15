"""Illustrative Landing Score: slope elimination, PSR sentinel handling, relay saturation."""

from __future__ import annotations

import pytest

from lunar_science.navigator.scoring import (
    DEFAULT_SLOPE_LIMIT_DEG,
    compute_composite_landing_score,
    is_slope_eliminated,
    score_psr_proximity,
)

CONTRACT_KEYS = {"total_0_100", "safety_slope_0_100", "power_0_100", "comms_0_100", "science_psr_0_100"}


def test_slope_above_limit_is_eliminatory() -> None:
    common = dict(
        mean_illum_fraction=0.9,
        max_continuous_shadow_hours=10.0,
        dte_full_disk_duty_cycle_pct=80.0,
        combined_dte_elfo_duty_cycle_pct=100.0,
        psr_distance_m=800.0,
        is_psr=False,
    )
    at_limit = compute_composite_landing_score(slope_deg=DEFAULT_SLOPE_LIMIT_DEG, **common)
    above = compute_composite_landing_score(slope_deg=DEFAULT_SLOPE_LIMIT_DEG + 0.01, **common)
    assert at_limit["total_0_100"] > 0.0
    assert above["total_0_100"] == 0.0 and above["safety_slope_0_100"] == 0.0
    assert above["power_0_100"] == at_limit["power_0_100"]  # other components still reported
    assert compute_composite_landing_score(slope_deg=13.0, slope_limit_deg=14.0, **common)["total_0_100"] > 0.0
    assert not is_slope_eliminated(30.0, None)
    assert set(above) == CONTRACT_KEYS  # still exactly the contract's score object


def test_missing_psr_distance_gets_no_proximity_credit() -> None:
    assert score_psr_proximity(None, False) == 0.0
    assert score_psr_proximity(None, True) == 15.0
    assert score_psr_proximity(5200.0, False) == pytest.approx(19.2)  # what the old sentinel earned
    with_none = compute_composite_landing_score(2.0, 0.5, 100.0, 40.0, 100.0, None, False)
    assert with_none["science_psr_0_100"] == 0.0


def test_relay_saturation_floors_comms_term() -> None:
    psr_floor = dict(slope_deg=4.0, mean_illum_fraction=0.0, max_continuous_shadow_hours=721.0, psr_distance_m=0.0, is_psr=True)
    with_relay = compute_composite_landing_score(dte_full_disk_duty_cycle_pct=0.0, combined_dte_elfo_duty_cycle_pct=100.0, **psr_floor)
    dte_only = compute_composite_landing_score(
        dte_full_disk_duty_cycle_pct=0.0, combined_dte_elfo_duty_cycle_pct=100.0, use_relay=False, **psr_floor
    )
    assert with_relay["comms_0_100"] == pytest.approx(65.0)
    assert dte_only["comms_0_100"] == 0.0


def test_parity_table_shared_with_the_frontend_is_the_current_python_output() -> None:
    """contracts/examples/landing-score-parity-cases.json: frontend math.ts must reproduce it exactly
    (frontend/src/navigator/scoreParity.test.ts); this side checks it still matches scoring.py."""
    import importlib.util
    import json
    from pathlib import Path

    repo = Path(__file__).resolve().parents[2]
    spec = importlib.util.spec_from_file_location(
        "generate_score_parity_cases", repo / "science" / "tools" / "generate_score_parity_cases.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    committed = json.loads((repo / "contracts" / "examples" / "landing-score-parity-cases.json").read_text(encoding="utf-8"))
    assert committed == module.build_cases()
    ids = {c["id"] for c in committed["cases"]}
    assert {"slope_just_above_limit_is_eliminated", "unknown_psr_distance_gets_no_credit", "rounding_tie_goes_to_even"} <= ids
