"""Reproduce published audit using the existing engine, never certify physical accuracy."""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen
import zipfile

import spiceypy as spice
from lunar_science.geometry import analyze

AUDIT = Path(__file__).resolve().parents[2] / 'docs/audits/pr4'


def checked_file(path, url, sha256):
    if path.exists():
        data = path.read_bytes()
    else:
        with urlopen(url, timeout=60) as response:
            data = response.read()
    if hashlib.sha256(data).hexdigest() != sha256:
        raise ValueError(f'Checksum mismatch: {path.name}')
    path.write_bytes(data)
    return path


def reproduce(cache, output):
    cache.mkdir(parents=True, exist_ok=True)
    output.mkdir(parents=True, exist_ok=True)
    spec = json.loads((AUDIT / 'kernel-set-2026.json').read_text())
    package = json.loads((AUDIT / 'package-source.json').read_text())
    wheel = checked_file(cache / package['filename'], package['url'], package['digests']['sha256'])
    # Acquisition source is the third-party wheel, not a direct verified NAIF download.
    with zipfile.ZipFile(wheel) as archive:
        data = archive.read('skyfield_data/data/de421.bsp')
    if hashlib.sha256(data).hexdigest() != spec[0]['sha256']:
        raise ValueError('Extracted DE421 checksum mismatch')
    (cache / spec[0]['filename']).write_bytes(data)
    for kernel in spec[1:]:
        checked_file(cache / kernel['filename'], kernel['url'], kernel['sha256'])
    request = json.loads((AUDIT / 'request-2026.json').read_text())
    result = analyze(request, cache, spec)
    (output / 'result-2026.json').write_text(json.dumps(result, indent=2, allow_nan=False)+'\n')
    # Check coverage of every required barycentric chain segment across all 2026,
    # not just coverage at the sampled epochs. Analyze already probes retarded epochs.
    try:
        for item in spec:
            spice.furnsh(str(cache / item['filename']))
        start = spice.utc2et(request['start_utc'])
        end = spice.utc2et(request['end_utc'])
        coverage = {}
        for body in (3, 10, 301, 399):
            window = spice.spkcov(str(cache / spec[0]['filename']), body)
            intervals = [list(spice.wnfetd(window, i)) for i in range(spice.wncard(window))]
            if not any(lo <= start and hi >= end for lo, hi in intervals):
                raise ValueError(f'Full 2026 SPK coverage missing for {body}')
            coverage[str(body)] = intervals
    finally:
        spice.kclear()
    previous = json.loads((AUDIT / 'result-2026.json').read_text())
    summary = {'validation_status': 'not independently validated',
               'acquisition': 'JPL DE421 distributed by third-party skyfield-data wheel; pinned SHA-256',
               'coverage_et': coverage, 'samples_per_series': [len(s['samples']) for s in result['series']],
               'series_exact_match_to_published_audit': result['series'] == previous['series'],
               'current_provenance': result['provenance'],
               'notes': ['Exact reproduction is a floating-point reproducibility check, not a physical error bound.',
                         'NAIF primary integrity and current LSK completeness remain unconfirmed.',
                         'No Horizons query is performed by this script.']}
    (output / 'reproduction-summary.json').write_text(json.dumps(summary, indent=2)+'\n')
    if not summary['series_exact_match_to_published_audit']:
        raise ValueError('Series differ from published audit: inspect outputs/versions; no tolerance assumed')
    return summary


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache-dir', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args(argv)
    reproduce(args.cache_dir, args.output_dir)
    print('DE421 hashes, 2026 SPK coverage and published series reproduced; not independently validated.')


if __name__ == '__main__':
    main()
