#!/usr/bin/env python3
"""Structural, reversible migration of ``navigator-dataset`` 1.0.0 -> 1.1.0 (SPA-12).

Run from the repository root with the science package installed::

    .venv/bin/python science/tools/migrate_dataset_1_0_to_1_1.py           # migrate and write
    .venv/bin/python science/tools/migrate_dataset_1_0_to_1_1.py --check   # verify, write nothing

Input: ``outputs/datasets/south_pole_precomputed.v1.json`` at 1.0.0, or an already migrated 1.1.0
file, whose 1.0.0 source is rebuilt with :func:`revert` and checked against the SHA-256 recorded
in ``provenance.migration``. Output: the same file at 1.1.0, the minified frontend copy and its
SHA-256 (``frontend/src/data``), written by the producer's own serializers.

What the migration does, and only this. No number is recomputed or estimated.

1. ``schema_version`` 1.0.0 -> 1.1.0.
2. ``psr_distance_m == 5200.0`` -> ``null``. The 1.0.0 producer (``main`` at 23cc0c7,
   ``pipeline._distance_to_psr_patch_m``) returned 5200 m when its search lattice held no PSR
   point. The value is unambiguous: lattice offsets are -5200 + 500 k m from the site center and
   grid nodes sit at multiples of 500 m, so no real distance rounds to 5200.0 (the closest one is
   3.8 m away; ``tests/test_migration_1_0_to_1_1.py`` checks this by enumeration). The tool also
   requires, per site, that either every non-PSR point or none carries the value.
3. Horizons ``status`` ``verified`` -> ``unverified_no_raw_response``. The 1.0.0 producer wrote
   ``verified`` without a tolerance and without keeping the raw responses (SPA-9 audit, section 3).
   ``tolerance_deg`` becomes ``null`` and ``raw_responses`` ``[]``. The original notes are kept,
   prefixed as an unreproduced declaration.
4. Labels replaced by the current producer's labels, with the same numbers underneath: the
   ephemeris ``engine`` (drops "cross-checked with Skyfield", a check that never ran), the relay
   preset ``name`` (numeric elements must match the current presets exactly), and the site
   ``description`` (coordinates must match the current site list).
5. Metadata added because it is known exactly: ``relaySpec.hypothetical`` and ``source``,
   ``sites[].coordinates_source``, ``conventions.slope_baseline_m`` (2 pixels of
   ``dem_product.resolution_m``, as in the 1.0.0 ``compute_slope_deg``),
   ``psr_search_radius_m`` / ``psr_lattice_step_m`` (1.0.0 search defaults),
   ``score_is_illustrative``, ``mission_window.seasonal_coverage`` (duration and the seasonal-cycle
   flag from the window; sub-solar latitude range ``null``, never recorded by the 1.0.0 producer),
   ``score.eliminated`` / ``elimination_reasons`` at site centers (only when the rounded slope
   decides the comparison with ``clps_slope_limit_deg`` unambiguously, and only when no center is
   eliminated, since the stored totals were computed without elimination), and limitation texts.
6. Not added, because they would need recomputation: ``score.total_without_relay_0_100``
   (rounded published inputs cannot fix its second decimal), ``psr_subsolar_lat_extreme_deg`` and
   ``psr_solar_radius_deg`` (1.0.0 used two different PSR criteria), ``horizons_validation.sample_count``.
7. Stored score values are untouched; ``provenance.migration.stored_scores_rule = "1.0.0"`` says so.

Every replaced value and every added key is recorded in ``provenance.migration``, so
:func:`revert` rebuilds the 1.0.0 document and its exact bytes (SHA-256 recorded).
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from lunar_science.navigator.comms import RELAY_PRESET_LIMITATIONS, RELAY_PRESETS
from lunar_science.navigator.data_sources import DEFAULT_SOUTH_POLE_SITES
from lunar_science.navigator.pipeline import (
    DATASET_SCHEMA_VERSION,
    EPHEMERIS_ENGINE_LABEL,
    SEASONAL_CYCLE_DAYS,
    serialize_frontend_dataset,
    serialize_outputs_dataset,
    sha256_checksum_line,
    validate_dataset_schema,
    write_dataset_copies,
)

TOOL_PATH = "science/tools/migrate_dataset_1_0_to_1_1.py"
TOOL_VERSION = "1.0.0"
SOURCE_SCHEMA_VERSION = "1.0.0"
assert DATASET_SCHEMA_VERSION == "1.1.0", "this tool targets contract 1.1.0 only"

#: Facts about the 1.0.0 producer (main at 23cc0c7), read from its code.
LEGACY_PSR_SENTINEL_M = 5200.0
LEGACY_PSR_SEARCH_RADIUS_M = 5200.0
LEGACY_PSR_LATTICE_STEP_M = 500.0
LEGACY_SLOPE_BASELINE_PIXELS = 2
LEGACY_PUBLISHED_SLOPE_HALF_UNIT_DEG = 0.005  # slope_deg was rounded to 2 decimals

UNVERIFIED_STATUS = "unverified_no_raw_response"
UNVERIFIED_NOTE = (
    "Not reproduced: the 1.0.0 producer labeled this comparison 'verified' without a declared tolerance and "
    "without retaining the raw Horizons responses, request parameters or retrieval time (SPA-9 audit, "
    f"section 3). Status set to '{UNVERIFIED_STATUS}' by the 1.0.0 -> 1.1.0 structural migration."
)
DECLARED_NOTE_PREFIX = "Declared by the 1.0.0 producer, not reproduced: "

LEGACY_PSR_LIMITATION = (
    "The 1.0.0 producer used two different PSR criteria (SPA-9 audit, section 6.2): is_psr required the horizon "
    "to exceed a fixed -1.543 deg sub-solar envelope plus 0.27 deg (1 deg / 80 m sampling, 2 m observer), "
    "while psr_distance_m searched points whose horizon reached the envelope without solar radius (5 deg / "
    "320 m sampling, 0.5 m observer) on an asymmetric 500 m lattice (-5200 to +4800 m) within 5200 m of the "
    "site center. psr_distance_m is null where that search found no PSR point (the file used to store its "
    "5200 m fallback as if it were a distance)."
)
SCORE_LIMITATION = (
    "Score fields are an ILLUSTRATIVE landing index: weights, blends and thresholds have no cited source and no "
    "sensitivity analysis; they are not a validated scientific ranking. The stored score values follow the "
    "1.0.0 rule (no slope elimination; the 5200 m fallback was scored as a distance); recompute them with "
    "contracts/landing-score-model.v1.json."
)
SCHEMA_LIMITATION = (
    "'Validated' for this dataset means conformance with navigator-dataset.v1.schema.json. The only external "
    "comparison is provenance.horizons_validation (Sun/Earth directions at one site), and it was not reproduced."
)
MIGRATION_LIMITATION = (
    "This file is a structural migration of a 1.0.0 dataset (provenance.migration): labels and metadata changed, "
    "no number was recomputed."
)


class MigrationError(ValueError):
    """The input cannot be migrated without recomputing or guessing values."""


# ---------------------------------------------------------------------------
# JSON pointer helpers (RFC 6901; the dataset keys contain neither "~" nor "/")
# ---------------------------------------------------------------------------


def _pointer(*parts: str | int) -> str:
    return "/" + "/".join(str(p) for p in parts)


def _resolve_parent(doc: Any, pointer: str) -> tuple[Any, str | int]:
    parts = pointer.lstrip("/").split("/")
    node = doc
    for part in parts[:-1]:
        node = node[int(part)] if isinstance(node, list) else node[part]
    last = parts[-1]
    return node, (int(last) if isinstance(node, list) else last)


def _get(doc: Any, pointer: str) -> Any:
    parent, key = _resolve_parent(doc, pointer)
    return parent[key]


def _set(doc: Any, pointer: str, value: Any) -> None:
    parent, key = _resolve_parent(doc, pointer)
    parent[key] = value


def _delete(doc: Any, pointer: str) -> None:
    parent, key = _resolve_parent(doc, pointer)
    del parent[key]


def _insert_after(obj: dict[str, Any], after: str, key: str, value: Any) -> None:
    """Insert ``key`` right after ``after`` (same layout as the producer), keeping other keys in order."""
    if key in obj:
        raise MigrationError(f"Key {key!r} already present")
    items = list(obj.items())
    obj.clear()
    for k, v in items:
        obj[k] = v
        if k == after:
            obj[key] = value
    if key not in obj:
        obj[key] = value


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _psr_points(site: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    points = [("center", site["center"])]
    points += [(f"local_grid/nodes/{i}", n) for i, n in enumerate(site["local_grid"]["nodes"])]
    return points


# ---------------------------------------------------------------------------
# Migration
# ---------------------------------------------------------------------------


class _Recorder:
    def __init__(self, doc: dict[str, Any]) -> None:
        self.doc = doc
        self.added: list[str] = []
        self.replaced: list[dict[str, Any]] = []

    def replace(self, pointer: str, value: Any) -> None:
        old = _get(self.doc, pointer)
        if old == value:
            return
        self.replaced.append({"path": pointer, "from": copy.deepcopy(old), "to": copy.deepcopy(value)})
        _set(self.doc, pointer, copy.deepcopy(value))

    def add(self, pointer: str, value: Any, after: str | None = None) -> None:
        parent, key = _resolve_parent(self.doc, pointer)
        if not isinstance(parent, dict) or key in parent:
            raise MigrationError(f"Cannot add {pointer}: parent missing or key already present")
        if after is None:
            parent[key] = copy.deepcopy(value)
        else:
            _insert_after(parent, after, str(key), copy.deepcopy(value))
        self.added.append(pointer)


def _window_days(mission_window: dict[str, Any]) -> float:
    def parse(text: str) -> datetime:
        return datetime.strptime(text, "%Y-%m-%dT%H:%M:%SZ")

    return (parse(mission_window["end_utc"]) - parse(mission_window["start_utc"])).total_seconds() / 86400.0


def _slope_decision(slope_deg: float, limit_deg: float) -> bool:
    """``slope > limit`` decided from a slope rounded to 2 decimals; raises when the rounding hides it."""
    half = LEGACY_PUBLISHED_SLOPE_HALF_UNIT_DEG
    if slope_deg - half > limit_deg:
        return True
    if slope_deg + half <= limit_deg:
        return False
    raise MigrationError(f"Rounded slope {slope_deg} deg does not decide 'slope > {limit_deg} deg'")


def migrate(source: dict[str, Any], source_sha256: str, source_frontend_sha256: str) -> dict[str, Any]:
    """Return the 1.1.0 document for a 1.0.0 ``source`` (which is not modified)."""
    if source.get("schema_version") != SOURCE_SCHEMA_VERSION:
        raise MigrationError(f"Expected schema_version {SOURCE_SCHEMA_VERSION!r}, got {source.get('schema_version')!r}")
    if "migration" in source.get("provenance", {}):
        raise MigrationError("Source already carries provenance.migration")
    doc = copy.deepcopy(source)
    rec = _Recorder(doc)
    prov = doc["provenance"]

    rec.replace("/schema_version", DATASET_SCHEMA_VERSION)

    # 2. PSR fallback -> null, checked per site for consistency.
    nulled = 0
    for s_idx, site in enumerate(doc["sites"]):
        non_psr = [(path, p) for path, p in _psr_points(site) if not p["is_psr"]]
        marked = [(path, p) for path, p in non_psr if p["psr_distance_m"] == LEGACY_PSR_SENTINEL_M]
        if marked and len(marked) != len(non_psr):
            raise MigrationError(
                f"Site {site['id']!r}: {len(marked)} of {len(non_psr)} non-PSR points carry {LEGACY_PSR_SENTINEL_M} m; "
                "an empty PSR search marks all of them, so this file is not a 1.0.0 producer output."
            )
        for path, point in _psr_points(site):
            if point["psr_distance_m"] is None:
                raise MigrationError(f"Site {site['id']!r} {path}: psr_distance_m is already null")
        for _, point in marked:
            point["psr_distance_m"] = None
            nulled += 1

    # 3. Horizons status.
    hv_ptr = "/provenance/horizons_validation"
    hv = prov["horizons_validation"]
    status = hv["status"]
    if status == "verified":
        rec.replace(hv_ptr + "/status", UNVERIFIED_STATUS)
        rec.replace(hv_ptr + "/notes", [UNVERIFIED_NOTE] + [DECLARED_NOTE_PREFIX + n for n in hv["notes"]])
        rec.add(hv_ptr + "/tolerance_deg", None, after="endpoint")
        rec.add(hv_ptr + "/raw_responses", [], after="tolerance_deg")
    elif status not in ("skipped_network_unavailable", "not_requested"):
        raise MigrationError(f"Unknown 1.0.0 Horizons status {status!r}")

    # 4. Labels.
    rec.replace("/provenance/ephemeris/engine", EPHEMERIS_ENGINE_LABEL)
    for key, spec in doc["relay_presets"].items():
        preset = RELAY_PRESETS.get(key)
        if preset is None:
            raise MigrationError(f"Unknown relay preset {key!r}")
        current = preset.to_contract_dict()
        elements = {k: v for k, v in spec.items() if k != "name"}
        expected = {k: current[k] for k in elements}
        if elements != expected or set(current) - set(spec) != {"hypothetical", "source"}:
            raise MigrationError(f"Relay preset {key!r}: numeric elements differ from the current preset")
        rec.replace(_pointer("relay_presets", key, "name"), current["name"])
        rec.add(_pointer("relay_presets", key, "hypothetical"), current["hypothetical"])
        rec.add(_pointer("relay_presets", key, "source"), current["source"])

    specs = {spec.site_id: spec for spec in DEFAULT_SOUTH_POLE_SITES}
    limit = float(prov["conventions"]["clps_slope_limit_deg"])
    decisions = []
    for s_idx, site in enumerate(doc["sites"]):
        spec = specs.get(site["id"])
        if spec is None:
            raise MigrationError(f"Site {site['id']!r} is not in the current site list")
        c = site["center"]
        if (round(spec.latitude_deg, 5), round(spec.longitude_east_deg % 360.0, 5)) != (
            c["latitude_deg"],
            c["longitude_east_deg"],
        ):
            raise MigrationError(f"Site {site['id']!r}: coordinates differ from the current site list")
        rec.replace(_pointer("sites", s_idx, "description"), spec.description)
        rec.add(_pointer("sites", s_idx, "coordinates_source"), spec.coordinates_source, after="description")
        decisions.append(_slope_decision(c["slope_deg"], limit))
    if any(decisions):
        raise MigrationError("A site center is above the slope limit; its stored total was not eliminated (1.0.0 rule)")
    for s_idx in range(len(doc["sites"])):
        score_ptr = _pointer("sites", s_idx, "engineering_summary", "score")
        rec.add(score_ptr + "/eliminated", False)
        rec.add(score_ptr + "/elimination_reasons", [])

    # 5. Conventions, window coverage, limitations.
    conv_ptr = "/provenance/conventions"
    rec.add(conv_ptr + "/slope_baseline_m", LEGACY_SLOPE_BASELINE_PIXELS * float(prov["dem_product"]["resolution_m"]))
    rec.add(conv_ptr + "/psr_search_radius_m", LEGACY_PSR_SEARCH_RADIUS_M)
    rec.add(conv_ptr + "/psr_lattice_step_m", LEGACY_PSR_LATTICE_STEP_M)
    rec.add(conv_ptr + "/score_is_illustrative", True)

    mw = doc["mission_window"]
    days = _window_days(mw)
    covers = days >= SEASONAL_CYCLE_DAYS
    rec.add(
        "/mission_window/seasonal_coverage",
        {
            "duration_days": days,
            "subsolar_lat_min_deg": None,
            "subsolar_lat_max_deg": None,
            "covers_seasonal_cycle": covers,
        },
    )
    window_text = (
        f"Illumination, energy, battery and the power score cover only {mw['start_utc']} -> {mw['end_utc']} "
        f"({days:.1f} days, step {mw['step_seconds']} s)"
    )
    if covers:
        window_text += f", at least one seasonal cycle (~{SEASONAL_CYCLE_DAYS} d, eclipse year)."
    else:
        window_text += (
            f", shorter than one seasonal cycle (~{SEASONAL_CYCLE_DAYS} d, eclipse year): season-specific values, "
            "not annual statistics. The SPA-9 audit places this window at the southern-summer extreme of the "
            "sub-solar latitude, the best illumination season for the south pole."
        )
    window_text += " The 1.0.0 producer did not record the sub-solar latitude range (seasonal_coverage keeps null)."
    slope_text = (
        f"slope_deg is the gradient over a {LEGACY_SLOPE_BASELINE_PIXELS * float(prov['dem_product']['resolution_m']):.0f} m "
        "map baseline (central differences of +/-1 pixel); it does not resolve lander-scale slopes. "
        f"clps_slope_limit_deg = {limit:g} deg is an unsourced placeholder."
    )
    new_limitations = list(prov["limitations"]) + [
        window_text,
        SCORE_LIMITATION,
        slope_text,
        LEGACY_PSR_LIMITATION,
        *RELAY_PRESET_LIMITATIONS,
        SCHEMA_LIMITATION,
        MIGRATION_LIMITATION,
    ]
    rec.replace("/provenance/limitations", new_limitations)

    prov["migration"] = {
        "from_schema_version": SOURCE_SCHEMA_VERSION,
        "tool": TOOL_PATH,
        "tool_version": TOOL_VERSION,
        "source_sha256": source_sha256,
        "source_frontend_sha256": source_frontend_sha256,
        "stored_scores_rule": SOURCE_SCHEMA_VERSION,
        "psr_sentinel_nulled": {"value_m": LEGACY_PSR_SENTINEL_M, "count": nulled},
        "added": rec.added,
        "replaced": rec.replaced,
        "notes": [
            "Structural migration: no number was recomputed. revert() in the tool rebuilds the 1.0.0 file; its "
            "SHA-256 equals source_sha256 (outputs copy) and source_frontend_sha256 (minified frontend copy).",
            "Stored score values (engineering_summary.score, local_grid.nodes[].landing_score_0_100) follow the "
            "1.0.0 rule; score.total_without_relay_0_100 is absent because rounded inputs cannot reproduce it.",
            "psr_distance_m null = no PSR point found by the 1.0.0 search (it stored the 5200 m fallback).",
        ],
    }
    return doc


def revert(migrated: dict[str, Any]) -> dict[str, Any]:
    """Inverse of :func:`migrate`: the 1.0.0 document, key order included."""
    doc = copy.deepcopy(migrated)
    record = doc["provenance"].pop("migration")
    for pointer in reversed(record["added"]):
        _delete(doc, pointer)
    for entry in reversed(record["replaced"]):
        _set(doc, entry["path"], copy.deepcopy(entry["from"]))
    restored = 0
    for site in doc["sites"]:
        for _, point in _psr_points(site):
            if point["psr_distance_m"] is None:
                point["psr_distance_m"] = record["psr_sentinel_nulled"]["value_m"]
                restored += 1
    if restored != record["psr_sentinel_nulled"]["count"]:
        raise MigrationError(f"Expected {record['psr_sentinel_nulled']['count']} null PSR distances, found {restored}")
    return doc


# ---------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------

OUTPUTS_RELATIVE = Path("outputs/datasets/south_pole_precomputed.v1.json")
FRONTEND_RELATIVE = Path("frontend/src/data/south_pole_precomputed.v1.json")
CHECKSUM_RELATIVE = Path("frontend/src/data/south_pole_precomputed.v1.json.sha256")


def load_source(repo_root: Path) -> tuple[dict[str, Any], str, str]:
    """The 1.0.0 document and the SHA-256 of its two serialized copies, from either file version."""
    outputs_bytes = (repo_root / OUTPUTS_RELATIVE).read_bytes()
    document = json.loads(outputs_bytes)
    if document.get("schema_version") == SOURCE_SCHEMA_VERSION:
        frontend_bytes = (repo_root / FRONTEND_RELATIVE).read_bytes()
        if json.loads(frontend_bytes) != document:
            raise MigrationError("outputs/ and frontend/src/data copies differ in content")
        if serialize_outputs_dataset(document) != outputs_bytes or serialize_frontend_dataset(document) != frontend_bytes:
            raise MigrationError("1.0.0 copies are not the producer's serialization; the migration could not be reverted")
        return document, _sha256(outputs_bytes), _sha256(frontend_bytes)
    record = document.get("provenance", {}).get("migration")
    if document.get("schema_version") != DATASET_SCHEMA_VERSION or record is None:
        raise MigrationError("Input is neither a 1.0.0 dataset nor a migrated 1.1.0 dataset")
    source = revert(document)
    outputs_sha, frontend_sha = _sha256(serialize_outputs_dataset(source)), _sha256(serialize_frontend_dataset(source))
    if (outputs_sha, frontend_sha) != (record["source_sha256"], record["source_frontend_sha256"]):
        raise MigrationError("revert() does not reproduce the recorded 1.0.0 SHA-256")
    return source, outputs_sha, frontend_sha


def build(repo_root: Path) -> dict[str, Any]:
    source, outputs_sha, frontend_sha = load_source(repo_root)
    migrated = migrate(source, outputs_sha, frontend_sha)
    validate_dataset_schema(migrated)
    if revert(migrated) != source:
        raise MigrationError("revert(migrate(x)) != x")
    return migrated


def expected_files(migrated: dict[str, Any]) -> dict[Path, bytes]:
    frontend = serialize_frontend_dataset(migrated)
    return {
        OUTPUTS_RELATIVE: serialize_outputs_dataset(migrated),
        FRONTEND_RELATIVE: frontend,
        CHECKSUM_RELATIVE: sha256_checksum_line(frontend).encode("utf-8"),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--check", action="store_true", help="Verify the committed files; write nothing.")
    args = parser.parse_args(argv)
    migrated = build(args.repo_root)
    files = expected_files(migrated)
    if args.check:
        stale = [str(p) for p, data in files.items() if (args.repo_root / p).read_bytes() != data]
        if stale:
            print("Not reproducible by this tool: " + ", ".join(stale), file=sys.stderr)
            return 1
        print("Committed 1.1.0 dataset copies are reproducible from the recorded 1.0.0 source.")
        return 0
    written = write_dataset_copies(args.repo_root, migrated)
    for path in written.values():
        print(f"wrote {path.relative_to(args.repo_root)}")
    record = migrated["provenance"]["migration"]
    print(f"1.0.0 source SHA-256: {record['source_sha256']} (outputs), {record['source_frontend_sha256']} (frontend)")
    print(f"frontend copy SHA-256: {_sha256(files[FRONTEND_RELATIVE])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
