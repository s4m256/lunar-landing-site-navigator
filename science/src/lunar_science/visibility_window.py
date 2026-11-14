"""MVP B hourly apparent-center samples. No terrain substitute or duration inference."""
from datetime import datetime, timedelta, timezone
from importlib.resources import files
import json
import math

import jsonschema

from .geometry import analyze

WINDOW = {
    'start_utc': '2026-11-15T00:00:00Z',
    'end_utc': '2026-12-15T00:00:00Z',
    'end_inclusive': True,
    'step_seconds': 3600,
    'timestamp_count': 721,
    'interval_count': 720,
}
SITES = [
    {'id': 'south-a', 'latitude_deg': -89.5, 'longitude_east_deg': 0, 'height_m': 0},
    {'id': 'south-b', 'latitude_deg': -89, 'longitude_east_deg': 90, 'height_m': 0},
]
TERRAIN_REASON = (
    'LOLA terrain unavailable: official NASA/PDS/PGDA metadata and DEM could not '
    'be acquired and verified in this environment. No topographic profile or '
    'visibility is inferred. IAU_MOON coordinates have not been transformed to '
    'a verified DEM reference frame.'
)


def hourly_request():
    """Reuse the existing half-open engine while retaining the last requested sample."""
    return {
        'schema_version': '1.0.0', 'frame': 'IAU_MOON', 'surface_radius_m': 1737400,
        'sites': [dict(site) for site in SITES],
        'start_utc': WINDOW['start_utc'],
        # analyze is [start,end): one extra endpoint labels the requested inclusive grid.
        'end_utc': '2026-12-15T01:00:00Z', 'step_seconds': 3600,
    }


def hourly_timestamps():
    start = datetime(2026, 11, 15, tzinfo=timezone.utc)
    return [(start + timedelta(hours=i)).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
            for i in range(721)]


def center_above_ideal_horizon(elevation_deg):
    """Strict center criterion. Zero is a contact, not positive visibility."""
    if isinstance(elevation_deg, bool) or not math.isfinite(elevation_deg):
        raise ValueError('Elevation must be a finite angle')
    return elevation_deg > 0.0


def validate_visibility_window(dataset):
    """Structural contract plus semantics that JSON Schema cannot establish alone."""
    schema = json.loads(files('lunar_science').joinpath('schemas/visibility-window.v1.schema.json').read_text())
    jsonschema.Draft7Validator(schema).validate(dataset)
    def finite_json(value):
        if isinstance(value, float) and not math.isfinite(value):
            raise ValueError('Non-finite numeric value in dataset')
        if isinstance(value, dict):
            for child in value.values(): finite_json(child)
        elif isinstance(value, list):
            for child in value: finite_json(child)
    finite_json(dataset)
    analysis = dataset['analysis']
    if analysis['request'] != hourly_request():
        raise ValueError('Hourly request must preserve exact MVP A sites, frame and UTC coverage')
    expected = hourly_timestamps()
    expected_pairs = {(site['id'], target) for site in SITES for target in ('SUN', 'EARTH')}
    series_by_pair = {}
    for series in analysis['series']:
        pair = (series['site_id'], series['target'])
        if pair not in expected_pairs or pair in series_by_pair:
            raise ValueError('Four unique site/target pairs are required')
        samples = series['samples']
        if [sample['utc'] for sample in samples] != expected:
            raise ValueError('Every series must contain the same 721 exact hourly UTC timestamps')
        for sample in samples:
            if not all(math.isfinite(sample[name]) for name in ('azimuth_deg', 'elevation_deg')):
                raise ValueError('Non-finite angular value')
        series_by_pair[pair] = series
    if set(series_by_pair) != expected_pairs:
        raise ValueError('Missing site/target pair')
    visibility_pairs = set()
    for row in dataset['visibility']:
        pair = (row['site_id'], row['target'])
        if pair not in expected_pairs or pair in visibility_pairs:
            raise ValueError('Four unique visibility pairs are required')
        visibility_pairs.add(pair)
        flags = [center_above_ideal_horizon(sample['elevation_deg'])
                 for sample in series_by_pair[pair]['samples']]
        if row['ideal_visible'] != flags:
            raise ValueError('Visibility must equal each center elevation > zero at the exact sample')
    if visibility_pairs != expected_pairs:
        raise ValueError('Missing visibility pair')
    return dataset


def build_visibility_window(directory, kernel_spec):
    """Run existing SPICE engine; terrain remains unavailable pending verified DEM."""
    result = analyze(hourly_request(), directory, kernel_spec)
    dataset = {
        'schema_version': '1.0.0', 'window': dict(WINDOW), 'analysis': result,
        'topography': {'status': 'unavailable', 'reason': TERRAIN_REASON},
        'visibility': [
            {'site_id': row['site_id'], 'target': row['target'],
             'ideal_visible': [center_above_ideal_horizon(sample['elevation_deg']) for sample in row['samples']],
             'topographic_visible': None}
            for row in result['series']
        ],
    }
    return validate_visibility_window(dataset)


def transition_brackets(timestamps, flags):
    """Bracket sampled visibility changes. Never claim a continuous event time."""
    if len(timestamps) != len(flags) or len(timestamps) < 2:
        raise ValueError('Matching timestamps and at least two samples are required')
    dates = [datetime.fromisoformat(ts.replace('Z', '+00:00')) for ts in timestamps]
    if any(not isinstance(flag, bool) for flag in flags):
        raise ValueError('Visibility flags must be booleans')
    if any(date.tzinfo is None for date in dates) or any(b <= a for a, b in zip(dates, dates[1:])):
        raise ValueError('Times must be aware and strictly increasing')
    return [
        {'after_utc': timestamps[i-1], 'by_utc': timestamps[i],
         'from_visible': flags[i-1], 'to_visible': flags[i],
         'bracket_seconds': (dates[i]-dates[i-1]).total_seconds()}
        for i in range(1, len(flags)) if flags[i] != flags[i-1]
    ]
