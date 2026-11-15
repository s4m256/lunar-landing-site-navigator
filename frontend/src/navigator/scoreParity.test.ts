import { describe, expect, it } from 'vitest';
import parity from '../../../contracts/examples/landing-score-parity-cases.json';
import scoreModel from '../../../contracts/landing-score-model.v1.json';
import { DEFAULT_CONFIG, SCORE_MODEL, computeCompositeScore, roundHalfEven } from './math';

interface ParityInput {
  slope_deg: number;
  mean_illum_fraction: number;
  max_continuous_shadow_hours: number;
  dte_full_disk_duty_cycle_pct: number;
  combined_dte_elfo_duty_cycle_pct: number;
  psr_distance_m: number | null;
  is_psr: boolean;
  use_relay: boolean;
  slope_limit_deg: number | null;
  weights: { safety: number; power: number; comms: number; science_psr: number };
}

const cases = parity.cases as Array<{ id: string; input: ParityInput; expected: Record<string, number | boolean> }>;

describe('paridade TS ↔ Python do índice ilustrativo (contracts/examples/landing-score-parity-cases.json)', () => {
  it('usa o mesmo modelo de parâmetros que scoring.py', () => {
    expect(parity.model_version).toBe(SCORE_MODEL.model_version);
    expect(DEFAULT_CONFIG.weights).toEqual(scoreModel.weights);
    expect(DEFAULT_CONFIG.slopeLimitDeg).toBe(scoreModel.slope.default_elimination_limit_deg);
  });

  it.each(cases.map((c) => [c.id, c] as const))('%s: mesmos números que o Python', (_id, c) => {
    const i = c.input;
    const ts = computeCompositeScore(
      i.slope_deg,
      i.mean_illum_fraction,
      i.max_continuous_shadow_hours,
      i.dte_full_disk_duty_cycle_pct,
      i.combined_dte_elfo_duty_cycle_pct,
      i.psr_distance_m,
      i.is_psr,
      i.weights,
      i.use_relay,
      i.slope_limit_deg,
    );
    // Exact equality, not toBeCloseTo: both sides run the same IEEE operations and rounding.
    expect(ts).toEqual(c.expected);
  });

  it('cobre eliminação por declive, distância desconhecida e o desempate do arredondamento', () => {
    const byId = Object.fromEntries(cases.map((c) => [c.id, c.expected]));
    expect(byId.slope_just_above_limit_is_eliminated).toMatchObject({ eliminated: true, total_0_100: 0, safety_slope_0_100: 0 });
    expect(byId.slope_at_limit_is_not_eliminated.eliminated).toBe(false);
    expect(byId.unknown_psr_distance_gets_no_credit.science_psr_0_100).toBe(0);
    expect(byId.rounding_tie_goes_to_even.comms_0_100).toBe(12.12);
  });

  it('arredonda como round() do Python, inclusive nos empates exatos', () => {
    expect(roundHalfEven(12.125, 2)).toBe(12.12); // (12.125).toFixed(2) would give 12.13
    expect(roundHalfEven(0.375, 2)).toBe(0.38);
    expect(roundHalfEven(0.625, 2)).toBe(0.62);
    expect(roundHalfEven(2.675, 2)).toBe(2.67); // binary value is below the tie
    expect(roundHalfEven(-12.125, 2)).toBe(-12.12);
    expect(roundHalfEven(65.535, 2)).toBe(65.53);
  });
});
