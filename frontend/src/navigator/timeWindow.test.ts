import { describe, expect, it } from 'vitest';
import { describeMissingInstant, findInstantIndex, formatUtc, parseUtcInput, sampleIndices, spanDays } from './timeWindow';

const timestamps = ['2026-11-15T00:00:00Z', '2026-11-15T01:00:00Z', '2026-11-15T02:00:00Z', '2026-11-15T03:00:00Z'];

describe('timeWindow (CA-6: ausência de dado não vira número)', () => {
  it('encontra somente instantes que existem no arquivo', () => {
    expect(findInstantIndex('2026-11-15T02:00', timestamps)).toEqual({ ok: true, index: 2 });
    expect(findInstantIndex('2026-11-15T00:00', timestamps)).toEqual({ ok: true, index: 0 });
  });

  it('não usa a amostra vizinha para um horário entre duas amostras', () => {
    const r = findInstantIndex('2026-11-15T01:30', timestamps);
    expect(r).toEqual({ ok: false, reason: 'not_sampled', requestedLabel: '15/11/2026 01:30 UTC' });
    if (r.ok) throw new Error('unreachable');
    expect(describeMissingInstant(r, timestamps, 3600)).toMatch(/Não há amostra para 15\/11\/2026 01:30 UTC/);
    expect(describeMissingInstant(r, timestamps, 3600)).toMatch(/vizinhos não são usados/);
  });

  it('rejeita datas fora do período do arquivo, sem limitar ao extremo mais próximo', () => {
    const r = findInstantIndex('2027-01-01T00:00', timestamps);
    expect(r).toMatchObject({ ok: false, reason: 'out_of_range' });
    if (r.ok) throw new Error('unreachable');
    expect(describeMissingInstant(r, timestamps, 3600)).toBe(
      'Não há amostra para 01/01/2027 00:00 UTC. O arquivo só tem instantes de 15/11/2026 00:00 UTC a 15/11/2026 03:00 UTC.',
    );
  });

  it('rejeita textos e datas de calendário inválidos', () => {
    expect(findInstantIndex('', timestamps)).toEqual({ ok: false, reason: 'invalid' });
    expect(findInstantIndex('amanhã', timestamps)).toEqual({ ok: false, reason: 'invalid' });
    expect(parseUtcInput('2026-02-30T00:00')).toBeNull();
    expect(parseUtcInput('2026-11-15T24:00')).toBeNull();
    expect(parseUtcInput('2026-11-15T03:00')).toBe(Date.UTC(2026, 10, 15, 3, 0));
  });

  it('formata UTC, amostra a tabela com as duas pontas e mede o período', () => {
    expect(formatUtc('2026-12-10T23:00:00Z')).toBe('10/12/2026 23:00 UTC');
    expect(sampleIndices(0, 720, 49).indices.at(-1)).toBe(720);
    expect(sampleIndices(5, 9, 49)).toEqual({ indices: [5, 6, 7, 8, 9], stride: 1 });
    expect(spanDays('2026-11-15T00:00:00Z', '2026-12-15T00:00:00Z')).toBe('30');
  });
});
