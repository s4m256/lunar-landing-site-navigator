import json
from pathlib import Path
import spiceypy as sp
from lunar_science.geometry import analyze
R=Path('/tmp/lunar-spice-audit');repo=Path('/workspace/lunar-landing-site-navigator')
request=json.loads((repo/'science/examples/request.json').read_text());spec=json.loads((R/'kernel-set-2026.json').read_text());historical=json.loads((repo/'science/examples/kernel-set.json').read_text())
a=analyze(request,'/tmp/lunar-engine-kernels',historical);b=analyze(request,R/'kernels',spec)
rows=[]
for sa,sb in zip(a['series'],b['series']):
 for x,y in zip(sa['samples'],sb['samples']):
  rows.append({'site':sa['site_id'],'target':sa['target'],'utc':x['utc'],'DE405_minus_DE421_az_deg':(x['azimuth_deg']-y['azimuth_deg']+180)%360-180,'DE405_minus_DE421_el_deg':x['elevation_deg']-y['elevation_deg']})
(R/'ephemeris-sensitivity.json').write_text(json.dumps(rows,indent=2)+'\n')
for item in spec:sp.furnsh(str(R/'kernels'/item['filename']))
try:
 et=sp.utc2et('2026-01-01T00:00:00Z');segments=[]
 for body in (3,10,301,399):
  handle,descriptor,identifier=sp.spksfs(body,et,81)
  unpack=sp.spkuds(descriptor)
  segments.append({'requested_body':body,'segment_id':identifier,'descriptor_body_center_frame_type_start_end_begin_end':list(unpack)})
 (R/'segments-2026.json').write_text(json.dumps(segments,indent=2)+'\n')
finally:sp.kclear()
print('Max abs DE405-DE421 az deg:',max(abs(r['DE405_minus_DE421_az_deg']) for r in rows))
print('Max abs DE405-DE421 el deg:',max(abs(r['DE405_minus_DE421_el_deg']) for r in rows))
