"""Topocentric apparent center directions over a spherical lunar reference."""
import hashlib
import json
import math
from datetime import datetime, timedelta
from importlib.metadata import version
from importlib.resources import files
from pathlib import Path

import jsonschema
import numpy as np
import spiceypy as spice
from spiceypy.utils.exceptions import SpiceyError


class AnalysisError(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def validate(value, name):
    schema = json.loads(files('lunar_science').joinpath(f'schemas/{name}.v1.schema.json').read_text())
    try:
        jsonschema.Draft7Validator(schema).validate(value)
    except jsonschema.ValidationError as exc:
        raise AnalysisError('INVALID_INPUT', f'{list(exc.path)}: {exc.message}') from exc


def local_basis(latitude_deg, longitude_deg):
    lat, lon = np.radians([latitude_deg, longitude_deg])
    return np.array([[-np.sin(lon), np.cos(lon), 0],
                     [-np.sin(lat)*np.cos(lon), -np.sin(lat)*np.sin(lon), np.cos(lat)],
                     [np.cos(lat)*np.cos(lon), np.cos(lat)*np.sin(lon), np.sin(lat)]])


def project(vector, basis):
    east, north, up = basis @ np.asarray(vector)
    horizontal = math.hypot(east, north)
    if np.linalg.norm(vector) == 0:
        raise AnalysisError('INVALID_VECTOR', 'Zero direction vector')
    # At zenith/nadir azimuth is undefined, represented by the documented 0 convention.
    az = math.degrees(math.atan2(east, north)) % 360 if horizontal > 1e-14*np.linalg.norm(vector) else 0.0
    return az, math.degrees(math.atan2(up, horizontal))


def load_kernels(directory, spec):
    rows = []
    for item in spec:
        name = item['filename']
        if Path(name).name != name:
            raise AnalysisError('INVALID_KERNEL_SET', 'Kernel filename must be a basename')
        path = Path(directory) / name
        if not path.is_file():
            raise AnalysisError('MISSING_KERNEL', f'Missing {name}; run fetch-kernels')
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != item['sha256']:
            raise AnalysisError('KERNEL_CHECKSUM', f'Checksum mismatch: {name}')
        kind = spice.getfat(str(path))[1]
        coverage = {}
        if kind == 'SPK':
            for body in spice.spkobj(str(path)):
                window = spice.spkcov(str(path), int(body))
                coverage[str(int(body))] = [list(spice.wnfetd(window, n)) for n in range(spice.wncard(window))]
        spice.furnsh(str(path))
        rows.append({'filename': name, 'url': item['url'], 'sha256': digest,
                     'type': kind, 'coverage_et': coverage})
    return rows


def analyze(request, directory, spec):
    # CSPICE has process-global kernel state. This batch API owns it, and is not thread safe.
    validate(request, 'analysis-request')
    if len({s['id'] for s in request['sites']}) != 2:
        raise AnalysisError('INVALID_INPUT', 'Site IDs must be distinct')
    for field in ('start_utc', 'end_utc'):
        try:
            datetime.fromisoformat(request[field].replace('Z', '+00:00'))
        except ValueError as exc:
            raise AnalysisError('INVALID_INPUT', f'{field}: invalid calendar date (leap-second literals unsupported)') from exc
    for site in request['sites']:
        if site['longitude_east_deg'] == 360:
            raise AnalysisError('INVALID_INPUT', 'Use longitude in [0, 360)')
        if not all(math.isfinite(site[f]) for f in ('latitude_deg', 'longitude_east_deg', 'height_m')):
            raise AnalysisError('INVALID_INPUT', 'Coordinates must be finite')
    spice.kclear()
    try:
        kernels = load_kernels(directory, spec)
        start, end = (spice.utc2et(request[f]) for f in ('start_utc', 'end_utc'))
        if end <= start:
            raise AnalysisError('INVALID_INPUT', 'end_utc must be later than start_utc')
        start_dt = datetime.fromisoformat(request['start_utc'].replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(request['end_utc'].replace('Z', '+00:00'))
        count = math.ceil((end_dt-start_dt).total_seconds()/request['step_seconds'])
        if count > 100000:
            raise AnalysisError('SAMPLE_LIMIT', 'Maximum 100000 instants per site/target')
        epochs = [spice.utc2et((start_dt+timedelta(seconds=i*request['step_seconds'])).isoformat(timespec='milliseconds').replace('+00:00', 'Z')) for i in range(count)]
        # Probe both requested boundaries as well as every returned sample. SPICE resolves
        # the complete barycentric chain and retarded epochs, not just a nominal SPK window.
        series = []
        for site in request['sites']:
            basis = local_basis(site['latitude_deg'], site['longitude_east_deg'])
            observer = basis[2] * ((request['surface_radius_m']+site['height_m'])/1000)
            for target in ('SUN', 'EARTH'):
                samples = []
                for et in [*epochs, end]:
                    state, _ = spice.spkcpo(target, et, 'IAU_MOON', 'OBSERVER', 'CN+S', observer, 'MOON', 'IAU_MOON')
                    azimuth, elevation = project(state[:3], basis)
                    if et < end:
                        samples.append({'utc': spice.et2utc(et, 'ISOC', 3)+'Z',
                                        'azimuth_deg': azimuth, 'elevation_deg': elevation})
                series.append({'site_id': site['id'], 'target': target, 'samples': samples})
        provenance = {'schema_version': '1.0.0', 'engine_version': version('lunar-science'),
                      'spiceypy_version': spice.__version__, 'numpy_version': np.__version__,
                      'cspice_version': spice.tkvrsn('TOOLKIT'), 'frame': 'IAU_MOON',
                      'correction': 'CN+S', 'frame_epoch': 'OBSERVER',
                      'time_scale': 'UTC input/output; TDB seconds past J2000 internally',
                      'surface_radius_m': request['surface_radius_m'], 'horizon_elevation_deg': 0,
                      'azimuth_convention': 'north=0, east=90; undefined at zenith/nadir or geographic pole uses supplied longitude meridian and azimuth 0 for vertical rays',
                      'kernels': kernels, 'horizons_validation': 'not_performed_in_engine',
                      'limitations': ['Spherical reference, planetocentric latitude, east longitude [0,360).',
                                      'IAU_MOON analytic PCK orientation, not high-accuracy lunar PA/ME orientation.',
                                      'No topography, refraction, disk extent, eclipses, power or communication guarantee.',
                                      'Flat tangent horizon remains zero at nonzero observer height; no spherical horizon dip.',
                                      'Half-open [start,end); steps follow UTC calendar labels (SI spacing changes across leap seconds); millisecond formatting is not an accuracy claim.',
                                      'Kernel temporal coverage is restricted; no extrapolation is performed.',
                                      'Independent comparison is external to this engine; no physical accuracy certified.']}
        result = {'schema_version': '1.0.0', 'request': request, 'series': series, 'provenance': provenance}
        validate(result, 'analysis-result')
        return result
    except SpiceyError as exc:
        code = 'COVERAGE_ERROR' if any(x in exc.short for x in ('SPKINSUFFDATA', 'NOLEAPSECONDS', 'PCKINSUFFDATA')) else 'SPICE_ERROR'
        raise AnalysisError(code, exc.short + ': ' + exc.long) from exc
    finally:
        spice.kclear()
