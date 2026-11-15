import { describe, expect, it } from 'vitest';
import { formatDeg, formatPct, yesNo } from './format';
import { horizonState, idealHorizonText, reliefHorizonText } from './horizonState';

describe('horizonState (CA-4: limite estrito em zero)', () => {
  it('trata elevação exatamente 0 como "não acima", sem arredondar antes', () => {
    expect(horizonState(0)).toBe('not_above');
    expect(horizonState(-0)).toBe('not_above');
    expect(idealHorizonText('earth', 0)).toBe('Centro da Terra não está acima do horizonte idealizado');
    expect(idealHorizonText('sun', 0)).toBe('Centro do Sol não está acima do horizonte idealizado');
  });

  it('usa os valores brutos: 0,0001° acima e −0,0001° não acima', () => {
    expect(horizonState(0.0001)).toBe('above');
    expect(horizonState(-0.0001)).toBe('not_above');
    expect(idealHorizonText('sun', 0.0001)).toBe('Centro do Sol acima do horizonte idealizado');
  });

  it('compara com o relevo de forma estrita: igual ao relevo não está acima', () => {
    expect(horizonState(2.5, 2.5)).toBe('not_above');
    expect(horizonState(2.501, 2.5)).toBe('above');
    expect(reliefHorizonText('earth', 1, 1)).toBe('Centro da Terra não está acima do relevo nessa direção');
    expect(reliefHorizonText('sun', 3, 1)).toBe('Centro do Sol acima do relevo nessa direção');
  });

  it('nunca transforma dado ausente em estado ou número', () => {
    expect(horizonState(Number.NaN)).toBe('no_data');
    expect(horizonState(1, Number.NaN)).toBe('no_data');
    expect(idealHorizonText('sun', Number.NaN)).toBe('Sem dado para este local e instante');
    expect(formatDeg(Number.NaN)).toBe('sem dado');
    expect(formatPct(null)).toBe('sem dado');
    expect(yesNo(null)).toBe('sem dado');
  });

  it('formata ângulos sem esconder valores pequenos diferentes de zero', () => {
    expect(formatDeg(0)).toBe('0°');
    expect(formatDeg(1.7652)).toBe('1,77°');
    expect(formatDeg(0.004)).toBe('0,004°');
    expect(formatDeg(-0.038)).toBe('-0,04°');
    expect(formatDeg(123.44, 1)).toBe('123,4°');
  });
});
