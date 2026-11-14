"""Deterministic regression: no network or external scientific reference."""
import json
from pathlib import Path
import subprocess
import sys

TOOL = Path(__file__).resolve().parents[1] / 'tools/compare_horizons.py'


def test_empty_series_cli_fails_and_never_claims_computed(tmp_path):
    source = tmp_path / 'input.json'
    output = tmp_path / 'report.json'
    source.write_text(json.dumps({'series': [], 'request': {'sites': []}}))
    run = subprocess.run([sys.executable, str(TOOL), '--result', str(source),
                          '--output', str(output)], capture_output=True, text=True)
    report = json.loads(output.read_text())
    assert run.returncode == 2
    assert report['status'] == 'invalid_input'
    assert report['comparisons'] == []


# The response tables below are synthetic parser fixtures, NOT NASA references.
import copy
from datetime import datetime
import importlib.util
from urllib.error import URLError
import pytest

spec = importlib.util.spec_from_file_location('compare_horizons', TOOL)
comparison = importlib.util.module_from_spec(spec)
spec.loader.exec_module(comparison)
EXAMPLE = json.loads((TOOL.parents[1] / 'examples/result.json').read_text())


def valid_input():
    return copy.deepcopy(EXAMPLE)


def forbidden_fetch(url):
    pytest.fail('Invalid input must fail before any network call')


def synthetic_response(samples, azimuth='359', elevation='2'):
    rows = []
    for sample in samples:
        time = datetime.fromisoformat(sample['utc'].removesuffix('Z'))
        rows.append(f'{time:%Y-%b-%d %H:%M:%S.%f}, , , {azimuth}, {elevation},')
    return {'result': 'SYNTHETIC TEST TABLE\n$$SOE\n' + '\n'.join(rows) + '\n$$EOE'}


@pytest.mark.parametrize('case', ['empty_series', 'empty_samples', 'duplicate_pair', 'unknown_site',
                                 'duplicate_site', 'time_mismatch', 'missing_sample', 'nan_angle', 'nan_coordinate'])
def test_invalid_analysis_fails_before_network(case):
    result = valid_input()
    if case == 'empty_series': result['series'] = []
    if case == 'empty_samples': result['series'][0]['samples'] = []
    if case == 'duplicate_pair': result['series'][1] = result['series'][0]
    if case == 'unknown_site': result['series'][0]['site_id'] = 'unknown'
    if case == 'duplicate_site': result['request']['sites'][1]['id'] = result['request']['sites'][0]['id']
    if case == 'time_mismatch': result['series'][0]['samples'][0]['utc'] = '2007-01-01T00:01:00Z'
    if case == 'missing_sample': result['series'][0]['samples'].pop()
    if case == 'nan_coordinate': result['request']['sites'][0]['height_m'] = float('nan')
    if case == 'nan_angle': result['series'][0]['samples'][0]['azimuth_deg'] = float('nan')
    report = comparison.compare(result, forbidden_fetch)
    assert report['status'] == 'invalid_input'
    assert report['comparisons'] == []
    assert report['compared_sample_count'] == 0


def test_network_error_is_distinct_and_query_is_retained():
    def fetch(url): raise URLError('synthetic blocked network')
    report = comparison.compare(valid_input(), fetch)
    assert report['status'] == 'network_error'
    assert report['compared_sample_count'] == 0
    assert len(report['comparisons']) == 1
    assert report['comparisons'][0]['url'].startswith('https://ssd.jpl.nasa.gov/')


@pytest.mark.parametrize('response', [None, {}, {'error': 'synthetic service rejection'},
    {'result': 'no table'}, {'result': '$$SOE\n$$EOE'},
    {'result': '$$EOE\n$$SOE'}, {'result': '$$SOE\n$$EOE\n$$SOE'}])
def test_invalid_service_response_is_not_network_error(response):
    report = comparison.compare(valid_input(), lambda url: response)
    assert report['status'] == 'invalid_reference'
    assert report['comparisons'][0]['response'] == response
    assert report['compared_sample_count'] == 0


def test_malformed_json_response_is_invalid_reference():
    def fetch(url): raise json.JSONDecodeError('synthetic malformed JSON', 'bad', 0)
    assert comparison.compare(valid_input(), fetch)['status'] == 'invalid_reference'


@pytest.mark.parametrize('case', ['wrong_time', 'missing_row', 'extra_row', 'nan', 'infinite', 'range'])
def test_reference_mismatches_fail(case):
    samples = copy.deepcopy(EXAMPLE['series'][0]['samples'])
    if case == 'wrong_time': samples[0]['utc'] = '2007-01-02T00:00:00Z'
    if case == 'missing_row': samples.pop()
    if case == 'extra_row': samples.append(samples[-1])
    az = {'nan': 'nan', 'infinite': 'inf', 'range': '361'}.get(case, '1')
    raw = synthetic_response(samples, azimuth=az)
    report = comparison.compare(valid_input(), lambda url: raw)
    assert report['status'] == 'invalid_reference'
    assert report['compared_sample_count'] == 0


def test_synthetic_complete_comparison_counts_samples_and_wraps_azimuth():
    result = valid_input()
    for series in result['series']:
        for sample in series['samples']: sample.update(azimuth_deg=1, elevation_deg=3)
    report = comparison.compare(result, lambda url: synthetic_response(result['series'][0]['samples']))
    assert report['status'] == comparison.SUCCESS
    assert report['compared_sample_count'] == 12
    assert len(report['comparisons']) == 4
    assert report['validation_status'] == 'not independently validated'
    assert all(r['azimuth_difference_deg'] == 2 and r['elevation_difference_deg'] == 1
               for entry in report['comparisons'] for r in entry['residuals'])


def test_later_network_failure_never_becomes_complete_comparison():
    calls = []
    def fetch(url):
        calls.append(url)
        if len(calls) == 2: raise URLError('synthetic later failure')
        return synthetic_response(EXAMPLE['series'][0]['samples'])
    report = comparison.compare(valid_input(), fetch)
    assert report['status'] == 'network_error'
    assert report['compared_sample_count'] == 3
    assert len(report['comparisons']) == 2


def test_invalid_json_cli_writes_failure_report(tmp_path):
    source, output = tmp_path / 'bad.json', tmp_path / 'report.json'
    source.write_text('not JSON')
    assert comparison.main(['--result', str(source), '--output', str(output)]) == 2
    assert json.loads(output.read_text())['status'] == 'invalid_input'
