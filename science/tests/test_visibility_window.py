"""MVP B semantic/time contract tests; mutated fixtures are explicitly negative inputs."""
import copy
import hashlib
import json
from pathlib import Path

import pytest
import jsonschema

from lunar_science.visibility_window import (
    WINDOW, center_above_ideal_horizon, hourly_request, hourly_timestamps,
    transition_brackets, validate_visibility_window,
)

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT/'docs/data/mvp-b-hourly.json'


@pytest.fixture
def dataset():
    return json.loads(DATA.read_text())


def test_generated_hourly_grid_covers_inclusive_window_with_720_intervals(dataset):
    validate_visibility_window(dataset)
    assert dataset['window'] == WINDOW
    timestamps = hourly_timestamps()
    assert len(timestamps) == 721
    assert timestamps[0] == '2026-11-15T00:00:00.000Z'
    assert timestamps[-1] == '2026-12-15T00:00:00.000Z'
    assert len(timestamps)-1 == 720
    assert dataset['analysis']['request'] == hourly_request()
    assert hourly_request()['end_utc'] == '2026-12-15T01:00:00Z'
    assert all(len(row['samples']) == 721 for row in dataset['analysis']['series'])
    assert dataset['topography']['status'] == 'unavailable'
    assert all(row['topographic_visible'] is None for row in dataset['visibility'])


def test_every_daily_overlap_exactly_preserves_mvp_a_calculation(dataset):
    """Same engine+kernels arithmetic consistency, not external physical validation."""
    previous = json.loads((ROOT/'docs/audits/pr4/result-2026.json').read_text())
    previous_by_pair = {(r['site_id'], r['target']): {s['utc']: s for s in r['samples']}
                        for r in previous['series']}
    compared = 0
    for row in dataset['analysis']['series']:
        previous_samples = previous_by_pair[(row['site_id'], row['target'])]
        for sample in row['samples']:
            if sample['utc'] in previous_samples:
                assert sample == previous_samples[sample['utc']]
                compared += 1
    assert compared == 31*4


def test_schema_packaged_copy_and_embedded_analysis_schema_remain_identical():
    contract = ROOT/'contracts/visibility-window.v1.schema.json'
    packaged = ROOT/'science/src/lunar_science/schemas/visibility-window.v1.schema.json'
    assert contract.read_bytes() == packaged.read_bytes()
    original = json.loads((ROOT/'contracts/analysis-result.v1.schema.json').read_text())
    original.pop('$schema')
    assert json.loads(contract.read_text())['definitions']['analysis'] == original


def test_dataset_hash_is_recorded_in_reproduction_evidence():
    evidence = json.loads((ROOT/'docs/evidence/mvp-b/hourly-validation.json').read_text())
    assert hashlib.sha256(DATA.read_bytes()).hexdigest() == evidence['dataset_sha256']


@pytest.mark.parametrize('elevation,visible', [(-90, False), (-0.00001, False), (0, False),
                                             (0.00001, True), (90, True)])
def test_visibility_is_strict_center_above_zero(elevation, visible):
    assert center_above_ideal_horizon(elevation) is visible


@pytest.mark.parametrize('value', [float('nan'), float('inf'), -float('inf'), True])
def test_center_criterion_rejects_invalid_values(value):
    with pytest.raises(ValueError):
        center_above_ideal_horizon(value)


@pytest.mark.parametrize('case', ['coordinates', 'frame', 'longitude', 'grid', 'duplicate_pair',
                                  'wrong_target', 'count', 'nan', 'range', 'wrong_visibility',
                                  'duplicate_visibility', 'fake_topography', 'window_intervals',
                                  'analysis_exclusive_end', 'provenance_nan'])
def test_invalid_inputs_fail_explicitly(dataset, case):
    bad = copy.deepcopy(dataset)
    if case == 'coordinates': bad['analysis']['request']['sites'][0]['latitude_deg'] = -89
    if case == 'frame': bad['analysis']['request']['frame'] = 'MOON_ME'
    if case == 'longitude': bad['analysis']['request']['sites'][1]['longitude_east_deg'] = -270
    if case == 'grid': bad['analysis']['series'][0]['samples'][1]['utc'] = '2026-11-15T02:00:00.000Z'
    if case == 'duplicate_pair': bad['analysis']['series'][1] = bad['analysis']['series'][0]
    if case == 'wrong_target': bad['analysis']['series'][0]['target'] = 'MARS'
    if case == 'count': bad['analysis']['series'][0]['samples'].pop()
    if case == 'nan': bad['analysis']['series'][0]['samples'][0]['elevation_deg'] = float('nan')
    if case == 'range': bad['analysis']['series'][0]['samples'][0]['elevation_deg'] = 91
    if case == 'wrong_visibility': bad['visibility'][0]['ideal_visible'][0] = not bad['visibility'][0]['ideal_visible'][0]
    if case == 'duplicate_visibility': bad['visibility'][1] = bad['visibility'][0]
    if case == 'fake_topography': bad['visibility'][0]['topographic_visible'] = [False]*721
    if case == 'window_intervals': bad['window']['interval_count'] = 721
    if case == 'analysis_exclusive_end': bad['analysis']['request']['end_utc'] = '2026-12-15T00:00:00Z'
    if case == 'provenance_nan': bad['analysis']['provenance']['kernels'][0]['coverage_et'] = {'3': [[float('nan'), 123]]}
    with pytest.raises((ValueError, jsonschema.ValidationError)):
        validate_visibility_window(bad)


def test_transition_brackets_report_uncertainty_not_continuous_duration():
    times = hourly_timestamps()
    # 721 timestamps span 720 hours; no inferred duration or transition for all-dark/all-bright.
    assert transition_brackets(times, [False]*721) == []
    assert transition_brackets(times, [True]*721) == []
    flags = [False]+[True]*719+[False]
    brackets = transition_brackets(times, flags)
    assert len(brackets) == 2
    assert brackets[0] == {
        'after_utc': times[0], 'by_utc': times[1], 'from_visible': False,
        'to_visible': True, 'bracket_seconds': 3600.0,
    }
    assert brackets[1]['after_utc'] == times[-2]
    assert brackets[1]['by_utc'] == times[-1]
    assert brackets[1]['bracket_seconds'] == 3600.0
    assert not any('duration' in key for row in brackets for key in row)


def test_transition_brackets_reject_nonmonotonic_or_incomplete_data():
    times = hourly_timestamps()[:2]
    for timestamps, flags in [(times, [False]), (times[::-1], [True, False]),
                              (times, [True, 0]), (['2026-11-15T00:00:00']*2, [True, False])]:
        with pytest.raises(ValueError):
            transition_brackets(timestamps, flags)
