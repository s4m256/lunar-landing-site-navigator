import { describe, expect, it } from 'vitest';
import datasetJson from '../data/south_pole_precomputed.v1.json';
import { parseNavigatorDataset } from '../contract';
import { DatasetIntegrityError, validateDataset } from '../datasetLoader';
import { findAllIssues } from './integrity';
import type { NavigatorDatasetV1 } from './types';

const fresh = (): NavigatorDatasetV1 => structuredClone(parseNavigatorDataset(datasetJson));

describe('integridade do dataset (CA-7)', () => {
  it('aceita o arquivo pré-calculado do repositório', () => {
    expect(findAllIssues(fresh())).toEqual([]);
  });

  it('detecta série com quantidade de instantes diferente do eixo de tempo', () => {
    const d = fresh();
    d.sites[2].sky_series.earth_el_deg.pop();
    expect(() => validateDataset(d)).toThrow(DatasetIntegrityError);
    expect(findAllIssues(d)[0]).toMatch(/^Mons Mouton Plateau: Série earth_el_deg com 720 valores; esperado 721/);
  });

  it('detecta local repetido, passo de tempo irregular e grade de direções irregular', () => {
    const d = fresh();
    d.sites[1] = structuredClone(d.sites[0]);
    d.mission_window.timestamps_utc[5] = '2026-11-15T05:30:00Z';
    d.horizon_azimuths_deg[10] = 10.5;
    const issues = findAllIssues(d).join('\n');
    expect(issues).toMatch(/Local repetido/);
    expect(issues).toMatch(/passo regular de 3600 s/);
    expect(issues).toMatch(/horizon_azimuths_deg não é uma grade regular/);
  });

  it('detecta grade local incompleta', () => {
    const d = fresh();
    d.sites[0].local_grid.nodes.pop();
    expect(findAllIssues(d)).toContain('Shackleton–de Gerlache Connecting Ridge: Grade local com 24 nós; esperado 25.');
  });
});
