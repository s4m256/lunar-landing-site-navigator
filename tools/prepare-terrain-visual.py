"""Prepare the static visual terrain asset from official PDS LOLA bytes.

Run offline from a verified cache:
  .venv/bin/python tools/prepare-terrain-visual.py \
    --cache /tmp/landing-guide-terrain-investigation --no-download

Without --no-download, missing source files are fetched over normal HTTPS.
NumPy is needed only by this offline producer, never in the static application.
This tool does not produce scientific visibility windows or illumination results.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.request import urlopen

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/"
IMG_URL = BASE + "data/lola_gdr/polar/img/ldem_80s_80m.img"
LBL_URL = BASE + "data/lola_gdr/polar/img/ldem_80s_80m.lbl"
XML_URL = BASE + "data/lola_gdr/polar/img/ldem_80s_80m.xml"
PROJECTION_URL = BASE + "catalog/dsmap_polar.cat"
IMG_SHA = "e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc"
LBL_SHA = "107c7558cbf8832e4119d3c8c2b1b272623344275c85378a9b0e03c22876eb33"
XML_SHA = "487f8ea74a3f4f0bac67ae70864c70e9149a16bba869d4510f667cae16d077bd"
PROJECTION_SHA = "e5f345f60f75f8fef00f7b59b806306616bf195079c537195e6413b8a6501ca9"
SOURCE_SIZE = 115_520_000
START, STRIDE, COUNT = 2520, 5, 513


def digest(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as stream:
        while block := stream.read(1024 * 1024):
            result.update(block)
    return result.hexdigest()


def acquire(path: Path, url: str, expected_sha: str, allow_download: bool) -> None:
    if not path.exists():
        if not allow_download:
            raise FileNotFoundError(f"Missing source {path}; download is disabled")
        temporary = path.with_suffix(path.suffix + ".part")
        with urlopen(url, timeout=120) as response, temporary.open("wb") as stream:
            while block := response.read(1024 * 1024):
                stream.write(block)
        if digest(temporary) != expected_sha:
            temporary.unlink()
            raise ValueError(f"Downloaded bytes do not match pinned PDS source: {url}")
        temporary.replace(path)
    if digest(path) != expected_sha:
        raise ValueError(f"Source checksum mismatch: {path}")


def validate_label(path: Path) -> None:
    text = path.read_text()

    def number(key: str) -> float:
        match = re.search(rf"^\s*{re.escape(key)}\s*=\s*([-+]?\d+(?:\.\d*)?)", text, re.MULTILINE)
        if not match:
            raise ValueError(f"Missing required PDS field: {key}")
        return float(match.group(1))

    required_numbers = {
        "LINES": 7600, "LINE_SAMPLES": 7600, "SAMPLE_BITS": 16,
        "SCALING_FACTOR": 0.5, "OFFSET": 1737400, "MAP_SCALE": 80,
        "LINE_PROJECTION_OFFSET": 3799.5, "SAMPLE_PROJECTION_OFFSET": 3799.5,
        "CENTER_LATITUDE": -90, "CENTER_LONGITUDE": 0,
        "A_AXIS_RADIUS": 1737.4, "B_AXIS_RADIUS": 1737.4, "C_AXIS_RADIUS": 1737.4,
        "DERIVED_MINIMUM": -14592, "DERIVED_MAXIMUM": 14052,
    }
    for key, expected in required_numbers.items():
        if number(key) != expected:
            raise ValueError(f"Unsupported {key}: {number(key)}")
    required_strings = {
        "PRODUCT_VERSION_ID": '"V2.0"',
        "DATA_SET_ID": '"LRO-L-LOLA-4-GDR-V1.0"',
        "SAMPLE_TYPE": "LSB_INTEGER", "UNIT": "METER",
        "MAP_PROJECTION_TYPE": '"POLAR STEREOGRAPHIC"',
        "KEYWORD_LATITUDE_TYPE": '"PLANETOCENTRIC"',
        "POSITIVE_LONGITUDE_DIRECTION": '"EAST"',
        "COORDINATE_SYSTEM_NAME": '"MEAN EARTH/POLAR AXIS OF DE421"',
    }
    for key, expected in required_strings.items():
        if not re.search(rf"^\s*{key}\s*=\s*{re.escape(expected)}\s*$", text, re.MULTILINE):
            raise ValueError(f"Unsupported or missing PDS field: {key}")


def produce(cache: Path, output: Path, allow_download: bool) -> None:
    cache.mkdir(parents=True, exist_ok=True)
    image = cache / "ldem_80s_80m.img"
    label = cache / "ldem_80s_80m.lbl"
    xml = cache / "ldem_80s_80m.xml"
    projection = cache / "dsmap_polar.cat"
    sources = ((image, IMG_URL, IMG_SHA), (label, LBL_URL, LBL_SHA),
               (xml, XML_URL, XML_SHA), (projection, PROJECTION_URL, PROJECTION_SHA))
    for local, url, sha in sources:
        acquire(local, url, sha, allow_download)
    validate_label(label)
    if image.stat().st_size != SOURCE_SIZE:
        raise ValueError("Raster length does not match 7600×7600 int16 samples")
    array = np.memmap(image, dtype="<i2", shape=(7600, 7600), mode="r")
    if int(array.min()) != -14592 or int(array.max()) != 14052:
        raise ValueError("Raster min/max do not match the product label")
    if np.any(array == -32768) or np.any(array == 32767):
        raise ValueError("Unexpected sentinel; no replacement or assumed ground permitted")

    stop = START + STRIDE * COUNT
    source_crop = array[START:stop:STRIDE, START:stop:STRIDE]
    if source_crop.shape != (COUNT, COUNT):
        raise ValueError("Requested crop extends outside the source")
    heights = source_crop.astype(np.float64) * 0.5
    # Preserve source pixel centers. The pole lies between the four center pixels.
    origin_x, origin_y = (START - 3799.5) * 80, (3799.5 - START) * 80
    provenance = {
        "product": "LDEM_80S_80M", "product_version": "V2.0",
        "data_set_id": "LRO-L-LOLA-4-GDR-V1.0",
        "product_creation_date": "2017-06-15",
        "producer_institution": "Goddard Space Flight Center / LRO LOLA team",
        "source_img_url": IMG_URL, "source_img_sha256": IMG_SHA,
        "source_img_bytes": SOURCE_SIZE,
        "source_label_url": LBL_URL, "source_label_sha256": LBL_SHA,
        "source_xml_url": XML_URL, "source_xml_sha256": XML_SHA,
        "projection_catalog_url": PROJECTION_URL, "projection_catalog_sha256": PROJECTION_SHA,
        "source_width": 7600, "source_height": 7600, "source_step_m": 80,
        "source_sample_type": "little-endian signed int16",
        "source_height_formula": "height_m = DN * 0.5; planetary_radius_m = height_m + 1737400",
        "source_row_start": START, "source_col_start": START, "source_stride": STRIDE,
        "sampling": "Exact every-fifth source pixel; 80 m grid decimated to 400 m visual mesh; no averaging",
        "integrity": "Official HTTPS acquisition; byte length and label min/max checked; local pinned SHA256s, not independent physical validation",
        "publisher_checksum_manifest": "Not found in the inspected volume root; local digest is not advertised as a publisher signature",
    }
    payload = {
        "asset_version": "1.0.0", "purpose": "visual_topography_only",
        "frame": "MOON_ME_DE421", "coordinate_system_name": "MEAN EARTH/POLAR AXIS OF DE421",
        "projection": "south_polar_stereographic", "projection_origin_latitude_deg": -90,
        "projection_origin_longitude_east_deg": 0,
        "reference_radius_m": 1737400,
        "width": COUNT, "height": COUNT, "origin_x_m": origin_x, "origin_y_m": origin_y,
        "step_m": STRIDE * 80,
        "axis_convention": "x eastward toward 90E, y northward toward 0E; x=origin_x+column*step, y=origin_y-row*step",
        "height_unit": "m radial elevation above reference sphere, not geoid or tangent-plane height",
        "pixel_registration": "Source pixel centers, zero-based row/column; no silent half-pixel shift",
        "nodata": {"declared_value": None, "unexpected_int16_extreme_sentinels": 0,
                   "outside_extent": "unavailable; do not clamp or fill with zero"},
        "min_height_m": float(heights.min()), "max_height_m": float(heights.max()),
        "heights_m": heights.ravel().tolist(),
        "provenance": provenance,
        "limitations": [
            "The source interpolates LOLA ground tracks using GMT; not a direct measurement at every grid point.",
            "A 400 m visual mesh omits smaller features; visual shadow maps have finite resolution and coverage.",
            "Convert radial heights and map coordinates to curved lunar geometry before casting long shadows.",
            "MOON_ME_DE421 and IAU_MOON coordinates cannot be silently treated as the same physical location.",
            "No scientific topographic visibility windows, energy, radio-link availability or safety are produced by this asset.",
        ],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, separators=(",", ":")) + "\n")
    # Verify the entire exported array against its exact source cell mapping.
    exported = json.loads(output.read_text())
    if not np.array_equal(np.asarray(exported["heights_m"]).reshape(COUNT, COUNT), source_crop * 0.5):
        raise ValueError("Exported terrain differs from source cells")
    sidecar = output.with_name(output.stem + ".provenance.json")
    sidecar.write_text(json.dumps({
        "artifact": output.name, "artifact_sha256": digest(output), "artifact_bytes": output.stat().st_size,
        "producer": "tools/prepare-terrain-visual.py", "source_provenance": provenance,
        "checks": {"source_sha256": "pass", "source_label_fields": "pass", "source_byte_length": "pass",
                   "source_dn_min_max": "pass", "exported_exact_source_samples": COUNT * COUNT,
                   "independent_physical_validation": "not_performed"},
    }, indent=2) + "\n")
    print(f"{output}: {output.stat().st_size} bytes, {COUNT * COUNT} samples, sha256={digest(output)}")
    print(f"Provenance: {sidecar}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=Path("/tmp/lunar-lola-visual-cache"))
    parser.add_argument("--output", type=Path, default=ROOT / "frontend/src/terrain/south-pole-dem.visual.json")
    parser.add_argument("--no-download", action="store_true")
    options = parser.parse_args()
    produce(options.cache, options.output, not options.no_download)
