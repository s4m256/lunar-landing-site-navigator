import copy,hashlib,json,math,shutil
from pathlib import Path
import numpy as np
import spiceypy as sp
from lunar_science.geometry import analyze,AnalysisError
R=Path('/tmp/lunar-spice-audit');repo=Path('/workspace/lunar-landing-site-navigator')
spec=json.loads((repo/'science/examples/kernel-set.json').read_text())
for item in spec[1:]:shutil.copyfile(Path('/tmp/lunar-engine-kernels')/item['filename'],R/'kernels'/item['filename'])
package=json.loads((R/'package-source.json').read_text())
spec[0]={'filename':'de421.bsp','url':package['url']+'#skyfield_data/data/de421.bsp','sha256':hashlib.sha256((R/'kernels/de421.bsp').read_bytes()).hexdigest()}
(R/'kernel-set-2026.json').write_text(json.dumps(spec,indent=2)+'\n')
request=json.loads((repo/'science/examples/request.json').read_text()); request.update(start_utc='2026-01-01T00:00:00Z',end_utc='2027-01-01T00:00:00Z',step_seconds=86400)
(R/'request-2026.json').write_text(json.dumps(request,indent=2)+'\n')
result=analyze(request,R/'kernels',spec);(R/'result-2026.json').write_text(json.dumps(result,indent=2)+'\n')
summary={'samples_per_series':[len(s['samples']) for s in result['series']], 'first_samples':[{'site':s['site_id'],'target':s['target'],**s['samples'][0]} for s in result['series']]}
try:
 for item in spec:sp.furnsh(str(R/'kernels'/item['filename']))
 summary['spk_coverage']={}
 for body in (3,10,301,399):
  w=sp.spkcov(str(R/'kernels/de421.bsp'),body)
  summary['spk_coverage'][str(body)]=[{'et':list(sp.wnfetd(w,i)),'utc':[sp.et2utc(t,'ISOC',3)+'Z' for t in sp.wnfetd(w,i)]} for i in range(sp.wncard(w))]
 h=sp.dafopr(str(R/'kernels/de421.bsp'));n,comments,done=sp.dafec(h,1000,1024);sp.dafcls(h);(R/'de421-comments.txt').write_text('\n'.join(comments[:n])+'\n')
 # A distinct algorithm: barycentric observer state, iterative Newtonian light time,
 # stellar aberration, direct dot products with analytic ENU in inertial space.
 errors=[]; correction_effects=[]
 for sample_date in ['2026-01-01T00:00:00','2026-06-01T00:00:00','2026-12-31T00:00:00']:
  et=sp.utc2et(sample_date)
  for site in request['sites']:
   lat,lon=map(math.radians,(site['latitude_deg'],site['longitude_east_deg']))
   up=np.array([math.cos(lat)*math.cos(lon),math.cos(lat)*math.sin(lon),math.sin(lat)])
   east=np.array([-math.sin(lon),math.cos(lon),0]);north=np.cross(up,east)
   pos=up*1737.4
   moon=sp.spkssb(301,et,'J2000');surface=sp.sxform('IAU_MOON','J2000',et)@np.r_[pos,[0,0,0]]
   observer=moon+surface
   for body,target in [(10,'SUN'),(399,'EARTH')]:
    lt=0
    for _ in range(20):
     direction=sp.spkssb(body,et-lt,'J2000')[:3]-observer[:3]
     new=np.linalg.norm(direction)/sp.clight()
     if abs(new-lt)<1e-12:break
     lt=new
    apparent=sp.stelab(direction,observer[3:]);rot=sp.pxform('IAU_MOON','J2000',et)
    e,n,u=[np.dot(apparent,rot@v) for v in (east,north,up)]
    az=math.degrees(math.atan2(e,n))%360;el=math.degrees(math.atan2(u,math.hypot(e,n)))
    state,_=sp.spkcpo(target,et,'IAU_MOON','OBSERVER','CN+S',pos,'MOON','IAU_MOON')
    pe,pn,pu=[np.dot(state[:3],v) for v in (east,north,up)]
    az2=math.degrees(math.atan2(pe,pn))%360;el2=math.degrees(math.atan2(pu,math.hypot(pe,pn)))
    errors.append({'date':sample_date,'site':site['id'],'target':target,'az_diff_deg':(az-az2+180)%360-180,'el_diff_deg':el-el2})
    variants={}
    for corr in ['NONE','LT','CN','CN+S']:
     v,_=sp.spkcpo(target,et,'IAU_MOON','OBSERVER',corr,pos,'MOON','IAU_MOON')
     a,b,c=[np.dot(v[:3],x) for x in (east,north,up)]
     variants[corr]=[math.degrees(math.atan2(a,b))%360,math.degrees(math.atan2(c,math.hypot(a,b)))]
    correction_effects.append({'date':sample_date,'site':site['id'],'target':target,'az_el_deg':variants})
 summary['barycentric_algorithm_residuals']=errors;summary['correction_effects']=correction_effects
 summary['utc_spacing_across_2016_leap_seconds']=sp.utc2et('2017-01-01T00:00:00')-sp.utc2et('2016-12-31T23:59:59')
 summary['sphere_horizon_dip_deg']={str(h):-math.degrees(math.acos(1737400/(1737400+h))) for h in [0,1,1000,10000]}
finally:sp.kclear()
# Adversarial: sample-instant versus continuous interval coverage, duplicate result IDs.
from lunar_science.geometry import validate
bad=copy.deepcopy(result);bad['series']=[bad['series'][0]]*4
try:validate(bad,'analysis-result');summary['duplicate_series_pass_schema']=True
except AnalysisError:summary['duplicate_series_pass_schema']=False
(R/'experiment-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({k:v for k,v in summary.items() if k not in ['correction_effects','barycentric_algorithm_residuals']},indent=2))
print('Max independent-algorithm az residual',max(abs(r['az_diff_deg']) for r in errors))
print('Max independent-algorithm el residual',max(abs(r['el_diff_deg']) for r in errors))
