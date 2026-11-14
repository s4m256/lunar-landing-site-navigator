"""Fetch and retain Horizons references, report residuals without an invented pass tolerance."""
import argparse
import csv
from datetime import datetime
import io
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

parser=argparse.ArgumentParser()
parser.add_argument('--result',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
result=json.loads(args.result.read_text())
report={'status':'pending','comparisons':[], 'notes':[
    'Horizons orientation/DE version and spherical observer model must be checked in retained headers.',
    'Residuals compare different ephemeris/orientation configurations; no physical tolerance assumed.',
    'Observer coordinate altitude is km above the lunar reference surface; verify Horizons radius in header.']}
try:
    for series in result['series']:
        site=next(s for s in result['request']['sites'] if s['id']==series['site_id'])
        times='\n'.join(s['utc'].removesuffix('Z') for s in series['samples'])
        params={'format':'json','COMMAND':"'10'" if series['target']=='SUN' else "'399'",
                'CENTER':"'coord@301'",'COORD_TYPE':"'GEODETIC'",
                'SITE_COORD':f"'{site['longitude_east_deg']},{site['latitude_deg']},{site['height_m']/1000}'",
                'EPHEM_TYPE':"'OBSERVER'",'MAKE_EPHEM':"'YES'",'TLIST':"'"+times+"'",
                'QUANTITIES':"'4'",'CSV_FORMAT':"'YES'",'APPARENT':"'AIRLESS'",'EXTRA_PREC':"'YES'", 'TIME_DIGITS':"'FRACSEC'"}
        url='https://ssd.jpl.nasa.gov/api/horizons.api?'+urlencode(params)
        raw=json.loads(urlopen(url,timeout=60).read())
        entry={'site_id':series['site_id'],'target':series['target'],'url':url,'response':raw}
        report['comparisons'].append(entry)
        if 'error' in raw: raise ValueError(raw['error'])
        table=raw['result'].split('$$SOE')[1].split('$$EOE')[0]
        rows=[row for row in csv.reader(io.StringIO(table)) if row and row[0].strip()]
        residuals=[]
        for sample,row in zip(series['samples'],rows,strict=True):
            # Quantity 4 alone: date, flags, azimuth, elevation, trailing empty CSV column.
            fields=[x.strip() for x in row if x.strip()]
            reference_time = datetime.strptime(row[0].strip(), '%Y-%b-%d %H:%M:%S.%f')
            expected_time = datetime.fromisoformat(sample['utc'].removesuffix('Z'))
            if reference_time != expected_time: raise ValueError('Horizons time differs from requested sample')
            az,el=map(float,fields[-2:])
            residuals.append({'utc':sample['utc'],'azimuth_difference_deg':(sample['azimuth_deg']-az+180)%360-180,
                              'elevation_difference_deg':sample['elevation_deg']-el})
        entry['residuals']=residuals
    report['status']='computed_requires_header_review'
except (OSError,ValueError,KeyError,IndexError) as exc:
    report['status']='blocked_or_invalid_reference'
    report['error']=str(exc)
finally:
    args.output.write_text(json.dumps(report,indent=2)+'\n')
if report['status']=='blocked_or_invalid_reference': raise SystemExit(2)
