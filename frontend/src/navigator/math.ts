import scoreModelJson from '../../../contracts/landing-score-model.v1.json';
import {
  EngineeringConfig,
  LandingSiteEntry,
  LocalGridNode,
  MissionWindow,
  NavigatorDatasetV1,
  ScoreSummary,
  ScoreWeightsConfig,
} from './types';

/** contracts/landing-score-model.v1.json: the single source of the illustrative index parameters. */
export interface LandingScoreModel {
  model_version: string;
  illustrative: true;
  description: string;
  weights: ScoreWeightsConfig;
  slope: { full_score_max_deg: number; zero_score_deg: number; default_elimination_limit_deg: number };
  power: { illumination_weight: number; shadow_weight: number; shadow_scale_hours: number };
  comms: { relay_combined_weight: number; dte_weight: number };
  science_psr: {
    inside_psr_points: number;
    unknown_distance_points: number;
    near_max_m: number;
    near_points: number;
    ramp_end_m: number;
    ramp_end_points: number;
    zero_m: number;
  };
  rounding: { decimals: number; ties: 'half_even' };
}

/** Same file that science/src/lunar_science/navigator/scoring.py reads (packaged copy, byte-identical). */
export const SCORE_MODEL = scoreModelJson as LandingScoreModel;

export const SOLAR_CONSTANT_1AU_W_M2 = 1361.0;

/**
 * True when the generator's search found no permanently shadowed point around the site. Contract
 * 1.1.0 writes `psr_distance_m: null` for that case (1.0.0 stored its 5200 m search radius as if it
 * were a distance; the migration turned those values into null, see contracts/README.md).
 */
export function psrSearchFoundNothing(site: LandingSiteEntry): boolean {
  return !site.center.is_psr && site.center.psr_distance_m === null;
}

/**
 * Same defaults as the data generator (science/.../solar.py, comms.py; score weights and slope limit
 * from SCORE_MODEL). They have no cited source (audit SPA-9, sections 4.2 and 6.4): examples, not
 * recommendations.
 */
export const DEFAULT_CONFIG: EngineeringConfig = {
  panelAreaM2: 4.0,
  panelEfficiency: 0.28,
  panelMode: 'tracking',
  survivalLoadW: 100.0,
  antennaMaskDeg: 5.0,
  elfoMaxRangeKm: 12000,
  dteMarginMode: 'full_disk',
  relayEnabled: true,
  weights: { ...SCORE_MODEL.weights },
  slopeLimitDeg: SCORE_MODEL.slope.default_elimination_limit_deg,
};

/**
 * Initial settings of the page. Relays are a hypothetical scenario, so they start excluded and
 * the user opts in. The antenna mask and range come from the file's relay preset because the
 * stored constellation visibility was computed with them and cannot be recomputed here.
 */
export function initialConfig(dataset: NavigatorDatasetV1): EngineeringConfig {
  const preset = dataset.relay_presets.elfo_pathfinder;
  return {
    ...DEFAULT_CONFIG,
    relayEnabled: false,
    antennaMaskDeg: preset.antenna_mask_deg,
    elfoMaxRangeKm: preset.max_range_km,
    // The limit the file was produced with (conventions), not the model default.
    slopeLimitDeg: dataset.provenance.conventions.clps_slope_limit_deg,
  };
}

export interface InterpolatedTerrain {
  dxM: number;
  dyM: number;
  latitudeDeg: number;
  longitudeEastDeg: number;
  elevationM: number;
  slopeDeg: number;
  /** null when the file has no PSR distance for this point (or for a grid node used to interpolate it). */
  psrDistanceM: number | null;
  isPsr: boolean;
  horizonElevDeg: number[];
}

export interface LiveEpochState {
  fIllum: number;
  irradianceWM2: number;
  powerW: number;
  horizonAtSunDeg: number;
  horizonAtEarthDeg: number;
  dteVisible: boolean;
  elfoPrimaryVisible: boolean;
  /**
   * The file stores constellation and LRO-like visibility only for the site centre, for its own
   * antenna mask. Away from the centre the value does not exist, so it is null (never guessed).
   */
  elfoConstellationVisible: boolean | null;
  lroVisible: boolean | null;
  /** null when relays are included and their visibility does not exist at this point. */
  combinedLinkVisible: boolean | null;
}

export type ScoreUnavailableReason = 'zero_weights' | 'relay_unknown_off_center';

/** Composite index computed on the page. Parts that depend on missing data are null. */
export interface LiveScore {
  total_0_100: number | null;
  safety_slope_0_100: number;
  power_0_100: number;
  comms_0_100: number | null;
  science_psr_0_100: number;
  /** Slope above the file's clps_slope_limit_deg: the index is 0 whatever the other parts. */
  eliminated: boolean;
  /** Same index with direct-to-Earth line of sight only (the relay scenario is hypothetical). */
  totalWithoutRelay_0_100: number | null;
  unavailableReason: ScoreUnavailableReason | null;
}

/** Score parts as stored in the contract, plus the elimination flag. */
export type CompositeScore = ScoreSummary & { eliminated: boolean };

export interface LiveSiteAnalysis {
  terrain: InterpolatedTerrain;
  solar: {
    meanIllumFraction: number;
    sunlitHours: number;
    maxContinuousShadowHours: number;
    energyCycleWh: number;
    energyPerM2Wh: number;
    minBatteryWh: number;
    peakPowerW: number;
  };
  comms: {
    dteDutyCyclePct: number;
    elfoConstellationDutyCyclePct: number | null;
    lroDutyCyclePct: number | null;
    combinedDutyCyclePct: number | null;
    relayCoverageGainPct: number | null;
    maxBlackoutDteHours: number;
    maxBlackoutCombinedHours: number | null;
  };
  score: LiveScore;
  epochStates: LiveEpochState[];
  /** True when the analysed point is the site centre (values straight from the file series). */
  isCenter: boolean;
}

function clamp(val: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, val));
}

export function interpolateHorizon(
  azDeg: number,
  horizonAzDeg: number[],
  horizonElevDeg: number[],
): number {
  const n = horizonAzDeg.length;
  if (n === 0) return 0;
  const az = ((azDeg % 360) + 360) % 360;
  const step = 360 / n;
  const idxFloat = az / step;
  const i0 = Math.floor(idxFloat) % n;
  const i1 = (i0 + 1) % n;
  const frac = idxFloat - Math.floor(idxFloat);
  return horizonElevDeg[i0] * (1 - frac) + horizonElevDeg[i1] * frac;
}

export function computeSolarIllumFraction(
  sunElDeg: number,
  horizonElevDeg: number,
  solarAngularRadiusDeg: number,
): number {
  const radius = Math.max(solarAngularRadiusDeg, 1e-6);
  const u = (sunElDeg - horizonElevDeg) / radius;
  if (u >= 1) return 1;
  if (u <= -1) return 0;
  return (1 / Math.PI) * Math.acos(-u) + (u / Math.PI) * Math.sqrt(Math.max(0, 1 - u * u));
}

export function interpolateLocalGrid(
  site: LandingSiteEntry,
  xNorm: number,
  yNorm: number,
): InterpolatedTerrain {
  const grid = site.local_grid;
  const size = grid.grid_size;
  const nodesMap = new Map<string, LocalGridNode>();
  for (const node of grid.nodes) {
    nodesMap.set(`${node.row},${node.col}`, node);
  }
  const getNode = (r: number, c: number): LocalGridNode =>
    nodesMap.get(`${clamp(r, 0, size - 1)},${clamp(c, 0, size - 1)}`) ?? grid.nodes[0];

  const colF = clamp(((1 + xNorm) * 0.5) * (size - 1), 0, size - 1);
  const rowF = clamp(((1 - yNorm) * 0.5) * (size - 1), 0, size - 1);
  const c0 = Math.floor(colF);
  const r0 = Math.floor(rowF);
  const c1 = Math.min(c0 + 1, size - 1);
  const r1 = Math.min(r0 + 1, size - 1);
  const tc = colF - c0;
  const tr = rowF - r0;

  const n00 = getNode(r0, c0);
  const n01 = getNode(r0, c1);
  const n10 = getNode(r1, c0);
  const n11 = getNode(r1, c1);

  const w00 = (1 - tr) * (1 - tc);
  const w01 = (1 - tr) * tc;
  const w10 = tr * (1 - tc);
  const w11 = tr * tc;

  const bilerp = (a: number, b: number, c: number, d: number) =>
    w00 * a + w01 * b + w10 * c + w11 * d;

  const horizonLen = n00.horizon_elev_deg.length;
  const horizonElevDeg = new Array<number>(horizonLen);
  for (let i = 0; i < horizonLen; i++) {
    horizonElevDeg[i] = bilerp(
      n00.horizon_elev_deg[i],
      n01.horizon_elev_deg[i],
      n10.horizon_elev_deg[i],
      n11.horizon_elev_deg[i],
    );
  }

  // An unknown distance at any corner makes the interpolated distance unknown (never mixed in).
  const corners = [n00.psr_distance_m, n01.psr_distance_m, n10.psr_distance_m, n11.psr_distance_m];
  const psrDistanceM = corners.some((d) => d === null)
    ? null
    : bilerp(corners[0] as number, corners[1] as number, corners[2] as number, corners[3] as number);
  const nearest = getNode(Math.round(rowF), Math.round(colF));

  return {
    dxM: bilerp(n00.dx_m, n01.dx_m, n10.dx_m, n11.dx_m),
    dyM: bilerp(n00.dy_m, n01.dy_m, n10.dy_m, n11.dy_m),
    latitudeDeg: bilerp(n00.latitude_deg, n01.latitude_deg, n10.latitude_deg, n11.latitude_deg),
    longitudeEastDeg: bilerp(
      n00.longitude_east_deg,
      n01.longitude_east_deg,
      n10.longitude_east_deg,
      n11.longitude_east_deg,
    ),
    elevationM: bilerp(n00.elevation_m, n01.elevation_m, n10.elevation_m, n11.elevation_m),
    slopeDeg: bilerp(n00.slope_deg, n01.slope_deg, n10.slope_deg, n11.slope_deg),
    psrDistanceM,
    isPsr: nearest.is_psr || (psrDistanceM !== null && psrDistanceM <= 80),
    horizonElevDeg,
  };
}

/**
 * Python's round(value, decimals): nearest decimal of the exact binary value, ties to even.
 * Number.toFixed breaks ties upwards; a tie is only possible when value * 2^(decimals+1) is an
 * odd integer (the binary value then sits exactly halfway), and that case is resolved here.
 */
export function roundHalfEven(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const j = x * 2 ** (decimals + 1); // exact: scaling by a power of two
  if (Number.isInteger(j) && j % 2 === 1) {
    const twice = j * 5 ** decimals; // = 2 * x * 10^decimals, an odd integer
    const lower = (twice - 1) / 2;
    return (sign * (lower % 2 === 0 ? lower : lower + 1)) / 10 ** decimals;
  }
  return sign * Number(x.toFixed(decimals));
}

/** True when the slope exceeds the limit (null disables the constraint), as is_slope_eliminated(). */
export function isSlopeEliminated(slopeDeg: number, slopeLimitDeg: number | null): boolean {
  return slopeLimitDeg !== null && slopeDeg > slopeLimitDeg;
}

/**
 * Illustrative 0-100 index, rule of contract 1.1.0. Mirrors compute_composite_landing_score in
 * science/src/lunar_science/navigator/scoring.py: same parameters (SCORE_MODEL), same operation
 * order and same rounding, so both return identical numbers (contracts/examples/
 * landing-score-parity-cases.json). A slope above the limit sets total and safety to 0; an unknown
 * PSR distance (null) gets no proximity credit.
 */
export function computeCompositeScore(
  slopeDeg: number,
  meanIllumFraction: number,
  maxContinuousShadowHours: number,
  dteDutyPct: number,
  combinedDutyPct: number,
  psrDistanceM: number | null,
  isPsr: boolean,
  weights: ScoreWeightsConfig,
  relayEnabled: boolean,
  slopeLimitDeg: number | null = SCORE_MODEL.slope.default_elimination_limit_deg,
): CompositeScore {
  const m = SCORE_MODEL;
  const eliminated = isSlopeEliminated(slopeDeg, slopeLimitDeg);
  const { full_score_max_deg: full, zero_score_deg: zero } = m.slope;
  const safety = eliminated ? 0 : clamp((100 * (zero - slopeDeg)) / (zero - full), 0, 100);

  const illumScore = clamp(meanIllumFraction * 100, 0, 100);
  const shadowRes = clamp(100 * (1 - maxContinuousShadowHours / m.power.shadow_scale_hours), 0, 100);
  const power = clamp(m.power.illumination_weight * illumScore + m.power.shadow_weight * shadowRes, 0, 100);

  const comms = relayEnabled
    ? clamp(m.comms.relay_combined_weight * combinedDutyPct + m.comms.dte_weight * dteDutyPct, 0, 100)
    : clamp(dteDutyPct, 0, 100);

  const p = m.science_psr;
  let sciencePsr: number;
  if (isPsr) sciencePsr = p.inside_psr_points;
  else if (psrDistanceM === null) sciencePsr = p.unknown_distance_points;
  else if (psrDistanceM <= p.near_max_m) sciencePsr = p.near_points;
  else if (psrDistanceM <= p.ramp_end_m)
    sciencePsr = clamp(
      p.near_points - ((p.near_points - p.ramp_end_points) * (psrDistanceM - p.near_max_m)) / (p.ramp_end_m - p.near_max_m),
      0,
      100,
    );
  else sciencePsr = clamp(p.ramp_end_points * (1 - (psrDistanceM - p.ramp_end_m) / (p.zero_m - p.ramp_end_m)), 0, 100);

  const wSum = Math.max(weights.safety + weights.power + weights.comms + weights.science_psr, 1e-9);
  const total = eliminated
    ? 0
    : (weights.safety * safety + weights.power * power + weights.comms * comms + weights.science_psr * sciencePsr) / wSum;

  const d = m.rounding.decimals;
  return {
    total_0_100: roundHalfEven(clamp(total, 0, 100), d),
    safety_slope_0_100: roundHalfEven(safety, d),
    power_0_100: roundHalfEven(power, d),
    comms_0_100: roundHalfEven(comms, d),
    science_psr_0_100: roundHalfEven(sciencePsr, d),
    eliminated,
  };
}

function longestFalseRunHours(flags: boolean[], stepHours: number): number {
  let maxRun = 0;
  let cur = 0;
  for (const ok of flags) {
    if (ok) {
      cur = 0;
    } else {
      cur++;
      if (cur > maxRun) maxRun = cur;
    }
  }
  return maxRun * stepHours;
}

export function evaluateLiveSite(
  site: LandingSiteEntry,
  xNorm: number,
  yNorm: number,
  horizonAzDeg: number[],
  missionWindow: MissionWindow,
  config: EngineeringConfig,
): LiveSiteAnalysis {
  const isExactCenter = Math.abs(xNorm) < 1e-6 && Math.abs(yNorm) < 1e-6;
  const terrain: InterpolatedTerrain = isExactCenter
    ? {
        dxM: 0,
        dyM: 0,
        latitudeDeg: site.center.latitude_deg,
        longitudeEastDeg: site.center.longitude_east_deg,
        elevationM: site.center.elevation_m,
        slopeDeg: site.center.slope_deg,
        psrDistanceM: site.center.psr_distance_m,
        isPsr: site.center.is_psr,
        horizonElevDeg: site.horizon_elev_deg,
      }
    : interpolateLocalGrid(site, xNorm, yNorm);

  const sky = site.sky_series;
  const n = missionWindow.timestamps_utc.length;
  const stepHours = missionWindow.step_seconds / 3600;
  const epochStates = new Array<LiveEpochState>(n);

  let illumSum = 0;
  let sunlitTrapz = 0;
  let powerSumTrapz = 0;
  let peakPowerW = 0;
  let currentShadowRun = 0;
  let maxShadowRun = 0;

  let dteCount = 0;
  let elfoCount = 0;
  let combinedCount = 0;
  let combinedKnown = true;
  const dteFlags = new Array<boolean>(n);
  const combFlags = new Array<boolean>(n);

  for (let i = 0; i < n; i++) {
    const sunAz = sky.sun_az_deg[i];
    const sunEl = sky.sun_el_deg[i];
    const earthAz = sky.earth_az_deg[i];
    const earthEl = sky.earth_el_deg[i];
    const sunRadius = missionWindow.solar_angular_radius_deg[i];
    const earthRadius = missionWindow.earth_angular_radius_deg[i];
    const distAu = missionWindow.sun_dist_au[i];

    const hSun = interpolateHorizon(sunAz, horizonAzDeg, terrain.horizonElevDeg);
    const hEarth = interpolateHorizon(earthAz, horizonAzDeg, terrain.horizonElevDeg);
    const fIllum = computeSolarIllumFraction(sunEl, hSun, sunRadius);
    const irradianceWM2 = SOLAR_CONSTANT_1AU_W_M2 / (distAu * distAu);

    const elRad = (sunEl * Math.PI) / 180;
    const azRad = (sunAz * Math.PI) / 180;
    let incidenceFactor = 0;
    if (config.panelMode === 'tracking') {
      incidenceFactor = Math.max(0, Math.cos(elRad));
    } else if (config.panelMode === 'fixed_north') {
      incidenceFactor = Math.max(0, Math.cos(elRad) * Math.cos(azRad));
    } else {
      incidenceFactor = Math.max(0, Math.sin(elRad));
    }

    const powerW =
      config.panelEfficiency * config.panelAreaM2 * irradianceWM2 * fIllum * incidenceFactor;
    if (powerW > peakPowerW) peakPowerW = powerW;

    illumSum += fIllum;
    const trapWeight = i === 0 || i === n - 1 ? 0.5 : 1.0;
    powerSumTrapz += trapWeight * powerW;
    sunlitTrapz += trapWeight * (fIllum > 1e-6 ? 1 : 0);

    if (fIllum <= 1e-6) {
      currentShadowRun++;
      if (currentShadowRun > maxShadowRun) maxShadowRun = currentShadowRun;
    } else {
      currentShadowRun = 0;
    }

    const dteMargin = config.dteMarginMode === 'full_disk' ? earthRadius : 0;
    const dteVisible = earthEl - dteMargin > hEarth;

    const hElfoPrim = interpolateHorizon(
      sky.elfo_primary_az_deg[i],
      horizonAzDeg,
      terrain.horizonElevDeg,
    );
    const elfoPrimaryVisible =
      sky.elfo_primary_earth_los[i] &&
      sky.elfo_primary_range_km[i] <= config.elfoMaxRangeKm &&
      sky.elfo_primary_el_deg[i] > hElfoPrim + config.antennaMaskDeg;

    // Only the file's own centre series exist; no visibility is inferred for other points.
    const elfoConstellationVisible = isExactCenter ? sky.elfo_constellation_visible[i] : null;
    const lroVisible = isExactCenter ? sky.lro_visible[i] : null;
    let combinedVisible: boolean | null = dteVisible;
    if (config.relayEnabled) {
      combinedVisible = dteVisible ? true : elfoConstellationVisible;
    }

    dteFlags[i] = dteVisible;
    if (dteVisible) dteCount++;
    if (elfoConstellationVisible) elfoCount++;
    if (combinedVisible === null) combinedKnown = false;
    else {
      combFlags[i] = combinedVisible;
      if (combinedVisible) combinedCount++;
    }

    epochStates[i] = {
      fIllum,
      irradianceWM2,
      powerW,
      horizonAtSunDeg: hSun,
      horizonAtEarthDeg: hEarth,
      dteVisible,
      elfoPrimaryVisible,
      elfoConstellationVisible,
      lroVisible,
      combinedLinkVisible: combinedVisible,
    };
  }

  const meanIllumFraction = illumSum / n;
  const maxContinuousShadowHours = maxShadowRun * stepHours;
  const energyCycleWh = powerSumTrapz * stepHours;
  const energyPerM2Wh = energyCycleWh / Math.max(config.panelAreaM2, 1e-6);
  const minBatteryWh = config.survivalLoadW * maxContinuousShadowHours;

  const dteDutyCyclePct = (dteCount / n) * 100;
  const elfoConstellationDutyCyclePct = isExactCenter ? (elfoCount / n) * 100 : null;
  const combinedDutyCyclePct = combinedKnown ? (combinedCount / n) * 100 : null;
  const relayCoverageGainPct =
    !config.relayEnabled ? 0 : combinedDutyCyclePct === null ? null : combinedDutyCyclePct - dteDutyCyclePct;

  // The file's 5-min LRO-like duty cycle exists for the centre only.
  const lroDutyCyclePct = isExactCenter ? site.engineering_summary.comms.lro_duty_cycle_pct : null;

  const scoreFor = (relay: boolean) =>
    computeCompositeScore(
      terrain.slopeDeg,
      meanIllumFraction,
      maxContinuousShadowHours,
      dteDutyCyclePct,
      combinedDutyCyclePct ?? 0,
      terrain.psrDistanceM,
      terrain.isPsr,
      config.weights,
      relay,
      config.slopeLimitDeg,
    );
  const parts = scoreFor(config.relayEnabled);
  const dteOnly = config.relayEnabled ? scoreFor(false) : parts;
  const w = config.weights;
  const commsKnown = combinedDutyCyclePct !== null;
  let unavailableReason: ScoreUnavailableReason | null = null;
  if (w.safety + w.power + w.comms + w.science_psr <= 0) unavailableReason = 'zero_weights';
  else if (!commsKnown && w.comms > 0) unavailableReason = 'relay_unknown_off_center';
  const score: LiveScore = {
    total_0_100: unavailableReason === null ? parts.total_0_100 : null,
    safety_slope_0_100: parts.safety_slope_0_100,
    power_0_100: parts.power_0_100,
    comms_0_100: commsKnown ? parts.comms_0_100 : null,
    science_psr_0_100: parts.science_psr_0_100,
    eliminated: parts.eliminated,
    totalWithoutRelay_0_100: w.safety + w.power + w.comms + w.science_psr <= 0 ? null : dteOnly.total_0_100,
    unavailableReason,
  };

  return {
    terrain,
    solar: {
      meanIllumFraction,
      sunlitHours: sunlitTrapz * stepHours,
      maxContinuousShadowHours,
      energyCycleWh,
      energyPerM2Wh,
      minBatteryWh,
      peakPowerW,
    },
    comms: {
      dteDutyCyclePct,
      elfoConstellationDutyCyclePct,
      lroDutyCyclePct,
      combinedDutyCyclePct,
      relayCoverageGainPct,
      maxBlackoutDteHours: longestFalseRunHours(dteFlags, stepHours),
      maxBlackoutCombinedHours: combinedKnown ? longestFalseRunHours(combFlags, stepHours) : null,
    },
    score,
    epochStates,
    isCenter: isExactCenter,
  };
}
