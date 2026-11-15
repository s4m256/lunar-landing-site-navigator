import { describe, expect, it } from 'vitest';
import syntheticJson from '../../contracts/examples/navigator-dataset.synthetic.json';
import datasetJson from './data/south_pole_precomputed.v1.json';
import { DatasetValidationError, parseNavigatorDataset } from './contract';
import { validateDataset } from './datasetLoader';
import { DEFAULT_CONFIG, computeCompositeScore, interpolateLocalGrid } from './navigator/math';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const fresh = (): Json => structuredClone(datasetJson) as Json;
const issuesOf = (value: unknown): string[] => {
  try {
    parseNavigatorDataset(value);
    return [];
  } catch (error) {
    if (error instanceof DatasetValidationError) return error.issues;
    throw error;
  }
};

describe('contrato navigator-dataset 1.1.0 no consumidor (Ajv)', () => {
  it('aceita o arquivo migrado: versão 1.1.0, distâncias desconhecidas como null e rótulo Horizons honesto', () => {
    const dataset = parseNavigatorDataset(datasetJson);
    expect(dataset.schema_version).toBe('1.1.0');
    expect(dataset.provenance.horizons_validation.status).toBe('unverified_no_raw_response');
    expect(dataset.provenance.migration?.psr_sentinel_nulled.count).toBe(26);
    const nulls = dataset.sites.flatMap((s) => [s.center, ...s.local_grid.nodes]).filter((p) => p.psr_distance_m === null);
    expect(nulls).toHaveLength(26);
    expect(Object.values(dataset.relay_presets).every((r) => r.hypothetical === true)).toBe(true);
  });

  it('aceita o exemplo sintético nativo 1.1.0 gerado pelo produtor Python com stubs (contracts/examples)', () => {
    const synthetic = validateDataset(syntheticJson); // Ajv + integrity checks, as for the real file
    expect(synthetic.provenance.migration).toBeUndefined();
    expect(synthetic.provenance.dem_product.product_id).toBe('SYNTHETIC_DEM_TEST');
    const hv = synthetic.provenance.horizons_validation;
    expect(hv.status).toBe('verified');
    expect(hv.raw_responses?.map((r) => r.response_file)).toEqual([
      'horizons_raw/target_10.response.json',
      'horizons_raw/target_399.response.json',
    ]);
    const steep = synthetic.sites.find((s) => s.id === 'syn_b')!.engineering_summary.score;
    expect(steep).toMatchObject({ eliminated: true, elimination_reasons: ['slope_above_clps_limit'], total_0_100: 0 });
  });

  it('rejeita um arquivo da versão 1.0.0 (sem compatibilidade automática)', () => {
    const old = fresh();
    old.schema_version = '1.0.0';
    expect(issuesOf(old).join('\n')).toMatch(/\/schema_version must be equal to constant/);
  });

  it('rejeita status Horizons fora do enum, inclusive o antigo texto livre', () => {
    const bad = fresh();
    bad.provenance.horizons_validation.status = 'cross-validated';
    expect(issuesOf(bad).join('\n')).toMatch(/\/provenance\/horizons_validation\/status must be equal to one of the allowed values/);
  });

  it('aplica as regras que o schema expressa: PSR marcado tem distância 0 e ponto eliminado tem índice 0', () => {
    const psr = fresh();
    const floor = psr.sites.find((s: Json) => s.center.is_psr);
    floor.center.psr_distance_m = null;
    expect(issuesOf(psr).join('\n')).toMatch(/psr_distance_m must be equal to constant/);

    const eliminated = fresh();
    eliminated.sites[0].engineering_summary.score.eliminated = true;
    eliminated.sites[0].engineering_summary.score.elimination_reasons = ['slope_above_clps_limit'];
    expect(issuesOf(eliminated).join('\n')).toMatch(/score\/total_0_100 must be equal to constant/);

    const reasonsOnly = fresh();
    delete reasonsOnly.sites[0].engineering_summary.score.eliminated;
    expect(issuesOf(reasonsOnly).join('\n')).toMatch(/must have property eliminated when property elimination_reasons is present/);
  });
});

describe('distância até sombra permanente desconhecida (null) nos cálculos da página', () => {
  const site = parseNavigatorDataset(datasetJson).sites.find((s) => s.center.psr_distance_m === null)!;

  it('não interpola uma distância desconhecida com valores conhecidos', () => {
    const terrain = interpolateLocalGrid(site, 0.3, -0.2);
    expect(terrain.psrDistanceM).toBeNull();
  });

  it('distância desconhecida não recebe pontos de proximidade; dentro de PSR recebe 15, como em scoring.py', () => {
    const args = [2, 0.5, 100, 40, 100] as const;
    expect(computeCompositeScore(...args, null, false, DEFAULT_CONFIG.weights, true).science_psr_0_100).toBe(0);
    expect(computeCompositeScore(...args, null, true, DEFAULT_CONFIG.weights, true).science_psr_0_100).toBe(15);
    expect(computeCompositeScore(...args, 500, false, DEFAULT_CONFIG.weights, true).science_psr_0_100).toBe(100);
  });
});
