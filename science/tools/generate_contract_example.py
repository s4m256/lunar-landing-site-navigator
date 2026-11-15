#!/usr/bin/env python3
"""Write ``contracts/examples/navigator-dataset.synthetic.json``: a SYNTHETIC native 1.1.0 file.

The real producer (``run_navigator_pipeline``) runs on the test doubles of
``science/tests/navigator_stubs.py`` (analytic non-physical ephemeris, synthetic Horizons replies)
and on a synthetic DEM: a flat plain with a 2 km deep pit near site ``syn_a`` (so PSR distances
exist) and a 0.3 m/m ramp under site ``syn_b`` (slope above the 12 deg limit, so the elimination
branch is exercised). Nothing in the file is lunar data.

``generated_utc`` and the synthetic ``retrieved_utc`` values (also quoted in one Horizons note) are
fixed to ``FIXED_UTC`` so the file only changes when the producer output changes. Run from the repository root::

    .venv/bin/python science/tools/generate_contract_example.py
"""

from __future__ import annotations

import functools
import json
import re
import sys
import tempfile
from pathlib import Path
from typing import Any

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "science" / "tests"))

from navigator_stubs import SyntheticEphemeris, SyntheticHorizons  # noqa: E402

from lunar_science.navigator.data_sources import CandidateSiteSpec  # noqa: E402
from lunar_science.navigator.dem_horizon import LolaSouthPoleDem  # noqa: E402
from lunar_science.navigator.ephemeris import validate_ephemeris_against_horizons  # noqa: E402
from lunar_science.navigator.pipeline import run_navigator_pipeline, validate_dataset_schema  # noqa: E402

EXAMPLE_PATH = REPO_ROOT / "contracts" / "examples" / "navigator-dataset.synthetic.json"
FIXED_UTC = "2026-11-15T00:00:00Z"
SCALE_M = 200.0
SITES = (
    CandidateSiteSpec("syn_a", "Synthetic A (pit nearby)", "reference_ridge", -89.8, 0.0, "SYNTHETIC test point, not a lunar site."),
    CandidateSiteSpec("syn_b", "Synthetic B (steep ramp)", "artemis_candidate", -89.8, 180.0, "SYNTHETIC test point, not a lunar site."),
)


def synthetic_dem() -> LolaSouthPoleDem:
    n = 121
    z = np.zeros((n, n))
    base = LolaSouthPoleDem.from_synthetic_array(z, map_scale_m=SCALE_M)
    rows, cols = np.mgrid[0:n, 0:n]
    x = (cols - base.meta.sample_projection_offset) * SCALE_M
    y = -(rows - base.meta.line_projection_offset) * SCALE_M
    ax, ay = base.latlon_to_xy_m(SITES[0].latitude_deg, SITES[0].longitude_east_deg)
    bx, by = base.latlon_to_xy_m(SITES[1].latitude_deg, SITES[1].longitude_east_deg)
    z[np.hypot(x - (float(ax) + 1000.0), y - float(ay)) <= 600.0] = -2000.0
    ramp = np.hypot(x - float(bx), y - float(by)) <= 1500.0
    z[ramp] = 0.3 * (x[ramp] - float(bx))
    return LolaSouthPoleDem.from_synthetic_array(z, map_scale_m=SCALE_M)


def build_example() -> dict[str, Any]:
    validator = functools.partial(
        validate_ephemeris_against_horizons, fetch=SyntheticHorizons(), engine=SyntheticEphemeris().engine
    )
    with tempfile.TemporaryDirectory() as tmp:
        dataset, _report = run_navigator_pipeline(
            cache_dir=Path(tmp),
            sites=SITES,
            start_utc="2026-11-15T00:00:00Z",
            end_utc="2026-11-16T00:00:00Z",
            step_seconds=3600,
            az_step_deg=10.0,
            grid_size=3,
            dem_override=synthetic_dem(),
            ephemeris_factory=SyntheticEphemeris,
            horizons_validator=validator,
            horizons_step_size="6 h",
            psr_lattice_step_m=1000.0,
        )
    dataset["generated_utc"] = FIXED_UTC
    hv = dataset["provenance"]["horizons_validation"]
    for raw in hv["raw_responses"]:
        raw["retrieved_utc"] = FIXED_UTC
    # The retrieval times are also quoted in one note; fix them there too (and only there).
    hv["notes"] = [
        re.sub(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", FIXED_UTC, n) if n.startswith("Raw Horizons responses") else n
        for n in hv["notes"]
    ]
    validate_dataset_schema(dataset)
    return dataset


def main() -> int:
    dataset = build_example()
    EXAMPLE_PATH.write_text(json.dumps(dataset, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {EXAMPLE_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
