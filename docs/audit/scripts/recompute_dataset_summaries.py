"""Recompute solar/comms/score summaries with the repo's own functions, feeding an independent
DE421 ephemeris and the DEM-derived inputs taken from the committed dataset (horizon, elevation, slope, PSR)."""
import sys, json, math
import numpy as np
sys.path.insert(0, sys.argv[1] + '/science/src')
import independent_ephemeris_check as ck
from lunar_science.navigator.ephemeris import TopocentricEphemerisSeries, cartesian_me_to_enu_az_el, build_utc_grid
from lunar_science.navigator.comms import analyze_site_comms
from lunar_science.navigator.solar import analyze_site_solar
from lunar_science.navigator.scoring import compute_composite_landing_score
from lunar_science.navigator.dem_horizon import selenographic_to_cartesian_me
from lunar_science.navigator.data_sources import SOLAR_RADIUS_KM, EARTH_RADIUS_KM, AU_IN_KM
d = json.load(open(sys.argv[1] + '/outputs/datasets/south_pole_precomputed.v1.json'))
ts = d['mission_window']['timestamps_utc']
def base(tlist):
    n = len(tlist); sun = np.empty((n, 3)); earth = np.empty((n, 3)); M = np.empty((n, 3, 3)); et = np.empty(n)
    for i, t in enumerate(tlist):
        jd = ck.jd_tdb(t); m = ck.icrf2me(jd); M[i] = m
        sun[i] = m @ ck.apparent(10, jd); earth[i] = m @ ck.apparent(399, jd); et[i] = (jd - 2451545.0) * 86400.0
    return dict(sun=sun, earth=earth, M=M, et=et, ts=tlist)
def series(b, me_m, lat, lon):
    s = np.asarray(me_m) / 1000.0
    sa, se, sr = cartesian_me_to_enu_az_el(b['sun'] - s, lat, lon); ea, ee, er = cartesian_me_to_enu_az_el(b['earth'] - s, lat, lon)
    return TopocentricEphemerisSeries(b['ts'], b['et'], sa, se, sr, sr / AU_IN_KM, np.degrees(np.arcsin(SOLAR_RADIUS_KM / sr)),
        ea, ee, er, np.degrees(np.arcsin(EARTH_RADIUS_KM / er)), b['earth'], b['M'], np.zeros(len(sa)), np.zeros(len(sa)))
B = base(ts); HR = base(build_utc_grid(ts[0], ts[-1], 5 / 60))
hr = dict(et_seconds=HR['et'], earth_pos_me_km=HR['earth'], j2000_to_moon_me=HR['M'])
az = np.asarray(d['horizon_azimuths_deg'])
worst = {}
def cmp(tag, got, exp):
    for k, v in exp.items():
        dv = abs(float(got[k]) - float(v)); 
        if dv > worst.get((tag, k), (0,))[0]: worst[(tag, k)] = (dv, float(got[k]), float(v))
def run(lat, lon, elev, slope, psr_d, is_psr, hz, hr_arg):
    me = selenographic_to_cartesian_me(lat, lon, elev); s = series(B, me, lat, lon)
    com = analyze_site_comms(s, me, lat, lon, az, hz, 3600, high_res_lro=hr_arg)
    sol = analyze_site_solar(s.sun_az_deg, s.sun_el_deg, s.sun_dist_au, s.sun_angular_radius_deg, az, hz, 3600)
    sc = compute_composite_landing_score(slope, sol['summary']['mean_illum_fraction'], sol['summary']['max_continuous_shadow_hours'],
        com['summary']['dte_full_disk_duty_cycle_pct'], com['summary']['combined_dte_elfo_duty_cycle_pct'], psr_d, is_psr)
    return sol, com, sc
nodes_checked = 0
for site in d['sites']:
    c = site['center']; es = site['engineering_summary']
    sol, com, sc = run(c['latitude_deg'], c['longitude_east_deg'], c['elevation_m'], c['slope_deg'], c['psr_distance_m'], c['is_psr'], np.asarray(site['horizon_elev_deg']), hr)
    cmp('solar', sol['summary'], es['solar']); cmp('comms', com['summary'], es['comms']); cmp('score', sc, es['score'])
    k = site['sky_series']
    for name in ('elfo_primary_az_deg', 'elfo_primary_el_deg', 'elfo_primary_alt_km', 'elfo_primary_range_km', 'elfo_constellation_best_fspl_db'):
        a = np.asarray(com['series'][name]); b = np.asarray(k[name]); dd = np.abs(a - b)
        if 'az' in name: dd = np.abs((a - b + 180) % 360 - 180) * np.cos(np.radians(np.asarray(k['elfo_primary_el_deg'])))
        cmp('series', {name: dd.max()}, {name: 0.0})
    for name in ('elfo_primary_earth_los', 'elfo_constellation_visible', 'lro_visible'):
        cmp('series_bool_mismatch_count', {name: int(np.sum(np.asarray(com['series'][name]) != np.asarray(k[name])))}, {name: 0})
    for n in site['local_grid']['nodes']:
        sol, com, sc = run(n['latitude_deg'], n['longitude_east_deg'], n['elevation_m'], n['slope_deg'], n['psr_distance_m'], n['is_psr'], np.asarray(n['horizon_elev_deg']), None)
        cmp('node', {'mean_illum_fraction': sol['summary']['mean_illum_fraction'], 'max_continuous_shadow_hours': sol['summary']['max_continuous_shadow_hours'],
            'energy_tracking_wh_m2': sol['summary']['energy_tracking_wh_m2'], 'dte_full_disk_duty_cycle_pct': com['summary']['dte_full_disk_duty_cycle_pct'],
            'combined_dte_elfo_duty_cycle_pct': com['summary']['combined_dte_elfo_duty_cycle_pct'], 'max_blackout_combined_hours': com['summary']['max_blackout_combined_hours'],
            'landing_score_0_100': sc['total_0_100']}, {q: n[q] for q in ('mean_illum_fraction', 'max_continuous_shadow_hours', 'energy_tracking_wh_m2',
            'dte_full_disk_duty_cycle_pct', 'combined_dte_elfo_duty_cycle_pct', 'max_blackout_combined_hours', 'landing_score_0_100')})
        nodes_checked += 1
print('sites', len(d['sites']), 'nodes', nodes_checked)
for (tag, k), (dv, g, e) in sorted(worst.items()): print('%-28s %-34s max|diff|=%.4g (recomputed %.6g vs committed %.6g)' % (tag, k, dv, g, e))
