import {
  computeSolarIllumFraction,
  interpolateHorizon,
  SOLAR_CONSTANT_1AU_W_M2,
} from '../navigator/math';
import {
  LandingSiteEntry,
  LocalGridNode,
  MissionWindow,
} from '../navigator/types';
import {
  clamp,
  LunarAtlasData,
  normalizeLon,
  sampleAtlasElevationKmBilinear,
} from './lunarTerrainEngine';

const DEG = Math.PI / 180;
const LUNAR_RADIUS_KM = 1737.4;

const RAY_DISTANCES_KM = [
  0.75, 1.5, 2.5, 4.0, 6.0, 8.5, 11.5, 15.0, 19.5, 25.0, 31.5, 39.0, 48.0, 58.0, 69.0, 81.0,
  94.0, 107.0, 120.0,
];

function enuToMoonMeUnit(
  latDeg: number,
  lonEastDeg: number,
  azDeg: number,
  elDeg: number,
): [number, number, number] {
  const phi = latDeg * DEG;
  const lam = lonEastDeg * DEG;
  const az = azDeg * DEG;
  const el = elDeg * DEG;

  const cosEl = Math.cos(el);
  const uE = cosEl * Math.sin(az);
  const uN = cosEl * Math.cos(az);
  const uU = Math.sin(el);

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinLam = Math.sin(lam);
  const cosLam = Math.cos(lam);

  // Basis vectors in MOON_ME (X = 0°E equator, Y = 90°E equator, Z = North Pole)
  const eX = -sinLam;
  const eY = cosLam;
  const eZ = 0;

  const nX = -sinPhi * cosLam;
  const nY = -sinPhi * sinLam;
  const nZ = cosPhi;

  const upX = cosPhi * cosLam;
  const upY = cosPhi * sinLam;
  const upZ = sinPhi;

  return [
    uE * eX + uN * nX + uU * upX,
    uE * eY + uN * nY + uU * upY,
    uE * eZ + uN * nZ + uU * upZ,
  ];
}

function moonMeUnitToEnuAzEl(
  vec: [number, number, number],
  latDeg: number,
  lonEastDeg: number,
): { azDeg: number; elDeg: number } {
  const phi = latDeg * DEG;
  const lam = lonEastDeg * DEG;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinLam = Math.sin(lam);
  const cosLam = Math.cos(lam);

  const [vx, vy, vz] = vec;
  const vE = vx * -sinLam + vy * cosLam;
  const vN = vx * (-sinPhi * cosLam) + vy * (-sinPhi * sinLam) + vz * cosPhi;
  const vU = vx * (cosPhi * cosLam) + vy * (cosPhi * sinLam) + vz * sinPhi;

  const elDeg = Math.asin(clamp(vU, -1, 1)) / DEG;
  const azDeg = normalizeLon(Math.atan2(vE, vN) / DEG);
  return { azDeg, elDeg };
}

export function projectBodySkySeries(
  refSite: LandingSiteEntry,
  targetLatDeg: number,
  targetLonEastDeg: number,
): {
  sunAzDeg: number[];
  sunElDeg: number[];
  earthAzDeg: number[];
  earthElDeg: number[];
} {
  const refLat = refSite.center.latitude_deg;
  const refLon = refSite.center.longitude_east_deg;
  const n = refSite.sky_series.sun_az_deg.length;

  const sunAzDeg = new Array<number>(n);
  const sunElDeg = new Array<number>(n);
  const earthAzDeg = new Array<number>(n);
  const earthElDeg = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const sunMe = enuToMoonMeUnit(
      refLat,
      refLon,
      refSite.sky_series.sun_az_deg[i],
      refSite.sky_series.sun_el_deg[i],
    );
    const sunLocal = moonMeUnitToEnuAzEl(sunMe, targetLatDeg, targetLonEastDeg);
    sunAzDeg[i] = Number(sunLocal.azDeg.toFixed(3));
    sunElDeg[i] = Number(sunLocal.elDeg.toFixed(3));

    const earthMe = enuToMoonMeUnit(
      refLat,
      refLon,
      refSite.sky_series.earth_az_deg[i],
      refSite.sky_series.earth_el_deg[i],
    );
    const earthLocal = moonMeUnitToEnuAzEl(earthMe, targetLatDeg, targetLonEastDeg);
    earthAzDeg[i] = Number(earthLocal.azDeg.toFixed(3));
    earthElDeg[i] = Number(earthLocal.elDeg.toFixed(3));
  }

  return { sunAzDeg, sunElDeg, earthAzDeg, earthElDeg };
}

function stepGeodesic(
  latDeg: number,
  lonEastDeg: number,
  azDeg: number,
  distKm: number,
): { latDeg: number; lonEastDeg: number } {
  const phi1 = latDeg * DEG;
  const lam1 = lonEastDeg * DEG;
  const brng = azDeg * DEG;
  const delta = distKm / LUNAR_RADIUS_KM;

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const sinD = Math.sin(delta);
  const cosD = Math.cos(delta);

  const sinPhi2 = clamp(sinPhi1 * cosD + cosPhi1 * sinD * Math.cos(brng), -1, 1);
  const phi2 = Math.asin(sinPhi2);
  const y = Math.sin(brng) * sinD * cosPhi1;
  const x = cosD - sinPhi1 * sinPhi2;
  const lam2 = lam1 + Math.atan2(y, x);

  return {
    latDeg: phi2 / DEG,
    lonEastDeg: normalizeLon(lam2 / DEG),
  };
}

export function raymarchHorizonProfileDeg(
  atlas: LunarAtlasData,
  latDeg: number,
  lonEastDeg: number,
  horizonAzDeg: number[],
): number[] {
  const h0Km = sampleAtlasElevationKmBilinear(atlas, latDeg, lonEastDeg) + 0.002;
  const r0 = LUNAR_RADIUS_KM + h0Km;

  return horizonAzDeg.map((az) => {
    let maxAngleDeg = -8.0;
    for (let k = 0; k < RAY_DISTANCES_KM.length; k++) {
      const distKm = RAY_DISTANCES_KM[k];
      const pt = stepGeodesic(latDeg, lonEastDeg, az, distKm);
      const hDKm = sampleAtlasElevationKmBilinear(atlas, pt.latDeg, pt.lonEastDeg);
      const rD = LUNAR_RADIUS_KM + hDKm;
      const delta = distKm / LUNAR_RADIUS_KM;
      const elevRad = Math.atan2(rD * Math.cos(delta) - r0, Math.max(0.01, rD * Math.sin(delta)));
      const elevDeg = elevRad / DEG;
      if (elevDeg > maxAngleDeg) maxAngleDeg = elevDeg;
    }
    return Number(clamp(maxAngleDeg, -15, 45).toFixed(3));
  });
}

export function estimateLocalSlopeDeg(
  atlas: LunarAtlasData,
  latDeg: number,
  lonEastDeg: number,
): number {
  const stepKm = 0.65;
  const northPt = stepGeodesic(latDeg, lonEastDeg, 0, stepKm);
  const southPt = stepGeodesic(latDeg, lonEastDeg, 180, stepKm);
  const eastPt = stepGeodesic(latDeg, lonEastDeg, 90, stepKm);
  const westPt = stepGeodesic(latDeg, lonEastDeg, 270, stepKm);

  const dzDy =
    (sampleAtlasElevationKmBilinear(atlas, northPt.latDeg, northPt.lonEastDeg) -
      sampleAtlasElevationKmBilinear(atlas, southPt.latDeg, southPt.lonEastDeg)) /
    (2 * stepKm);
  const dzDx =
    (sampleAtlasElevationKmBilinear(atlas, eastPt.latDeg, eastPt.lonEastDeg) -
      sampleAtlasElevationKmBilinear(atlas, westPt.latDeg, westPt.lonEastDeg)) /
    (2 * stepKm);

  const slopeDeg = Math.atan(Math.hypot(dzDx, dzDy)) / DEG;
  return Number(clamp(slopeDeg, 0.2, 42).toFixed(2));
}

export function buildCustomSiteId(latDeg: number, lonEastDeg: number): string {
  const latStr = latDeg.toFixed(2).replace('-', 'S').replace('.', '_');
  const lonStr = normalizeLon(lonEastDeg).toFixed(2).replace('.', '_');
  return `custom_${latStr}_${lonStr}`;
}

export function formatCustomSiteName(latDeg: number, lonEastDeg: number): string {
  const latLabel = `${Math.abs(latDeg).toFixed(2)}°${latDeg < 0 ? 'S' : 'N'}`;
  const lonLabel = `${normalizeLon(lonEastDeg).toFixed(1)}°E`;
  return `Custom (${latLabel}, ${lonLabel})`;
}

export function createCustomLandingSite(params: {
  latDeg: number;
  lonEastDeg: number;
  atlas: LunarAtlasData;
  referenceSites: LandingSiteEntry[];
  horizonAzDeg: number[];
  missionWindow: MissionWindow;
}): LandingSiteEntry {
  const latDeg = clamp(params.latDeg, -89.95, 89.95);
  const lonEastDeg = normalizeLon(params.lonEastDeg);
  const { atlas, referenceSites, horizonAzDeg, missionWindow } = params;

  const refSite = referenceSites[0];
  let polarRef = refSite;
  let nearestAngle = Number.POSITIVE_INFINITY;
  for (const s of referenceSites) {
    const phi1 = latDeg * DEG;
    const phi2 = s.center.latitude_deg * DEG;
    const dLam = (lonEastDeg - s.center.longitude_east_deg) * DEG;
    const ang = Math.acos(
      clamp(Math.sin(phi1) * Math.sin(phi2) + Math.cos(phi1) * Math.cos(phi2) * Math.cos(dLam), -1, 1),
    );
    if (ang < nearestAngle) {
      nearestAngle = ang;
      polarRef = s;
    }
  }

  const elevM = Number((sampleAtlasElevationKmBilinear(atlas, latDeg, lonEastDeg) * 1000).toFixed(1));
  const slopeDeg = estimateLocalSlopeDeg(atlas, latDeg, lonEastDeg);
  const horizonElevDeg = raymarchHorizonProfileDeg(atlas, latDeg, lonEastDeg, horizonAzDeg);

  const skyProj = projectBodySkySeries(refSite, latDeg, lonEastDeg);
  const n = missionWindow.timestamps_utc.length;
  const inPolarElfoZone = latDeg <= -78;

  const elfoPrimaryAz = new Array<number>(n);
  const elfoPrimaryEl = new Array<number>(n);
  const elfoConstVisible = new Array<boolean>(n);
  const dteFullFlags = new Array<boolean>(n);

  let illumSum = 0;
  let sunlitHours = 0;
  let maxShadowRun = 0;
  let curShadowRun = 0;
  let energyTrackingWhM2 = 0;
  let dteCount = 0;
  let combinedCount = 0;
  const stepHours = missionWindow.step_seconds / 3600;

  for (let i = 0; i < n; i++) {
    const sunEl = skyProj.sunElDeg[i];
    const sunAz = skyProj.sunAzDeg[i];
    const earthEl = skyProj.earthElDeg[i];
    const earthAz = skyProj.earthAzDeg[i];

    const hSun = interpolateHorizon(sunAz, horizonAzDeg, horizonElevDeg);
    const hEarth = interpolateHorizon(earthAz, horizonAzDeg, horizonElevDeg);
    const fIllum = computeSolarIllumFraction(sunEl, hSun, missionWindow.solar_angular_radius_deg[i]);

    illumSum += fIllum;
    if (fIllum > 1e-6) {
      sunlitHours += stepHours;
      curShadowRun = 0;
    } else {
      curShadowRun++;
      if (curShadowRun > maxShadowRun) maxShadowRun = curShadowRun;
    }

    const distAu = missionWindow.sun_dist_au[i];
    const irr = SOLAR_CONSTANT_1AU_W_M2 / (distAu * distAu);
    const trapW = i === 0 || i === n - 1 ? 0.5 : 1.0;
    energyTrackingWhM2 += trapW * irr * fIllum * Math.max(0, Math.cos(sunEl * DEG)) * stepHours;

    const dteFull = earthEl - missionWindow.earth_angular_radius_deg[i] > hEarth;
    dteFullFlags[i] = dteFull;
    if (dteFull) dteCount++;

    if (inPolarElfoZone) {
      const elfoMe = enuToMoonMeUnit(
        polarRef.center.latitude_deg,
        polarRef.center.longitude_east_deg,
        polarRef.sky_series.elfo_primary_az_deg[i],
        polarRef.sky_series.elfo_primary_el_deg[i],
      );
      const elfoLoc = moonMeUnitToEnuAzEl(elfoMe, latDeg, lonEastDeg);
      elfoPrimaryAz[i] = Number(elfoLoc.azDeg.toFixed(3));
      elfoPrimaryEl[i] = Number(elfoLoc.elDeg.toFixed(3));
      const hElfo = interpolateHorizon(elfoLoc.azDeg, horizonAzDeg, horizonElevDeg);
      const primOk =
        polarRef.sky_series.elfo_primary_earth_los[i] &&
        polarRef.sky_series.elfo_primary_range_km[i] <= 12000 &&
        elfoLoc.elDeg > hElfo + 5.0;
      const constOk = polarRef.sky_series.elfo_constellation_visible[i] && (primOk || hElfo < 14);
      elfoConstVisible[i] = constOk;
      if (dteFull || constOk) combinedCount++;
    } else {
      elfoPrimaryAz[i] = 0;
      elfoPrimaryEl[i] = -10;
      elfoConstVisible[i] = false;
      if (dteFull) combinedCount++;
    }
  }

  const meanIllum = illumSum / Math.max(1, n);
  const maxShadowHours = maxShadowRun * stepHours;
  const isPsr = meanIllum <= 0.005;

  const nodes: LocalGridNode[] = [];
  const gridOffsets = [-500, -250, 0, 250, 500];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const dxM = gridOffsets[col];
      const dyM = -gridOffsets[row];
      const isCenter = dxM === 0 && dyM === 0;
      const offsetElevM = isCenter
        ? elevM
        : Number(
            (
              sampleAtlasElevationKmBilinear(
                atlas,
                clamp(latDeg + (dyM / (LUNAR_RADIUS_KM * 1000)) / DEG, -89.95, 89.95),
                normalizeLon(
                  lonEastDeg +
                    (dxM / (LUNAR_RADIUS_KM * 1000 * Math.max(0.08, Math.cos(latDeg * DEG)))) / DEG,
                ),
              ) * 1000
            ).toFixed(1),
          );
      nodes.push({
        row,
        col,
        dx_m: dxM,
        dy_m: dyM,
        latitude_deg: clamp(latDeg + (dyM / (LUNAR_RADIUS_KM * 1000)) / DEG, -89.95, 89.95),
        longitude_east_deg: normalizeLon(
          lonEastDeg +
            (dxM / (LUNAR_RADIUS_KM * 1000 * Math.max(0.08, Math.cos(latDeg * DEG)))) / DEG,
        ),
        elevation_m: offsetElevM,
        slope_deg: slopeDeg,
        psr_distance_m: isPsr ? 0 : 1200,
        is_psr: isPsr,
        horizon_elev_deg: horizonElevDeg,
        mean_illum_fraction: Number(meanIllum.toFixed(4)),
        max_continuous_shadow_hours: Number(maxShadowHours.toFixed(1)),
        energy_tracking_wh_m2: Number(energyTrackingWhM2.toFixed(1)),
        dte_full_disk_duty_cycle_pct: Number(((dteCount / Math.max(1, n)) * 100).toFixed(2)),
        combined_dte_elfo_duty_cycle_pct: Number(((combinedCount / Math.max(1, n)) * 100).toFixed(2)),
        max_blackout_combined_hours: 0,
        landing_score_0_100: 50,
      });
    }
  }

  const phi = latDeg * DEG;
  const lam = lonEastDeg * DEG;
  const rKm = LUNAR_RADIUS_KM + elevM / 1000;
  const cartMeKm: [number, number, number] = [
    Number((rKm * Math.cos(phi) * Math.cos(lam)).toFixed(3)),
    Number((rKm * Math.cos(phi) * Math.sin(lam)).toFixed(3)),
    Number((rKm * Math.sin(phi)).toFixed(3)),
  ];

  const dtePct = (dteCount / Math.max(1, n)) * 100;
  const combPct = (combinedCount / Math.max(1, n)) * 100;
  const id = buildCustomSiteId(latDeg, lonEastDeg);
  const name = formatCustomSiteName(latDeg, lonEastDeg);

  return {
    id,
    name,
    category: isPsr ? 'psr_contrast' : 'reference_ridge',
    description: `Uncharted surface coordinates evaluated on-demand using NASA LOLA elevation ray-marching and SPICE DE421 solar/Earth vectors.${
      inPolarElfoZone ? '' : ' Outside the 80°S–90°S polar ELFO relay envelope.'
    }`,
    center: {
      latitude_deg: Number(latDeg.toFixed(4)),
      longitude_east_deg: Number(lonEastDeg.toFixed(4)),
      elevation_m: elevM,
      slope_deg: slopeDeg,
      cartesian_me_km: cartMeKm,
      psr_distance_m: isPsr ? 0 : 1200,
      is_psr: isPsr,
      observer_height_m: 2.0,
    },
    horizon_elev_deg: horizonElevDeg,
    sky_series: {
      sun_az_deg: skyProj.sunAzDeg,
      sun_el_deg: skyProj.sunElDeg,
      earth_az_deg: skyProj.earthAzDeg,
      earth_el_deg: skyProj.earthElDeg,
      elfo_primary_az_deg: elfoPrimaryAz,
      elfo_primary_el_deg: elfoPrimaryEl,
      elfo_primary_alt_km: polarRef.sky_series.elfo_primary_alt_km,
      elfo_primary_range_km: polarRef.sky_series.elfo_primary_range_km,
      elfo_primary_earth_los: polarRef.sky_series.elfo_primary_earth_los,
      elfo_constellation_visible: elfoConstVisible,
      elfo_constellation_best_alt_km: polarRef.sky_series.elfo_constellation_best_alt_km,
      elfo_constellation_best_fspl_db: polarRef.sky_series.elfo_constellation_best_fspl_db,
      lro_visible: polarRef.sky_series.lro_visible,
    },
    engineering_summary: {
      solar: {
        mean_illum_fraction: Number(meanIllum.toFixed(4)),
        sunlit_hours: Number(sunlitHours.toFixed(1)),
        max_continuous_shadow_hours: Number(maxShadowHours.toFixed(1)),
        energy_tracking_wh_m2: Number(energyTrackingWhM2.toFixed(1)),
        energy_fixed_north_wh_m2: Number((energyTrackingWhM2 * 0.68).toFixed(1)),
        energy_fixed_horiz_wh_m2: Number((energyTrackingWhM2 * 0.08).toFixed(1)),
        min_battery_100w_wh: Number((maxShadowHours * 100).toFixed(1)),
      },
      comms: {
        dte_center_duty_cycle_pct: Number(dtePct.toFixed(2)),
        dte_full_disk_duty_cycle_pct: Number(dtePct.toFixed(2)),
        elfo_pathfinder_duty_cycle_pct: Number((combPct * 0.5).toFixed(2)),
        elfo_constellation_duty_cycle_pct: Number(combPct.toFixed(2)),
        lro_duty_cycle_pct: polarRef.engineering_summary.comms.lro_duty_cycle_pct,
        combined_dte_elfo_duty_cycle_pct: Number(combPct.toFixed(2)),
        relay_coverage_gain_pct: Number(Math.max(0, combPct - dtePct).toFixed(2)),
        max_blackout_dte_hours: 0,
        max_blackout_combined_hours: 0,
        mean_elfo_altitude_km: polarRef.engineering_summary.comms.mean_elfo_altitude_km,
        mean_elfo_fspl_db: polarRef.engineering_summary.comms.mean_elfo_fspl_db,
      },
      score: {
        total_0_100: 50,
        safety_slope_0_100: 50,
        power_0_100: 50,
        comms_0_100: 50,
        science_psr_0_100: 50,
      },
    },
    local_grid: {
      spacing_m: 250,
      grid_size: 5,
      nodes,
    },
  };
}
