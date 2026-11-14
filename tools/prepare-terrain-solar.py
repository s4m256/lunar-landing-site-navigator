#!/usr/bin/env python3
"""Prepare exact-time MOON_ME_DE421 solar vectors for a terrain *visualization*.

No science contract is changed. This is not a terrain visibility/power product.
Uses the published DE421 audit kernels plus official NAIF DE421 lunar FK/BPC.

Example (Python environment with science[dev] installed):
  .venv/bin/python tools/prepare-terrain-solar.py \
    --kernel-dir /tmp/landing-guide-solar-kernels --fetch \
    --output frontend/src/terrain/solar-frames.visual.json

The --fetch flag acquires missing pinned kernels; existing bytes must match too.
No Python, SPICE or kernels are needed by the production frontend.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import io
import json
from pathlib import Path
from urllib.request import urlopen
import zipfile

import jsonschema
import numpy as np
import spiceypy as spice

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / "docs/audits/pr4"
FRAME = "MOON_ME_DE421"
ORIENTATION = [
    {
        "filename": "moon_080317.tf",
        "url": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_080317.tf",
        "sha256": "78732477b96f9863e7b0d65bcee3c22b8707ca5ed0db56d1173319cb2e8c7993",
        "role": "DE421 lunar frame definitions",
    },
    {
        "filename": "moon_pa_de421_1900-2050.bpc",
        "url": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de421_1900-2050.bpc",
        "sha256": "656f90616403d75a75f0cd6c8830fc5b44f8cb4facb5ccb8915e752b397520cf",
        "role": "DE421 lunar principal-axis orientation",
    },
]


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def checked(path: Path, expected: str) -> bytes:
    raw = path.read_bytes()
    if digest(raw) != expected:
        raise ValueError(f"SHA256 mismatch: {path.name}")
    return raw


def acquire(directory: Path, fetch: bool) -> list[dict]:
    original = json.loads((AUDIT / "kernel-set-2026.json").read_text())
    package = json.loads((AUDIT / "package-source.json").read_text())
    specs = original + ORIENTATION
    directory.mkdir(parents=True, exist_ok=True)
    provenance = []
    for item in specs:
        filename = item["filename"]
        if Path(filename).name != filename:
            raise ValueError("Kernel filename must be a basename")
        path = directory / filename
        if not path.exists():
            if not fetch:
                raise FileNotFoundError(f"Missing {filename}; supply pinned files or use --fetch")
            if filename == "de421.bsp":
                archive_path = directory / package["filename"]
                if archive_path.exists():
                    archive_bytes = checked(archive_path, package["digests"]["sha256"])
                else:
                    with urlopen(package["url"], timeout=60) as response:
                        archive_bytes = response.read()
                    if digest(archive_bytes) != package["digests"]["sha256"]:
                        raise ValueError("DE421 container SHA256 mismatch")
                    archive_path.write_bytes(archive_bytes)
                with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
                    raw = archive.read("skyfield_data/data/de421.bsp")
            else:
                with urlopen(item["url"], timeout=60) as response:
                    raw = response.read()
            if digest(raw) != item["sha256"]:
                raise ValueError(f"Downloaded SHA256 mismatch: {filename}")
            path.write_bytes(raw)
        raw = checked(path, item["sha256"])
        provenance.append({
            "filename": filename, "url": item["url"],
            "sha256": item["sha256"], "bytes": len(raw),
            "source": "official NAIF HTTPS" if item in ORIENTATION else "published MVP A audit mirror provenance",
        })
    return provenance


def iso(value: datetime) -> str:
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def exact_source_times() -> tuple[list[str], list[dict]]:
    sources = [
        (AUDIT / "result-2026.json", ROOT / "contracts/analysis-result.v1.schema.json", "daily"),
        (ROOT / "docs/data/mvp-b-hourly.json", ROOT / "contracts/visibility-window.v1.schema.json", "hourly"),
    ]
    all_times: set[str] = set()
    records = []
    expected_pairs = {("south-a", "SUN"), ("south-a", "EARTH"), ("south-b", "SUN"), ("south-b", "EARTH")}
    for path, schema_path, mode in sources:
        raw = path.read_bytes()
        data = json.loads(raw)
        jsonschema.Draft7Validator(json.loads(schema_path.read_text())).validate(data)
        analysis = data if mode == "daily" else data["analysis"]
        count, step = (365, 86400) if mode == "daily" else (721, 3600)
        start = datetime(2026, 1, 1, tzinfo=timezone.utc) if mode == "daily" else datetime(2026, 11, 15, tzinfo=timezone.utc)
        times = [iso(start + timedelta(seconds=i * step)) for i in range(count)]
        pairs = {(series["site_id"], series["target"]) for series in analysis["series"]}
        if len(analysis["series"]) != 4 or pairs != expected_pairs:
            raise ValueError(f"Unexpected site/target pairs in {path.name}")
        for series in analysis["series"]:
            if [sample["utc"] for sample in series["samples"]] != times:
                raise ValueError(f"Unexpected exact UTC grid in {path.name}")
        all_times.update(times)
        records.append({"path": str(path.relative_to(ROOT)), "sha256": digest(raw), "timestamps": count})
    result = sorted(all_times)
    if len(result) != 1055:
        raise ValueError("Expected union of 365 daily + 721 hourly - 31 common timestamps")
    return result, records


def build(directory: Path, fetch: bool) -> dict:
    kernels = acquire(directory, fetch)
    timestamps, sources = exact_source_times()
    samples = []
    maximum_matrix_error = maximum_unit_error = maximum_determinant_error = 0.0
    # Own the process-global SPICE pool; this batch tool is not a threaded backend.
    spice.kclear()
    try:
        # Furnish the generic orientation/clock and SPK before the lunar DE421 frames.
        order = ["naif0012.tls", "pck00010.tpc", "de421.bsp", "moon_080317.tf", "moon_pa_de421_1900-2050.bpc"]
        for name in order:
            spice.furnsh(str(directory / name))
        ids = spice.utils.support_types.SPICEINT_CELL(100)
        spice.pckfrm(str(directory / ORIENTATION[1]["filename"]), ids)
        if 31006 not in ids:
            raise ValueError("DE421 binary orientation frame missing")
        coverage = spice.pckcov(str(directory / ORIENTATION[1]["filename"]), 31006)
        intervals = [list(spice.wnfetd(coverage, i)) for i in range(spice.wncard(coverage))]
        for utc in timestamps:
            et = spice.str2et(utc)
            if not any(start <= et <= end for start, end in intervals):
                raise ValueError(f"Lunar orientation has no coverage at {utc}")
            position, _light_time = spice.spkpos("SUN", et, FRAME, "CN+S", "MOON")
            vector = np.array(position, dtype=float)
            unit = vector / np.linalg.norm(vector)
            rotation = np.array(spice.pxform("IAU_MOON", FRAME, et), dtype=float)
            reverse = np.array(spice.pxform(FRAME, "IAU_MOON", et), dtype=float)
            alias = np.array(spice.pxform("MOON_ME", FRAME, et), dtype=float)
            matrix_error = float(max(np.max(np.abs(rotation.T @ rotation - np.eye(3))), np.max(np.abs(reverse @ rotation - np.eye(3)))))
            unit_error = float(abs(np.linalg.norm(unit) - 1))
            determinant_error = float(abs(np.linalg.det(rotation) - 1))
            if not np.all(np.isfinite(unit)) or not np.all(np.isfinite(rotation)) or matrix_error > 1e-12 or unit_error > 1e-12 or determinant_error > 1e-12 or np.max(np.abs(alias - np.eye(3))) > 1e-12:
                raise ValueError(f"Frame/vector consistency failure at {utc}")
            maximum_matrix_error = max(maximum_matrix_error, matrix_error)
            maximum_unit_error = max(maximum_unit_error, unit_error)
            maximum_determinant_error = max(maximum_determinant_error, determinant_error)
            samples.append({"utc": utc, "sun_unit_me": unit.tolist(), "iau_to_me": rotation.reshape(9).tolist()})
        versions = {"spiceypy": spice.__version__, "cspice": spice.tkvrsn("TOOLKIT"), "numpy": np.__version__}
    finally:
        spice.kclear()
    return {
        "schema_version": "1.0.0", "frame": FRAME, "samples": samples,
        "provenance": {
            "generator": "tools/prepare-terrain-solar.py", "purpose": "visual terrain lighting only; not a scientific visibility result",
            "method": "SPICE spkpos SUN relative to MOON center, output MOON_ME_DE421 at observer epoch, CN+S; normalized vector points toward Sun",
            "site_transform": "row-major pxform(IAU_MOON, MOON_ME_DE421, exact UTC); inverse is transpose",
            "render_basis_y_up": "position=(ME_Y, -ME_Z-R, -ME_X); direction=(ME_Y, -ME_Z, -ME_X)",
            "sources": sources, "kernels": kernels, "versions": versions,
            "pck_coverage_et": intervals,
            "consistency_checks": {"kind": "algebraic numerical consistency, not independent physical validation", "timestamps": len(samples), "max_matrix_roundtrip_or_orthogonality_error": maximum_matrix_error, "max_solar_unit_norm_error": maximum_unit_error, "max_determinant_error": maximum_determinant_error},
            "external_validation": "not performed; no Horizons reference used",
        },
        "limitations": [
            "Direção solar no centro lunar usada como aproximação de luz paralela; não é nova análise topocêntrica em cada vértice.",
            "Sombras renderizadas sobre DEM são uma simulação visual; resolução, extensão, shadow map e bias limitam os resultados.",
            "O marco radial de 0 m das séries A/B não é altura zero sobre o DEM; não alterar as séries idealizadas a partir de pixels sombreados.",
            "IAU_MOON e MOON_ME_DE421 são referenciais distintos; a matriz por UTC deve ser aplicada, sem reutilizar coordenadas numéricas silenciosamente.",
            "Instantes entre amostras não foram calculados; não interpolar orientação solar ou afirmar duração contínua de iluminação.",
            "Sem validação independente contra Horizons, certificação de iluminação, geração de energia, comunicação ou segurança de pouso.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kernel-dir", type=Path, required=True)
    parser.add_argument("--fetch", action="store_true")
    parser.add_argument("--output", type=Path, default=ROOT / "frontend/src/terrain/solar-frames.visual.json")
    args = parser.parse_args()
    data = build(args.kernel_dir, args.fetch)
    raw = (json.dumps(data, separators=(",", ":"), ensure_ascii=False, allow_nan=False) + "\n").encode()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_name(args.output.name + ".tmp")
    temporary.write_bytes(raw)
    temporary.replace(args.output)
    print(f"Prepared {len(data['samples'])} exact UTC visual solar/frame samples; SHA256 {digest(raw)}")
    print("Algebraic checks passed; no independent scientific validation claimed.")


if __name__ == "__main__":
    main()
