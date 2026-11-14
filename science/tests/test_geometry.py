"""Synthetic geometry unit tests; real kernel integration is explicitly enabled."""
import copy
import json
import os
from pathlib import Path

import numpy as np
import pytest
from lunar_science.geometry import AnalysisError, analyze, local_basis, project, validate

ROOT = Path(__file__).resolve().parents[2]
REQUEST = json.loads((ROOT/'science/examples/request.json').read_text())
SPEC = json.loads((ROOT/'science/examples/kernel-set.json').read_text())


@pytest.mark.parametrize('lat,lon', [(0,0),(-89.5,90),(-90,270),(45,180)])
def test_basis_orthonormal_right_handed(lat, lon):
    b = local_basis(lat, lon)
    np.testing.assert_allclose(b @ b.T, np.eye(3), atol=1e-15)
    np.testing.assert_allclose(np.cross(b[0], b[1]), b[2], atol=1e-15)


@pytest.mark.parametrize('vector,expected', [([1,0,0],(0,90)),([0,1,0],(90,0)),([0,0,1],(0,0)),([0,-1,0],(270,0))])
def test_equatorial_projection_and_east_positive_longitude(vector, expected):
    assert project(vector, local_basis(0,0)) == pytest.approx(expected)
    np.testing.assert_allclose(local_basis(0,90)[2], [0,1,0], atol=1e-15)


@pytest.mark.parametrize('field,value', [('step_seconds',0),('start_utc','2007-02-30T00:00:00Z'),('start_utc','2007-01-01'),('frame','MOON_ME')])
def test_invalid_input_before_kernel_access(field,value):
    r=copy.deepcopy(REQUEST);r[field]=value
    with pytest.raises(AnalysisError, match='') as exc: analyze(r,'/absent',SPEC)
    assert exc.value.code == 'INVALID_INPUT'


def test_missing_kernel():
    with pytest.raises(AnalysisError) as exc: analyze(REQUEST,'/absent',SPEC)
    assert exc.value.code=='MISSING_KERNEL'


def test_packaged_schemas_match_contracts():
    for name in ('analysis-request','analysis-result','scientific-provenance'):
        filename=name+'.v1.schema.json'
        assert (ROOT/'contracts'/filename).read_bytes()==(ROOT/'science/src/lunar_science/schemas'/filename).read_bytes()


def kernel_dir():
    value=os.environ.get('LUNAR_KERNEL_DIR')
    if not value: pytest.skip('Set LUNAR_KERNEL_DIR after checksum-verified fetch for real SPICE integration')
    return value


def test_real_ephemeris_schema_time_and_km_units():
    result=analyze(REQUEST,kernel_dir(),SPEC)
    validate(result,'analysis-result');validate(result['provenance'],'scientific-provenance')
    assert len(result['series'])==4
    assert all(len(s['samples'])==3 for s in result['series'])
    assert result['series'][0]['samples'][0]['utc']=='2007-01-01T00:00:00.000Z'
    # Independent CSPICE topocentric site frame path (SPKPOS in J2000 then PXFORM at observer epoch).
    import spiceypy as sp
    try:
        for item in SPEC: sp.furnsh(str(Path(kernel_dir())/item['filename']))
        et=sp.utc2et(REQUEST['start_utc']); site=REQUEST['sites'][0]
        b=local_basis(site['latitude_deg'],site['longitude_east_deg'])
        obs=b[2]*1737.4
        direct,_=sp.spkcpo('SUN',et,'J2000','OBSERVER','CN+S',obs,'MOON','IAU_MOON')
        xyz=sp.pxform('J2000','IAU_MOON',et) @ direct[:3]
        az,el=project(xyz,b);sample=result['series'][0]['samples'][0]
        # Floating point path equivalence only, not a physical accuracy claim.
        assert abs(az-sample['azimuth_deg'])<1e-10
        assert abs(el-sample['elevation_deg'])<1e-10
    finally: sp.kclear()


@pytest.mark.parametrize('change,code', [({'end_utc':'2006-01-01T00:00:00Z'},'INVALID_INPUT'),({'start_utc':'2026-01-01T00:00:00Z','end_utc':'2026-01-02T00:00:00Z'},'COVERAGE_ERROR')])
def test_time_bounds_and_missing_spk_coverage(change,code):
    with pytest.raises(AnalysisError) as exc: analyze(REQUEST|change,kernel_dir(),SPEC)
    assert exc.value.code==code


def test_nonzero_height_changes_real_topocentric_result():
    directory=kernel_dir(); r=copy.deepcopy(REQUEST)
    base=analyze(r,directory,SPEC)
    r['sites'][0]['height_m']=1000
    higher=analyze(r,directory,SPEC)
    assert base['series'][1]['samples'][0]['elevation_deg'] != higher['series'][1]['samples'][0]['elevation_deg']


def test_corrupt_kernel_is_rejected(tmp_path):
    (tmp_path/SPEC[0]['filename']).write_bytes(b'not a real kernel')
    with pytest.raises(AnalysisError) as exc: analyze(REQUEST,tmp_path,SPEC)
    assert exc.value.code=='KERNEL_CHECKSUM'


@pytest.mark.parametrize('field,value', [('longitude_east_deg',360),('longitude_east_deg',-1),('latitude_deg',91),('height_m',float('nan'))])
def test_invalid_coordinate(field,value):
    r=copy.deepcopy(REQUEST);r['sites'][0][field]=value
    with pytest.raises(AnalysisError) as exc: analyze(r,'/absent',SPEC)
    assert exc.value.code=='INVALID_INPUT'


def test_distinct_ids_required():
    r=copy.deepcopy(REQUEST);r['sites'][1]['id']=r['sites'][0]['id']
    with pytest.raises(AnalysisError) as exc: analyze(r,'/absent',SPEC)
    assert exc.value.code=='INVALID_INPUT'


def test_zero_vector_rejected():
    with pytest.raises(AnalysisError): project([0,0,0],local_basis(0,0))


def test_cli_invalid_input_exit_and_preserves_existing_output(tmp_path):
    import subprocess,sys
    bad=tmp_path/'request.json';bad.write_text('{}')
    output=tmp_path/'result.json';output.write_text('previous result')
    run=subprocess.run([sys.executable,'-m','lunar_science','analyze','--request',str(bad),
        '--kernel-set',str(ROOT/'science/examples/kernel-set.json'),'--kernel-dir','/absent',
        '--output',str(output)],capture_output=True,text=True)
    assert run.returncode==2
    assert json.loads(run.stderr)['error']['code']=='INVALID_INPUT'
    assert output.read_text()=='previous result'
