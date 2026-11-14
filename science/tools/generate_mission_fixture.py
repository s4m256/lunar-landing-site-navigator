"""Reproduce the guided mission's two SPICE batches from the audited local cache.

No download, terrain calculation, interpolation or independent validation occurs.
The original PR4 audit is read only. Outputs are reviewable scientific evidence.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import platform
import zipfile

from lunar_science.geometry import analyze, validate

ROOT = Path(__file__).resolve().parents[2]
PREVIOUS = ROOT / "docs/audits/pr4"
DATES = ["2026-03-24", "2026-04-28", "2026-09-08"]
SITES = [
    {"id": f"mission-{letter}", "latitude_deg": -85,
     "longitude_east_deg": longitude, "height_m": 0}
    for letter, longitude in zip("abcd", [0, 90, 180, 270])
]


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n")


def generate(cache, output):
    spec = json.loads((PREVIOUS / "kernel-set-2026.json").read_text())
    package = json.loads((PREVIOUS / "package-source.json").read_text())
    wheel = cache / package["filename"]
    if sha256(wheel) != package["digests"]["sha256"]:
        raise ValueError("Cached skyfield-data wheel checksum mismatch")
    with zipfile.ZipFile(wheel) as archive:
        extracted = archive.read("skyfield_data/data/de421.bsp")
    if hashlib.sha256(extracted).hexdigest() != spec[0]["sha256"]:
        raise ValueError("DE421 wheel member checksum mismatch")
    # The engine independently rechecks each file hash before furnishing it.
    for kernel in spec:
        if sha256(cache / kernel["filename"]) != kernel["sha256"]:
            raise ValueError(f"Cached kernel checksum mismatch: {kernel['filename']}")

    batches = []
    for offset in (0, 2):
        request = {
            "schema_version": "1.0.0", "frame": "IAU_MOON",
            "surface_radius_m": 1737400, "sites": SITES[offset:offset + 2],
            "start_utc": "2026-01-01T00:00:00Z",
            "end_utc": "2027-01-01T00:00:00Z", "step_seconds": 86400,
        }
        # Exactly two observers per call, sequential: CSPICE owns a global pool.
        result = analyze(request, cache, spec)
        validate(result, "analysis-result")
        for series in result["series"]:
            if len(series["samples"]) != 365:
                raise ValueError("Incomplete daily batch")
        batches.append(result)

    selected = []
    for date in DATES:
        utc = date + "T00:00:00.000Z"
        rows = []
        for site in SITES:
            samples = {}
            for target in ("SUN", "EARTH"):
                matches = [sample for batch in batches for series in batch["series"]
                           if series["site_id"] == site["id"] and series["target"] == target
                           for sample in series["samples"] if sample["utc"] == utc]
                if len(matches) != 1:
                    raise ValueError(f"Missing/duplicate selected sample: {site['id']}/{target}/{utc}")
                samples[target.lower()] = matches[0]
            rows.append({"site_id": site["id"], **samples,
                         "meets_goal": all(sample["elevation_deg"] > 0 for sample in samples.values())})
        if not any(row["meets_goal"] for row in rows):
            raise ValueError(f"Curated date has no exercise solution: {date}")
        selected.append({"date": date, "sites": rows})

    # Finish all calculations/checks before writing any output.
    output.mkdir(parents=True, exist_ok=True)
    outputs = []
    for name, batch in zip(("ab", "cd"), batches):
        for kind, value in (("request", batch["request"]), ("result", batch)):
            path = output / f"{kind}-{name}-2026.json"
            write_json(path, value)
            outputs.append(path)
    write_json(output / "selected-samples.json", selected)
    outputs.append(output / "selected-samples.json")
    source_paths = [
        "science/tools/generate_mission_fixture.py", "science/src/lunar_science/geometry.py",
        "contracts/analysis-request.v1.schema.json", "contracts/analysis-result.v1.schema.json",
        "contracts/scientific-provenance.v1.schema.json", "docs/audits/pr4/kernel-set-2026.json",
        "docs/audits/pr4/package-source.json", "docs/audits/pr4/network-observations.json",
        "docs/audits/pr4/result-2026.json",
    ]
    manifest = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "python_version": platform.python_version(),
        "generator": "science/tools/generate_mission_fixture.py",
        "execution": "Two sequential annual daily batches, exactly two observers per request.",
        "dates": DATES,
        "date_selection": "Curated educational contrasts from computed daily samples; not a mission window search or continuous clock.",
        "acquisition": {
            "method": "Reused existing local cache; no new network request. Hashes matched preserved PR4 manifest.",
            "de421": "JPL DE421 distributed in the third-party skyfield-data 7.0.0 PyPI wheel; wheel and member hashes checked.",
            "pck_lsk": "Previously acquired from the SpiceyPy test-kernel GitHub mirror; pinned hashes checked.",
            "package_url": package["url"], "package_sha256": package["digests"]["sha256"],
        },
        "kernels": spec,
        "source_sha256": {name: sha256(ROOT / name) for name in source_paths},
        "output_sha256": {path.name: sha256(path) for path in outputs},
        "validation_status": "Real SPICE calculation; NOT independently validated against Horizons.",
        "validation": [
            "Input/output JSON Schemas, pinned kernel hashes and successful SPICE state chains for every sample and boundaries.",
            "Selected samples are exact copies of source results; each curated date has at least one pair strictly above zero.",
            "Prior failed network attempts remain evidence only; no new Horizons or NAIF acquisition attempt was performed.",
            "Primary-source integrity, current LSK completeness and physical angular accuracy remain unconfirmed.",
        ],
    }
    write_json(output / "manifest.json", manifest)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    generate(args.cache_dir, args.output_dir)
    print("Two real SPICE batches generated; three curated UTC dates; not independently validated.")


if __name__ == "__main__":
    main()
