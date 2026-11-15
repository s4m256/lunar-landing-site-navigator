import type { LiveSiteAnalysis } from './math';

/** Same threshold the page uses for "disk below the relief" in evaluateLiveSite. */
const SHADOW_FRACTION = 1e-6;

export interface PeriodStats {
  /** Number of file instants in the period (both ends included). */
  samples: number;
  /** Mean fraction of the solar disk above the relief, 0-1. */
  meanIllumFraction: number;
  /** Longest run of instants with the whole disk below the relief, times the step, in hours. */
  maxShadowHours: number;
  /** Share of instants with the Earth (per the DTE option) above the relief, 0-100. */
  dtePct: number;
}

/**
 * Indicators of one site over the file instants startIdx..endIdx, from the per-instant states the
 * page already computed. Same conventions as the whole-window values of evaluateLiveSite (runs count
 * instants times the step), restricted to the period; no instant outside it is used.
 */
export function periodStats(analysis: LiveSiteAnalysis, startIdx: number, endIdx: number, stepHours: number): PeriodStats {
  if (!(startIdx >= 0 && endIdx >= startIdx && endIdx < analysis.epochStates.length)) {
    throw new RangeError(`Invalid period ${startIdx}..${endIdx}`);
  }
  let illumSum = 0;
  let dteCount = 0;
  let run = 0;
  let maxRun = 0;
  for (let i = startIdx; i <= endIdx; i++) {
    const st = analysis.epochStates[i];
    illumSum += st.fIllum;
    if (st.dteVisible) dteCount++;
    if (st.fIllum <= SHADOW_FRACTION) {
      run++;
      if (run > maxRun) maxRun = run;
    } else {
      run = 0;
    }
  }
  const samples = endIdx - startIdx + 1;
  return {
    samples,
    meanIllumFraction: illumSum / samples,
    maxShadowHours: maxRun * stepHours,
    dtePct: (dteCount / samples) * 100,
  };
}
