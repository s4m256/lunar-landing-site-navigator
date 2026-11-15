"""Independent recomputation of topocentric Sun/Earth az/el (no SPICE toolkit, no NAIF download).
Positions: DE421 SPK from PyPI skyfield-data; orientation: DE421 libration angles from PyPI de421;
PA->ME constant rotation per Williams et al. 2008 (DE421): R1(-0.30")R2(-78.56")R3(-67.92")."""
import json, sys, math, os, datetime as dt
import numpy as np
from jplephem import Ephemeris
from jplephem.spk import SPK
import de421, skyfield_data
C=299792.458; R=1737.4; AS=math.pi/180/3600
eph=Ephemeris(de421)
k=SPK.open(os.path.join(os.path.dirname(skyfield_data.__file__),'data','de421.bsp'))
def R1(a):c,s=math.cos(a),math.sin(a);return np.array([[1,0,0],[0,c,s],[0,-s,c]])
def R2(a):c,s=math.cos(a),math.sin(a);return np.array([[c,0,-s],[0,1,0],[s,0,c]])
def R3(a):c,s=math.cos(a),math.sin(a);return np.array([[c,s,0],[-s,c,0],[0,0,1]])
PA2ME=R1(-0.30*AS)@R2(-78.56*AS)@R3(-67.92*AS)
def jd_tdb(ts):
    t=dt.datetime.strptime(ts,'%Y-%m-%dT%H:%M:%SZ')
    return 2451545.0+((t-dt.datetime(2000,1,1,12)).total_seconds()+69.184)/86400.0
def pos(code,jd):
    if code==10: return k[0,10].compute(jd)
    emb=k[0,3].compute(jd)
    return emb+k[3,code].compute(jd)
def moon_state(jd):
    p0,v0=k[0,3].compute_and_differentiate(jd); p1,v1=k[3,301].compute_and_differentiate(jd)
    return p0+p1,(v0+v1)/86400.0
def apparent(code,jd):
    pm,vm=moon_state(jd); lt=0.0
    for _ in range(3):
        d=pos(code,jd-lt/86400.0)-pm; lt=np.linalg.norm(d)/C
    u=d/np.linalg.norm(d); b=vm/C
    u2=u+b-u*np.dot(u,b); u2/=np.linalg.norm(u2)
    return u2*np.linalg.norm(d)
def icrf2me(jd):
    phi,theta,psi=np.ravel(eph.position('librations',jd))
    return PA2ME@R3(psi)@R1(theta)@R3(phi)
def azel(v_me,lat,lon,elev_m):
    la,lo=math.radians(lat),math.radians(lon); r=R+elev_m/1000
    site=r*np.array([math.cos(la)*math.cos(lo),math.cos(la)*math.sin(lo),math.sin(la)])
    d=v_me-site
    e=np.array([-math.sin(lo),math.cos(lo),0]); n=np.array([-math.sin(la)*math.cos(lo),-math.sin(la)*math.sin(lo),math.cos(la)]); u=site/r
    return math.degrees(math.atan2(d@e,d@n))%360, math.degrees(math.asin(d@u/np.linalg.norm(d)))
def topo(ts,lat,lon,elev):
    jd=jd_tdb(ts); M=icrf2me(jd)
    return azel(M@apparent(10,jd),lat,lon,elev), azel(M@apparent(399,jd),lat,lon,elev)
def sep(a1,e1,a2,e2):
    a1,e1,a2,e2=map(math.radians,(a1,e1,a2,e2))
    return math.degrees(math.acos(max(-1,min(1,math.sin(e1)*math.sin(e2)+math.cos(e1)*math.cos(e2)*math.cos(a1-a2)))))
if __name__=='__main__':
    root=sys.argv[1]
    h=json.load(open(root+'/outputs/validation/horizons_cross_validation.json'))
    lat,lon,el=h['latitude_deg'],h['longitude_east_deg'],h['elevation_m']
    print('ARTIFACT: independent vs spice_* and vs horizons_* (angular sep, deg)')
    for key,i in (('sun_comparisons',0),('earth_comparisons',1)):
        ms=mh=0
        for r in h[key]:
            a,e=topo(r['timestamp_utc'],lat,lon,el)[i]
            s1=sep(a,e,r['spice_az_deg'],r['spice_el_deg']); s2=sep(a,e,r['horizons_az_deg'],r['horizons_el_deg'])
            ms=max(ms,s1); mh=max(mh,s2)
            print(key[:5],r['timestamp_utc'],'indep az/el %.5f %.5f'%(a,e),'sep_spice %.1e sep_horizons %.1e'%(s1,s2))
        print(key,'max sep vs spice %.2e, vs horizons %.2e'%(ms,mh))
    d=json.load(open(root+'/outputs/datasets/south_pole_precomputed.v1.json'))
    ts=d['mission_window']['timestamps_utc']
    print('DATASET: all sites, every 6th hourly sample; max |diff| (deg) of az*cos(el) and el vs sky_series (rounded 3 decimals)')
    for s in d['sites']:
        c=s['center']; m=[0,0,0,0]
        for i in range(0,len(ts),6):
            (sa,se),(ea,ee)=topo(ts[i],c['latitude_deg'],c['longitude_east_deg'],c['elevation_m'])
            k_=s['sky_series']
            m[0]=max(m[0],abs((sa-k_['sun_az_deg'][i]+180)%360-180)*math.cos(math.radians(se))); m[1]=max(m[1],abs(se-k_['sun_el_deg'][i]))
            m[2]=max(m[2],abs((ea-k_['earth_az_deg'][i]+180)%360-180)*math.cos(math.radians(ee))); m[3]=max(m[3],abs(ee-k_['earth_el_deg'][i]))
        print('%-22s sun az %.4f el %.4f | earth az %.4f el %.4f'%(s['id'],*m))
