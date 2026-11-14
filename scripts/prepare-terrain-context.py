"""Build a visual-only LOLA patch from checksum-pinned, externally acquired files.

This does not transform ME/DE421 to IAU_MOON or compute a terrain horizon.
Only Python's standard library is required; this script makes no network calls.
"""

import argparse
import array
import hashlib
import json
import math
from pathlib import Path
import sys

IMAGE_SHA256 = "972d66d7f330abca62abc21aae270661516c00dd1a881ec102b94df9563656b5"
LABEL_SHA256 = "b5a197b4d417e3b5e0e84f8fe15f9a1d2203b8eb5d7213236c0ffbc86e940cc6"
RADIUS_M = 1737400.0
ROWS, COLS = 720, 1440
SIZE, EXTENT_M = 33, 120000
LATITUDE, LONGITUDE = -89.5, 0.0
MIRRORS = [
    {
        "repository": "https://github.com/marianaq11/lunar-terrain-analysis",
        "commit": "3281471e49abb5c58445ff2a3bfc726409b73424",
        "imageUrl": "https://raw.githubusercontent.com/marianaq11/lunar-terrain-analysis/3281471e49abb5c58445ff2a3bfc726409b73424/data/LDEM_4.IMG",
        "labelUrl": "https://raw.githubusercontent.com/marianaq11/lunar-terrain-analysis/3281471e49abb5c58445ff2a3bfc726409b73424/data/LDEM_4.LBL",
    },
    {
        "repository": "https://github.com/rp3gregorio/Lunar-Clean",
        "commit": "c3de060a9843b7f87bfe516a0af19c3bdbde8bdf",
        "imageUrl": "https://raw.githubusercontent.com/rp3gregorio/Lunar-Clean/c3de060a9843b7f87bfe516a0af19c3bdbde8bdf/LDEM_4.IMG",
        "labelUrl": "https://raw.githubusercontent.com/rp3gregorio/Lunar-Clean/c3de060a9843b7f87bfe516a0af19c3bdbde8bdf/LDEM_4.LBL",
    },
]


def checked_bytes(path, expected):
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f"Unexpected SHA-256: {path.name}")
    return data


def build(image_path, label_path, output_dir):
    data = checked_bytes(image_path, IMAGE_SHA256)
    label = checked_bytes(label_path, LABEL_SHA256)
    if len(data) != ROWS * COLS * 2:
        raise ValueError("Invalid LDEM_4 image dimensions")
    values = array.array("h")
    values.frombytes(data)
    if values.itemsize != 2:
        raise ValueError("This platform does not provide 16-bit array('h')")
    if sys.byteorder != "little":
        values.byteswap()
    # Label bounds also exclude possible int16 sentinel values. Zero is valid.
    if min(values) < -17758 or max(values) > 21008:
        raise ValueError("Raster values outside the bounds in the pinned PDS label")

    def sample(latitude, longitude):
        # Pixel centers: lon 0.125 + col/4, lat 89.875 - row/4.
        x = (longitude % 360.0) * 4.0 - 0.5
        y = max(0.0, min(ROWS - 1.0, (90.0 - latitude) * 4.0 - 0.5))
        x0, y0 = math.floor(x), math.floor(y)
        tx, ty = x - x0, y - y0
        y1 = min(ROWS - 1, y0 + 1)
        a = values[y0 * COLS + (x0 % COLS)]
        b = values[y0 * COLS + ((x0 + 1) % COLS)]
        c = values[y1 * COLS + (x0 % COLS)]
        d = values[y1 * COLS + ((x0 + 1) % COLS)]
        return ((a * (1 - tx) + b * tx) * (1 - ty) +
                (c * (1 - tx) + d * tx) * ty) * 0.5

    lat, lon = math.radians(LATITUDE), math.radians(LONGITUDE)
    east_basis = (-math.sin(lon), math.cos(lon), 0.0)
    north_basis = (-math.sin(lat) * math.cos(lon),
                   -math.sin(lat) * math.sin(lon), math.cos(lat))
    up_basis = (math.cos(lat) * math.cos(lon),
                math.cos(lat) * math.sin(lon), math.sin(lat))
    center_elevation = sample(LATITUDE, LONGITUDE)
    heights, elevations = [], []
    latitudes, longitudes = [], []
    max_residual = 0.0
    for row in range(SIZE):
        north = (0.5 - row / (SIZE - 1)) * EXTENT_M
        for col in range(SIZE):
            east = (col / (SIZE - 1) - 0.5) * EXTENT_M
            height = center_elevation
            # Orthographic ENU grid: solve radius and sampled latitude together.
            # Convergence is a numeric construction check, not physical accuracy.
            for _ in range(32):
                up = math.sqrt((RADIUS_M + height) ** 2 - east**2 - north**2)
                position = [east * east_basis[i] + north * north_basis[i] +
                            up * up_basis[i] for i in range(3)]
                latitude = math.degrees(math.atan2(position[2], math.hypot(*position[:2])))
                longitude = math.degrees(math.atan2(position[1], position[0])) % 360.0
                next_height = sample(latitude, longitude)
                residual = abs(next_height - height)
                height = next_height
                if residual <= 1e-6:
                    break
            else:
                raise ValueError("Terrain grid sampling did not converge")
            max_residual = max(max_residual, residual)
            up = math.sqrt((RADIUS_M + height) ** 2 - east**2 - north**2)
            heights.append(round(up - (RADIUS_M + center_elevation), 3))
            elevations.append(round(height, 3))
            latitudes.append(latitude)
            longitudes.append(longitude)

    metadata = {
        "productId": "LDEM_4", "productVersion": "V3.0",
        "dataSetId": "LRO-L-LOLA-4-GDR-V1.0",
        "producer": "LRO LOLA team / NASA Goddard Space Flight Center",
        "productCreationDate": "2017-09-15",
        "coordinateFrame": "MEAN EARTH/POLAR AXIS OF DE421",
        "referenceRadiusM": RADIUS_M,
        "centerLatitudeDeg": LATITUDE, "centerLongitudeEastDeg": LONGITUDE,
        "projection": "Orthographic local east/north/up, derived from simple cylindrical input",
        "rowOrder": "north-to-south", "columnOrder": "west-to-east",
        "heightDefinition": "Local up relative to the DEM center; includes lunar curvature",
        "elevationDefinition": "Radial metres above the 1737400 m reference sphere",
        "nativePixelsPerDegree": 4, "nativeMapScaleM": 7580.84,
        "inputPixelCenters": "latitude=89.875-row/4; longitudeEast=0.125+column/4",
        "interpolation": "Bilinear; periodic longitude; latitude clamped to outer pixel centers",
        "gridSpacingM": EXTENT_M / (SIZE - 1),
        "verticalExaggeration": 1,
        "sampledLatitudeRangeDeg": [min(latitudes), max(latitudes)],
        "maxIterationResidualM": max_residual,
        "sourceImageSha256": IMAGE_SHA256, "sourceLabelSha256": LABEL_SHA256,
        "use": "VISUAL_CONTEXT_ONLY",
        "limitations": [
            "ME/DE421 coordinates have not been transformed to the scientific IAU_MOON observer.",
            "The numeric center is contextual, not a verified physical coincidence with south-a.",
            "The displayed observer is symbolic; the scientific sample remains at height 0 on its reference sphere.",
            "Bilinear interpolation adds vertices, not measured detail beyond the native DEM resolution.",
            "No terrain occlusion, local horizon, shadow, power or communication window is computed.",
            "Two public mirrors agree byte for byte; direct authentication against the primary archive was unavailable.",
            "Rounded numeric grid values do not certify physical accuracy.",
        ],
    }
    result = {"version": 1, "size": SIZE, "extentM": EXTENT_M,
              "centerElevationM": center_elevation, "heightsM": heights,
              "elevationsM": elevations, "metadata": metadata}
    if len(heights) != SIZE**2 or abs(heights[(SIZE**2)//2]) > 0.001:
        raise ValueError("Invalid grid dimensions or reference center")
    encoded = (json.dumps(result, indent=2, allow_nan=False) + "\n").encode()
    provenance = {
        "primaryImageUrl": "https://imbrium.mit.edu/DATA/LOLA_GDR/CYLINDRICAL/IMG/LDEM_4.IMG",
        "primaryLabelUrl": "https://imbrium.mit.edu/DATA/LOLA_GDR/CYLINDRICAL/IMG/LDEM_4.LBL",
        "acquisition": "Two public GitHub mirrors; original IMG and PDS label agree byte for byte",
        "primaryArchiveVerified": False,
        "mirrors": MIRRORS,
        "sourceImageSha256": IMAGE_SHA256, "sourceImageBytes": len(data),
        "sourceLabelSha256": LABEL_SHA256, "sourceLabelBytes": len(label),
        "artifact": "south-a-context.json",
        "artifactSha256": hashlib.sha256(encoded).hexdigest(),
        "generator": "scripts/prepare-terrain-context.py",
        "sourceObservedMinDN": min(values), "sourceObservedMaxDN": max(values),
        "purpose": "Visual context only; no terrain horizon or scientific observer-frame conversion",
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "south-a-context.json").write_bytes(encoded)
    (output_dir / "LDEM_4.LBL").write_bytes(label)
    (output_dir / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    return provenance


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", type=Path, required=True)
    parser.add_argument("--label", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.image, args.label, args.output_dir), indent=2))


if __name__ == "__main__":
    main()
