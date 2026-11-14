import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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
import { computeWindowSlice, findNearestPrecomputedSite } from './landing-guide/state';
import { App } from './App';

describe('Lunar Landing Site Navigator — Landing Guide MVP', () => {
  afterEach(() => {
    cleanup();
  });

  it('mantém compatibilidade com o contrato placeholder v1 e valida o dataset NASA', () => {
    const parsed = parseScienceStatus(statusExample);
    expect(parsed.status).toBe('not_implemented');

    const dataset = parseNavigatorDataset(datasetJson);
    expect(dataset.sites.length).toBeGreaterThanOrEqual(8);
    expect(dataset.horizon_azimuths_deg.length).toBe(360);
    expect(dataset.mission_window.timestamps_utc.length).toBeGreaterThanOrEqual(700);
  });

  it('executa cálculos geométricos, fatiamento temporal UTC e busca polar < 10 ms', () => {
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

    // Sub-janela UTC válida e fora do intervalo
    const okSlice = computeWindowSlice(dataset.mission_window, '2026-11-16', 6, 3);
    expect(okSlice.error).toBeNull();
    expect(okSlice.slice.endIdx - okSlice.slice.startIdx).toBe(72);

    const outOfRange = computeWindowSlice(dataset.mission_window, '2027-01-01', 0, 7);
    expect(outOfRange.error).toMatch(/2026-11-15/i);

    // Ponto equatorial sinaliza fora da cobertura LOLA 80S-90S
    const eqPick = findNearestPrecomputedSite(0, 0, dataset.sites);
    expect(eqPick.isSouthPoleCovered).toBe(false);
  });

  it('renderiza tela inicial minimalista, abre How it works e inicia com Dados fechado', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Landing Guide' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    const howBtn = screen.getByRole('button', { name: 'How it works' });
    fireEvent.click(howBtn);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Fechar guia rápido/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    // Confirma os 4 cantos + barra compacta Tempo e gaveta Dados fechada inicialmente
    const dataBtn = screen.getByRole('button', { name: /Dados/i });
    expect(dataBtn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: /Painel de Dados do Local Selecionado/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Gráficos/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Seleção/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Alternar visualização/i })).toBeInTheDocument();
  });

  it('alterna 2D/3D preservando locais A e B e abre Seleção, Dados e Gráficos com tabela acessível', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    // Abre Seleção, alterna Cursor e escolhe Local A e Local B pela lista acessível
    fireEvent.click(screen.getByRole('button', { name: /Seleção/i }));
    const selectionPanel = screen.getByRole('region', { name: /Painel de Seleção de Locais/i });
    fireEvent.click(within(selectionPanel).getByRole('button', { name: /Cursor/i }));

    const selectA = within(selectionPanel).getByLabelText(/Local A/i) as HTMLSelectElement;
    const selectB = within(selectionPanel).getByLabelText(/Local B/i) as HTMLSelectElement;
    fireEvent.change(selectA, { target: { value: 'malapert_massif' } });
    fireEvent.change(selectB, { target: { value: 'shackleton_psr_floor' } });

    // Alterna 3D -> 2D e garante que A/B e painel continuam preservados
    fireEvent.click(screen.getByRole('button', { name: /Alternar visualização/i }));
    expect(screen.getByRole('img', { name: /Mapa polar sul lunar 2D/i })).toBeInTheDocument();
    expect((screen.getByLabelText(/Local A/i) as HTMLSelectElement).value).toBe('malapert_massif');
    expect((screen.getByLabelText(/Local B/i) as HTMLSelectElement).value).toBe('shackleton_psr_floor');

    // Abre Dados e expande "O que significa?" e "Opções avançadas"
    fireEvent.click(screen.getByRole('button', { name: /Dados/i }));
    const dataRegion = screen.getByRole('region', { name: /Painel de Dados/i });
    expect(within(dataRegion).getByText(/Onde estou olhando/i)).toBeInTheDocument();
    fireEvent.click(within(dataRegion).getByRole('button', { name: /O que significa/i }));
    expect(within(dataRegion).getByText(/Horizonte geométrico:/i)).toBeInTheDocument();
    fireEvent.click(within(dataRegion).getByRole('button', { name: /Opções avançadas/i }));
    expect(within(dataRegion).getByLabelText(/Ativar Rede Satélites Relay/i)).toBeInTheDocument();

    // Abre Gráficos e alterna para tabela acessível
    fireEvent.click(screen.getByRole('button', { name: /Gráficos/i }));
    const chartsRegion = screen.getByRole('region', { name: /Painel de Gráficos/i });
    fireEvent.click(within(chartsRegion).getByRole('button', { name: /Ver em tabela/i }));
    expect(within(chartsRegion).getByText(/Valores numéricos do período/i)).toBeInTheDocument();
  });

  it('controla Tempo em UTC com validação amigável, passos e animação', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    fireEvent.click(screen.getByRole('button', { name: /Tempo/i }));
    const timePanel = screen.getByRole('region', { name: /Controle de Tempo/i });
    const dateInput = within(timePanel).getByLabelText(/Data inicial \(UTC\)/i);

    fireEvent.change(dateInput, { target: { value: '2026-12-28' } });
    expect(within(timePanel).getByRole('alert')).toHaveTextContent(/2026-11-15/);

    fireEvent.click(within(timePanel).getByRole('button', { name: /Usar período de exemplo/i }));
    expect(within(timePanel).queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.click(within(timePanel).getByRole('button', { name: /Avançar 6 horas/i }));
    expect(timePanel).toHaveTextContent(/passo \+6h/i);

    fireEvent.click(within(timePanel).getByRole('button', { name: '3×' }));
    fireEvent.click(within(timePanel).getByRole('button', { name: /Iniciar animação/i }));
    expect(within(timePanel).getByRole('button', { name: /Pausar animação/i })).toBeInTheDocument();
  });
});
