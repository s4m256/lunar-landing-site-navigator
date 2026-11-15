import { describe, expect, it } from 'vitest';
import type { LiveSiteAnalysis } from './math';
import { periodStats } from './periodStats';

// Only epochStates is read; the rest of the analysis is irrelevant here.
const analysisWith = (states: Array<{ fIllum: number; dteVisible: boolean }>) =>
  ({ epochStates: states }) as unknown as LiveSiteAnalysis;

describe('periodStats: indicadores restritos ao período escolhido', () => {
  const states = [
    { fIllum: 1, dteVisible: true },
    { fIllum: 0, dteVisible: false },
    { fIllum: 0, dteVisible: false },
    { fIllum: 0.5, dteVisible: true },
    { fIllum: 0, dteVisible: true },
    { fIllum: 1, dteVisible: false },
  ];

  it('usa só os instantes do período, com as duas pontas incluídas', () => {
    expect(periodStats(analysisWith(states), 0, 5, 1)).toEqual({ samples: 6, meanIllumFraction: 2.5 / 6, maxShadowHours: 2, dtePct: 50 });
    expect(periodStats(analysisWith(states), 3, 5, 2)).toEqual({ samples: 3, meanIllumFraction: 0.5, maxShadowHours: 2, dtePct: (2 / 3) * 100 });
    expect(periodStats(analysisWith(states), 4, 4, 1)).toEqual({ samples: 1, meanIllumFraction: 0, maxShadowHours: 1, dtePct: 100 });
  });

  it('recusa períodos fora do eixo de tempo em vez de cortar em silêncio', () => {
    expect(() => periodStats(analysisWith(states), 2, 1, 1)).toThrow(RangeError);
    expect(() => periodStats(analysisWith(states), 0, 6, 1)).toThrow(RangeError);
  });
});
