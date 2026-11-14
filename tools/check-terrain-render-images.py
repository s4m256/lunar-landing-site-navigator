#!/usr/bin/env python3
"""Functional GPU image checks, never physical accuracy/illumination validation.

Run after scripts/browser-landing-guide.mjs. Requires Pillow only for this test.
"""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageStat


def compare(folder, first, second, minimum_mean):
    a = Image.open(folder / first).convert("RGB")
    b = Image.open(folder / second).convert("RGB")
    assert a.size == b.size, "Comparison captures need identical camera crops"
    difference = ImageChops.difference(a, b)
    means = ImageStat.Stat(difference).mean
    pixels = difference.get_flattened_data() if hasattr(difference, "get_flattened_data") else difference.getdata()
    changed = sum(1 for pixel in pixels if any(pixel))
    assert sum(means) / 3 > minimum_mean, f"No material rendered change: {first} / {second}"
    return {"first": first, "second": second, "width": a.width, "height": a.height,
            "changed_pixels": changed, "mean_absolute_rgb": means,
            "meaning": "Functional visual change only; not physical accuracy or scientific visibility."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    results = [compare(args.directory, "shadow-on.png", "shadow-off.png", 1),
               compare(args.directory, "time-00.png", "time-20.png", 0.1)]
    (args.directory / "render-image-checks.json").write_text(json.dumps(results, indent=2) + "\n")
    print(json.dumps({"status": "PASS", "comparisons": results}, indent=2))


if __name__ == "__main__":
    main()
