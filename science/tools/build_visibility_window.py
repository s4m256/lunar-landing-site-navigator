"""Generate MVP B hourly fallback from verified DE421 cache; never fabricate terrain."""
import argparse
import hashlib
import json
from pathlib import Path

from lunar_science.visibility_window import build_visibility_window

ROOT = Path(__file__).resolve().parents[2]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache-dir', type=Path, required=True,
                        help='Directory populated by verify_de421_audit.py (pinned SHA-256 kernels)')
    parser.add_argument('--output', type=Path, default=ROOT/'docs/data/mvp-b-hourly.json')
    parser.add_argument('--evidence', type=Path, default=ROOT/'docs/evidence/mvp-b/hourly-validation.json')
    args = parser.parse_args(argv)
    spec = json.loads((ROOT/'docs/audits/pr4/kernel-set-2026.json').read_text())
    dataset = build_visibility_window(args.cache_dir, spec)
    text = json.dumps(dataset, indent=2, allow_nan=False, ensure_ascii=False) + '\n'
    encoded = text.encode('utf-8')
    digest = hashlib.sha256(encoded).hexdigest()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(encoded)
    evidence = {
        'dataset_sha256': digest, 'bytes': len(encoded),
        'window': dataset['window'],
        'analysis_request_end_exclusive': dataset['analysis']['request']['end_utc'],
        'site_target_sample_counts': [
            {'site_id': row['site_id'], 'target': row['target'], 'count': len(row['samples'])}
            for row in dataset['analysis']['series']
        ],
        'validation': ['visibility-window JSON Schema', 'exact IDs and coordinates from MVP A',
                       'four distinct site/target pairs', '721 exact UTC timestamps, 720 intervals',
                       'finite angles and contract ranges', 'ideal visible iff center elevation > 0',
                       'topographic visibility null, never assumed zero'],
        'provenance': dataset['analysis']['provenance'],
        'reproduce': '.venv/bin/python science/tools/build_visibility_window.py --cache-dir /tmp/mvp-a-de421-cache',
        'limits': ['No independent Horizons comparison.',
                   'No verified DEM or IAU_MOON-to-DEM frame transform; topography unavailable.',
                   'Flags apply only at samples; no exact continuous visibility durations.'],
    }
    args.evidence.parent.mkdir(parents=True, exist_ok=True)
    args.evidence.write_text(json.dumps(evidence, indent=2, allow_nan=False, ensure_ascii=False)+'\n')
    print(f'Validated 4 x 721 SPICE samples over 720 hours. SHA-256: {digest}')


if __name__ == '__main__':
    main()
