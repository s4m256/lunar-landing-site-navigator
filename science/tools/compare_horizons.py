"""Compare retained Horizons references; calculating residuals does not certify accuracy."""
import argparse
import csv
from datetime import datetime, timedelta
import io
import json
import math
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

from lunar_science.geometry import validate

SUCCESS = 'computed_requires_header_review'


def fetch_json(url):
    with urlopen(url, timeout=60) as response:
        return json.loads(response.read())


def validate_analysis(result):
    validate(result, 'analysis-result')
    request = result['request']
    sites = {site['id'] for site in request['sites']}
    if len(sites) != 2:
        raise ValueError('Two distinct site IDs required')
    if not all(math.isfinite(site[key]) for site in request['sites']
               for key in ('latitude_deg', 'longitude_east_deg', 'height_m')):
        raise ValueError('Site coordinates must be finite')
    expected_pairs = {(site, target) for site in sites for target in ('SUN', 'EARTH')}
    pairs = {(s['site_id'], s['target']) for s in result['series']}
    if pairs != expected_pairs:
        raise ValueError('Exactly one series for each site/target pair required')
    start, end = (datetime.fromisoformat(request[k].replace('Z', '+00:00'))
                  for k in ('start_utc', 'end_utc'))
    if end <= start:
        raise ValueError('Empty or inverted request interval')
    step = request['step_seconds']
    count = math.ceil((end-start).total_seconds()/step)
    if count > 100000:
        raise ValueError('Request exceeds engine sample limit')
    expected_grid = [start + timedelta(seconds=i*step) for i in range(count)]
    for series in result['series']:
        samples = series['samples']
        grid = [datetime.fromisoformat(s['utc'].replace('Z', '+00:00')) for s in samples]
        if grid != expected_grid:
            raise ValueError('Sample times must match the complete requested UTC grid')
        if not all(math.isfinite(s[key]) for s in samples for key in ('azimuth_deg', 'elevation_deg')):
            raise ValueError('Angles must be finite')


def query_url(site, series):
    times = '\n'.join(s['utc'].removesuffix('Z') for s in series['samples'])
    params = {'format': 'json', 'COMMAND': "'10'" if series['target'] == 'SUN' else "'399'",
              'CENTER': "'coord@301'", 'COORD_TYPE': "'GEODETIC'",
              'SITE_COORD': f"'{site['longitude_east_deg']},{site['latitude_deg']},{site['height_m']/1000}'",
              'EPHEM_TYPE': "'OBSERVER'", 'MAKE_EPHEM': "'YES'", 'TLIST': "'"+times+"'",
              'QUANTITIES': "'4'", 'CSV_FORMAT': "'YES'", 'APPARENT': "'AIRLESS'",
              'EXTRA_PREC': "'YES'", 'TIME_DIGITS': "'FRACSEC'"}
    return 'https://ssd.jpl.nasa.gov/api/horizons.api?' + urlencode(params)


def parse_residuals(raw, samples):
    if not isinstance(raw, dict) or 'error' in raw:
        raise ValueError(f'Invalid Horizons response: {raw}')
    text = raw.get('result')
    if not isinstance(text, str) or text.count('$$SOE') != 1 or text.count('$$EOE') != 1:
        raise ValueError('Expected one Horizons ephemeris table')
    if text.index('$$SOE') > text.index('$$EOE'):
        raise ValueError('Horizons table markers out of order')
    table = text.split('$$SOE')[1].split('$$EOE')[0]
    rows = [row for row in csv.reader(io.StringIO(table)) if row and row[0].strip()]
    if not samples or len(rows) != len(samples):
        raise ValueError('Horizons row count differs from nonempty requested samples')
    residuals = []
    for sample, row in zip(samples, rows, strict=True):
        # Quantity 4: UTC date, optional flags, azimuth, elevation, trailing empty column.
        fields = [x.strip() for x in row if x.strip()]
        reference_time = datetime.strptime(row[0].strip(), '%Y-%b-%d %H:%M:%S.%f')
        expected_time = datetime.fromisoformat(sample['utc'].removesuffix('Z'))
        if reference_time != expected_time:
            raise ValueError('Horizons time differs from requested sample')
        az, el = map(float, fields[-2:])
        if not (math.isfinite(az) and math.isfinite(el) and 0 <= az <= 360 and -90 <= el <= 90):
            raise ValueError('Invalid Horizons azimuth/elevation')
        residuals.append({'utc': sample['utc'],
                          'azimuth_difference_deg': (sample['azimuth_deg']-az+180) % 360-180,
                          'elevation_difference_deg': sample['elevation_deg']-el})
    return residuals


def compare(result, fetch=fetch_json):
    report = {'status': 'invalid_input', 'comparisons': [], 'compared_sample_count': 0,
              'validation_status': 'not independently validated',
              'notes': ['Residual calculation is not physical validation; review full retained headers.',
                        'Check ephemeris, orientation, observer radius/coordinates, UTC and airless conventions.',
                        'No physical pass/fail tolerance is assumed.']}
    try:
        validate_analysis(result)
    except (ValueError, KeyError, TypeError, OverflowError) as exc:
        report['error'] = str(exc)
        return report
    for series in result['series']:
        site = next(s for s in result['request']['sites'] if s['id'] == series['site_id'])
        entry = {'site_id': series['site_id'], 'target': series['target'],
                 'url': query_url(site, series)}
        report['comparisons'].append(entry)  # Retain attempted query even when transport fails.
        try:
            raw = fetch(entry['url'])
        except OSError as exc:
            report.update(status='network_error', error=str(exc))
            return report
        except (ValueError, TypeError) as exc:
            report.update(status='invalid_reference', error=str(exc))
            return report
        entry['response'] = raw
        try:
            entry['residuals'] = parse_residuals(raw, series['samples'])
        except (ValueError, TypeError, KeyError, IndexError) as exc:
            report.update(status='invalid_reference', error=str(exc))
            return report
        report['compared_sample_count'] += len(entry['residuals'])
    # Validation above guarantees four distinct nonempty series; no empty-loop success.
    if len(report['comparisons']) == 4 and report['compared_sample_count'] > 0:
        report['status'] = SUCCESS
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--result', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        result = json.loads(args.result.read_text())
    except (OSError, ValueError) as exc:
        report = {'status': 'invalid_input', 'comparisons': [], 'compared_sample_count': 0,
                  'validation_status': 'not independently validated', 'error': str(exc)}
    else:
        report = compare(result)
    args.output.write_text(json.dumps(report, indent=2, allow_nan=False)+'\n')
    return 0 if report['status'] == SUCCESS else 2


if __name__ == '__main__':
    raise SystemExit(main())
