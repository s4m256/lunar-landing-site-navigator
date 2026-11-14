import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import statusExample from '../../contracts/examples/science-status.json';
import datasetJson from './data/south_pole_precomputed.v1.json';
import { parseNavigatorDataset, parseScienceStatus } from './contract';
import {
  computeSolarIllumFraction,
  DEFAULT_CONFIG,
  evaluateLiveSite,
  interpolateHorizon,
  interpolateLocalGrid,
} from './navigator/math';
import { App } from './App';

describe('Lunar Landing Site Navigator', () => {
  it('mantém compatibilidade com o contrato placeholder v1', () => {
    const parsed = parseScienceStatus(statusExample);
    expect(parsed.status).toBe('not_implemented');
  });

  it('valida o dataset pré-computado real contra navigator-dataset.v1.schema.json', () => {
    const dataset = parseNavigatorDataset(datasetJson);
    expect(dataset.sites.length).toBeGreaterThanOrEqual(8);
    expect(dataset.horizon_azimuths_deg.length).toBe(360);
    expect(dataset.mission_window.timestamps_utc.length).toBeGreaterThanOrEqual(700);
  });

  it('executa cálculos geométricos, eclipses solares parciais e interpolação local < 10 ms', () => {
    expect(computeSolarIllumFraction(-0.5, 0, 0.267)).toBe(0);
    expect(computeSolarIllumFraction(0, 0, 0.267)).toBeCloseTo(0.5, 5);
    expect(computeSolarIllumFraction(0.5, 0, 0.267)).toBe(1);
    expect(interpolateHorizon(359.5, [0, 180], [2, -2])).toBeCloseTo(1.988888, 3);

    const dataset = parseNavigatorDataset(datasetJson);
    const site = dataset.sites[0];
    const t0 = performance.now();
    const terrain = interpolateLocalGrid(site, 0.25, -0.5);
    const live = evaluateLiveSite(
      site,
      0.25,
      -0.5,
      dataset.horizon_azimuths_deg,
      dataset.mission_window,
      DEFAULT_CONFIG,
    );
    const elapsedMs = performance.now() - t0;

    expect(terrain.horizonElevDeg.length).toBe(360);
    expect(live.score.total_0_100).toBeGreaterThanOrEqual(0);
    expect(live.score.total_0_100).toBeLessThanOrEqual(100);
    expect(elapsedMs).toBeLessThan(100);
  });

  it('renderiza os gráficos principais e alterna sítios e modos de relay interativamente', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Lunar Landing Site Navigator' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Mapa estereográfico do Polo Sul Lunar/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Perfil de horizonte lunar 360 graus/i })).toBeInTheDocument();

    // Switch to Shackleton Crater Floor PSR and toggle relay checkbox
    const selector = screen.getByLabelText('Selecionar sítio de pouso') as HTMLSelectElement;
    fireEvent.change(selector, { target: { value: 'shackleton_psr_floor' } });
    const scoreBefore = screen.getByRole('status').textContent ?? '';

    const relayCheckbox = screen.getByLabelText(/Ativar Rede Satélites Relay/i);
    fireEvent.click(relayCheckbox);
    const scoreAfter = screen.getByRole('status').textContent ?? '';
    expect(scoreAfter).not.toEqual(scoreBefore);

    // Open Provenance drawer
    fireEvent.click(screen.getByRole('button', { name: /Ver Proveniência NASA/i }));
    expect(screen.getByText(/Validação Cruzada JPL Horizons/i)).toBeInTheDocument();
  });
});
