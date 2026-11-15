"""Structural 1.0.0 -> 1.1.0 migration of the committed dataset (science/tools, SPA-12).

These tests check that the migration only relabels and adds metadata: the committed 1.1.0 file
reverts to the exact bytes of the 1.0.0 file (SHA-256 recorded in ``provenance.migration``), no
number differs, and the one value turned into ``null`` (the 5200 m "no PSR found" fallback) cannot
be a real distance. They say nothing about the scientific correctness of the numbers.
"""

from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import math
from pathlib import Path
from typing import Any, Iterator

import numpy as np
import pytest

from lunar_science.navigator.pipeline import serialize_frontend_dataset, serialize_outputs_dataset

REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = REPO_ROOT / "science" / "tools" / "migrate_dataset_1_0_to_1_1.py"
DATASET_PATH = REPO_ROOT / "outputs" / "datasets" / "south_pole_precomputed.v1.json"


def _load_tool() -> Any:
    spec = importlib.util.spec_from_file_location("migrate_dataset_1_0_to_1_1", TOOL_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


tool = _load_tool()


@pytest.fixture(scope="module")
def committed() -> dict:
    return json.loads(DATASET_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def source(committed: dict) -> dict:
    return tool.revert(committed)


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def test_committed_dataset_reverts_to_the_recorded_1_0_bytes(committed: dict, source: dict) -> None:
    record = committed["provenance"]["migration"]
    assert source["schema_version"] == "1.0.0" and "migration" not in source["provenance"]
    assert _sha(serialize_outputs_dataset(source)) == record["source_sha256"]
    assert _sha(serialize_frontend_dataset(source)) == record["source_frontend_sha256"]


def test_committed_copies_are_reproducible_by_the_tool() -> None:
    assert tool.main(["--repo-root", str(REPO_ROOT), "--check"]) == 0


def test_migration_is_deterministic_and_refuses_to_run_twice(committed: dict, source: dict) -> None:
    record = committed["provenance"]["migration"]
    again = tool.migrate(source, record["source_sha256"], record["source_frontend_sha256"])
    assert serialize_outputs_dataset(again) == serialize_outputs_dataset(committed)
    with pytest.raises(tool.MigrationError):
        tool.migrate(committed, record["source_sha256"], record["source_frontend_sha256"])


def _leaves(node: Any, path: str = "") -> Iterator[tuple[str, Any]]:
    if isinstance(node, dict):
        for key, value in node.items():
            yield from _leaves(value, f"{path}/{key}")
    elif isinstance(node, list):
        for i, value in enumerate(node):
            yield from _leaves(value, f"{path}/{i}")
    else:
        yield path, node


def test_no_number_changes_and_only_the_fallback_becomes_null(committed: dict, source: dict) -> None:
    changed = []
    for path, value in _leaves(source):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            continue
        new = tool._get(committed, path)
        if new != value or type(new) is not type(value):
            changed.append((path, value, new))
    assert changed, "expected the PSR fallback values to change"
    assert all(path.endswith("/psr_distance_m") and old == 5200.0 and new is None for path, old, new in changed)
    assert len(changed) == committed["provenance"]["migration"]["psr_sentinel_nulled"]["count"] == 26


def test_fallback_value_cannot_be_a_real_distance_of_the_1_0_search() -> None:
    """The 1.0.0 lattice (np.arange(-5200, 5200 + 1e-6, 500) in x and y, within 5200 m) never puts a
    PSR point 5200.0 m (rounded to 0.1 m) from the site center or from a 5x5 node at 500 m spacing."""
    offsets = np.arange(-5200.0, 5200.0 + 1e-6, 500.0)
    lattice = [(dx, dy) for dy in offsets for dx in offsets if dx * dx + dy * dy <= 5200.0**2]
    nodes = [((c - 2) * 500.0, (2 - r) * 500.0) for r in range(5) for c in range(5)]  # includes the center
    distances = np.array([math.hypot(lx - nx, ly - ny) for nx, ny in nodes for lx, ly in lattice])
    assert not np.any(np.round(distances, 1) == tool.LEGACY_PSR_SENTINEL_M)
    assert float(np.min(np.abs(distances - tool.LEGACY_PSR_SENTINEL_M))) > 1.0


def test_horizons_label_and_text_labels(committed: dict, source: dict) -> None:
    hv = committed["provenance"]["horizons_validation"]
    assert source["provenance"]["horizons_validation"]["status"] == "verified"
    assert hv["status"] == "unverified_no_raw_response"
    assert hv["tolerance_deg"] is None and hv["raw_responses"] == [] and "sample_count" not in hv
    assert hv["notes"][0] == tool.UNVERIFIED_NOTE
    assert hv["notes"][1:] == [tool.DECLARED_NOTE_PREFIX + n for n in source["provenance"]["horizons_validation"]["notes"]]
    assert "Skyfield" in source["provenance"]["ephemeris"]["engine"]
    assert "Skyfield" not in committed["provenance"]["ephemeris"]["engine"]
    # Values that need recomputation are absent, not guessed.
    assert committed["mission_window"]["seasonal_coverage"]["subsolar_lat_min_deg"] is None
    for site in committed["sites"]:
        assert "total_without_relay_0_100" not in site["engineering_summary"]["score"]
    assert {"psr_subsolar_lat_extreme_deg", "psr_solar_radius_deg"}.isdisjoint(committed["provenance"]["conventions"])


@pytest.mark.parametrize(
    ("tamper", "message"),
    [
        (lambda d: d["sites"][0]["local_grid"]["nodes"].__getitem__(3).__setitem__("psr_distance_m", 5200.0), "non-PSR points"),
        (lambda d: d["sites"][1]["center"].__setitem__("slope_deg", 12.0), "does not decide"),
        (lambda d: d["sites"][1]["center"].__setitem__("slope_deg", 12.5), "above the slope limit"),
        (lambda d: d["relay_presets"]["lro"].__setitem__("a_km", 1800.0), "numeric elements differ"),
        (lambda d: d["provenance"]["horizons_validation"].__setitem__("status", "ok"), "Unknown 1.0.0 Horizons status"),
        (lambda d: d["sites"][2]["center"].__setitem__("latitude_deg", -84.0), "coordinates differ"),
    ],
)
def test_migration_refuses_inputs_it_cannot_migrate_structurally(source: dict, tamper, message: str) -> None:
    bad = copy.deepcopy(source)
    tamper(bad)
    with pytest.raises(tool.MigrationError, match=message):
        tool.migrate(bad, "0" * 64, "0" * 64)
