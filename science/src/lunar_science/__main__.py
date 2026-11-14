"""Batch CLI: existing status output is preserved when no subcommand is supplied."""
import argparse
import json
import sys
from pathlib import Path
from urllib.request import urlopen
import hashlib

from lunar_science import get_status
from lunar_science.geometry import AnalysisError, analyze


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command')
    for name in ('fetch-kernels', 'analyze'):
        p = sub.add_parser(name)
        p.add_argument('--kernel-set', required=True, type=Path)
        p.add_argument('--kernel-dir', required=True, type=Path)
        if name == 'analyze':
            p.add_argument('--request', required=True, type=Path)
            p.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    try:
        if args.command is None:
            print(json.dumps(get_status(), ensure_ascii=False))
            return
        spec = json.loads(args.kernel_set.read_text())
        if args.command == 'fetch-kernels':
            args.kernel_dir.mkdir(parents=True, exist_ok=True)
            for item in spec:
                if Path(item['filename']).name != item['filename'] or not item['url'].startswith('https://'):
                    raise AnalysisError('INVALID_KERNEL_SET', 'HTTPS URL and basename required')
                dest = args.kernel_dir / item['filename']
                data = dest.read_bytes() if dest.is_file() else urlopen(item['url'], timeout=60).read()
                if hashlib.sha256(data).hexdigest() != item['sha256']:
                    raise AnalysisError('KERNEL_CHECKSUM', item['filename'])
                dest.write_bytes(data)
            print('Kernels downloaded and SHA-256 verified', file=sys.stderr)
        else:
            result = analyze(json.loads(args.request.read_text()), args.kernel_dir, spec)
            # No partial output on failure.
            args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False)+'\n')
    except (AnalysisError, OSError, ValueError, KeyError, TypeError) as exc:
        print(json.dumps({'error': {'code': getattr(exc, 'code', 'IO_OR_INPUT_ERROR'), 'message': str(exc)}}), file=sys.stderr)
        sys.exit(2)


if __name__ == '__main__':
    main()
