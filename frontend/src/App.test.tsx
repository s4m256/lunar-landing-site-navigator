import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import statusExample from '../../contracts/examples/science-status.json';
import syntheticJson from '../../contracts/examples/navigator-dataset.synthetic.json';
import { validateDataset } from './datasetLoader';
import datasetJson from './data/south_pole_precomputed.v1.json';
import { parseNavigatorDataset, parseScienceStatus } from './contract';
import {
  computeSolarIllumFraction,
  DEFAULT_CONFIG,
  evaluateLiveSite,
  initialConfig,
  interpolateHorizon,
  interpolateLocalGrid,
} from './navigator/math';
import { ANIMATION_STEP_MS, App } from './App';

const dataset = parseNavigatorDataset(datasetJson);
const renderApp = () => render(<App dataset={dataset} />);
const summary = () => within(screen.getByTestId('instant-summary'));
const setInstant = (value: string) =>
  fireEvent.change(screen.getByLabelText('Data e hora do instante'), { target: { value } });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Contrato e cálculos', () => {
  it('mantém compatibilidade com o contrato placeholder v1', () => {
    expect(parseScienceStatus(statusExample).status).toBe('not_implemented');
  });

  it('valida o dataset pré-computado real contra navigator-dataset.v1.schema.json', () => {
    expect(dataset.sites.length).toBeGreaterThanOrEqual(8);
    expect(dataset.horizon_azimuths_deg.length).toBe(360);
    expect(dataset.mission_window.timestamps_utc.length).toBeGreaterThanOrEqual(700);
  });

  it('executa cálculos geométricos e interpolação local', () => {
    expect(computeSolarIllumFraction(-0.5, 0, 0.267)).toBe(0);
    expect(computeSolarIllumFraction(0, 0, 0.267)).toBeCloseTo(0.5, 5);
    expect(computeSolarIllumFraction(0.5, 0, 0.267)).toBe(1);
    expect(interpolateHorizon(359.5, [0, 180], [2, -2])).toBeCloseTo(1.988888, 3);

    const site = dataset.sites[0];
    const terrain = interpolateLocalGrid(site, 0.25, -0.5);
    const noRelay = { ...DEFAULT_CONFIG, relayEnabled: false };
    const live = evaluateLiveSite(site, 0.25, -0.5, dataset.horizon_azimuths_deg, dataset.mission_window, noRelay);
    expect(terrain.horizonElevDeg.length).toBe(360);
    expect(live.score.total_0_100).toBeGreaterThanOrEqual(0);
    expect(live.score.total_0_100).toBeLessThanOrEqual(100);
  });

  it('fora do centro não inventa visibilidade de retransmissores: o valor fica nulo', () => {
    const site = dataset.sites[0];
    const args = [dataset.horizon_azimuths_deg, dataset.mission_window, DEFAULT_CONFIG] as const;
    const center = evaluateLiveSite(site, 0, 0, ...args);
    const off = evaluateLiveSite(site, 0.25, -0.5, ...args);
    expect(center.comms.combinedDutyCyclePct).not.toBeNull();
    expect(center.score.total_0_100).not.toBeNull();
    expect(off.epochStates.every((s) => s.elfoConstellationVisible === null && s.lroVisible === null)).toBe(true);
    expect(off.comms.combinedDutyCyclePct).toBeNull();
    expect(off.score.total_0_100).toBeNull();
    expect(off.score.unavailableReason).toBe('relay_unknown_off_center');
  });

  it('no centro, com os padrões do gerador, reproduz o índice gravado onde a regra não mudou (contrato 1.1.0)', () => {
    // The migrated file keeps the 1.0.0 scores; the page applies the 1.1.0 rule, which gives no proximity
    // credit when the PSR distance is unknown (null). That is the only rule change that touches site centres.
    expect(dataset.provenance.migration?.stored_scores_rule).toBe('1.0.0');
    let unknownDistance = 0;
    for (const site of dataset.sites) {
      const live = evaluateLiveSite(site, 0, 0, dataset.horizon_azimuths_deg, dataset.mission_window, DEFAULT_CONFIG);
      const stored = site.engineering_summary.score;
      if (!site.center.is_psr && site.center.psr_distance_m === null) {
        unknownDistance += 1;
        expect(live.score.science_psr_0_100).toBe(0);
        const without = stored.total_0_100 - DEFAULT_CONFIG.weights.science_psr * stored.science_psr_0_100;
        expect(live.score.total_0_100).toBeCloseTo(without, 0);
      } else {
        expect(live.score.total_0_100).toBeCloseTo(stored.total_0_100, 0);
      }
    }
    expect(unknownDistance).toBe(1);
  });

  it('a página começa sem o cenário hipotético de retransmissores e com a máscara do arquivo', () => {
    const cfg = initialConfig(dataset);
    expect(cfg.relayEnabled).toBe(false);
    expect(cfg.antennaMaskDeg).toBe(dataset.relay_presets.elfo_pathfinder.antenna_mask_deg);
  });
});

describe('Interface: seleção, estados e rótulos honestos', () => {
  it('tem estrutura navegável por teclado: link para pular, título, seções e controles rotulados', () => {
    renderApp();
    expect(screen.getByRole('link', { name: 'Pular para o conteúdo' })).toHaveAttribute('href', '#conteudo');
    expect(screen.getByRole('heading', { level: 1, name: 'Lunar Landing Site Navigator' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'conteudo');
    for (const name of [/1\. Escolha/, /2\. Resumo do instante/, /3\. Céu visto de/, /4\. Mapa/, /5\. Luz do Sol/, /6\. Valores em tabela/, /7\. Comparar/]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
    const controls = [...screen.getAllByRole('slider'), ...screen.getAllByRole('combobox'), ...screen.getAllByRole('checkbox')];
    for (const control of controls) expect(control).toHaveAccessibleName();
    for (const button of screen.getAllByRole('button')) expect(button).toHaveAccessibleName();
    expect(screen.getByLabelText('Início do período')).toHaveAttribute('type', 'datetime-local');
    expect(screen.getByLabelText('Fim do período')).toHaveAttribute('type', 'datetime-local');
  });

  it('gráficos e mapas têm alternativa textual', () => {
    renderApp();
    for (const img of screen.getAllByRole('img')) {
      expect(img).toHaveAccessibleName();
      expect(img).toHaveAccessibleDescription();
    }
    expect(screen.getByRole('img', { name: /Mapa estereográfico do Polo Sul Lunar/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Perfil de horizonte lunar 360 graus/ })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Locais do mapa' })).toBeInTheDocument();
  });

  it('mostra o estado do Sol e da Terra em texto e trata elevação exatamente 0 como "não acima" (dado real)', () => {
    renderApp();
    // Mons Mouton Plateau, 10/12/2026 23:00 UTC: a elevação da Terra no arquivo é exatamente 0.
    fireEvent.change(screen.getByLabelText('Local'), { target: { value: 'mons_mouton_plateau' } });
    setInstant('2026-12-10T23:00');
    expect(dataset.sites[2].sky_series.earth_el_deg[623]).toBe(0);
    expect(summary().getByText(/^Centro da Terra não está acima do horizonte idealizado;/)).toBeInTheDocument();
    const table = summary().getByRole('table');
    const idealCells = within(within(table).getByRole('row', { name: /horizonte idealizado/ })).getAllByRole('cell');
    expect(idealCells[1]).toHaveTextContent('Não está acima'); // Terra column (Sol is column 0)
    const elevationCells = within(within(table).getByRole('row', { name: /Elevação do centro/ })).getAllByRole('cell');
    expect(elevationCells[1]).toHaveTextContent(/^0°$/);
    expect(screen.getByTestId('instant-summary')).toHaveTextContent('Mons Mouton Plateau, 10/12/2026 23:00 UTC.');
  });

  it('instante sem amostra não mostra números nem usa a amostra vizinha (CA-6)', () => {
    renderApp();
    setInstant('2026-11-15T03:30');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não há amostra para 15/11/2026 03:30 UTC. O arquivo tem um instante a cada 1 h',
    );
    expect(summary().getByText('Sem amostra para este local e instante.')).toBeInTheDocument();
    expect(summary().queryByText(/°/)).not.toBeInTheDocument();
    expect(screen.getByText('nenhum instante (sem amostra)')).toBeInTheDocument();
    expect(screen.getByText(/Sem amostra para o instante pedido: nenhum valor é comparado/)).toBeInTheDocument();

    setInstant('2027-01-01T00:00');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'O arquivo só tem instantes de 15/11/2026 00:00 UTC a 15/12/2026 00:00 UTC.',
    );

    // Choosing an instant with another control clears the stale typed value and its error.
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao início do período' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Data e hora do instante')).toHaveValue('2026-11-15T00:00');
    expect(screen.getByTestId('instant-summary')).toHaveTextContent(', 15/11/2026 00:00 UTC.');

    setInstant('2026-11-15T04:00');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('instant-summary')).toHaveTextContent(', 15/11/2026 04:00 UTC.');
  });

  it('rotula o índice como ilustrativo e o relay como hipotético; relay começa desligado', () => {
    renderApp();
    expect(screen.queryByText(/Landing Score/i)).not.toBeInTheDocument();
    const scoreBefore = screen.getByRole('status');
    expect(scoreBefore).toHaveTextContent(/Índice ilustrativo de/);
    const before = scoreBefore.textContent;

    const relay = screen.getByLabelText('Incluir o cenário hipotético de satélites retransmissores');
    expect(relay).not.toBeChecked();
    fireEvent.change(screen.getByLabelText('Local'), { target: { value: 'shackleton_psr_floor' } });
    const shackletonBefore = screen.getByRole('status').textContent;
    expect(shackletonBefore).not.toEqual(before);
    fireEvent.click(relay);
    expect(screen.getByRole('status').textContent).not.toEqual(shackletonBefore);
    expect(screen.getByRole('status')).toHaveTextContent(/inclui o cenário hipotético de retransmissores/);
    expect(screen.getByText(/não é uma constelação em operação/)).toBeInTheDocument();
  });

  it('com todos os pesos em zero não mostra número de índice', () => {
    renderApp();
    for (const name of [/Declive do terreno/, /Luz do Sol e sombra/, /Linha de visada:/, /Proximidade de sombra permanente/]) {
      fireEvent.change(screen.getByRole('slider', { name }), { target: { value: '0' } });
    }
    expect(screen.getByRole('status')).toHaveTextContent('sem índice (todos os pesos em zero)');
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar pesos iniciais' }));
    expect(screen.getByRole('status')).toHaveTextContent(/de 100/);
  });

  it('declive acima do limite do arquivo zera o índice do ponto da grade (regra 1.1.0), sem usar o índice gravado', () => {
    const limit = dataset.provenance.conventions.clps_slope_limit_deg;
    const site = dataset.sites.find((s) => s.local_grid.nodes.some((n) => n.slope_deg > limit))!;
    const steep = site.local_grid.nodes.find((n) => n.slope_deg > limit)!;
    expect(steep.landing_score_0_100).toBeGreaterThan(0); // stored 1.0.0 value, not eliminated
    renderApp();
    fireEvent.change(screen.getByLabelText('Local'), { target: { value: site.id } });
    const table = screen.getByRole('table', { name: /Pontos da grade local de/ });
    const signedM = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(0)}`;
    const row = within(table)
      .getAllByRole('row')
      .find((r) => {
        const cells = within(r).queryAllByRole('cell');
        return cells.length > 0 && cells[0].textContent === signedM(steep.dx_m) && cells[1].textContent === signedM(steep.dy_m);
      })!;
    const cells = within(row).getAllByRole('cell');
    expect(cells[6]).toHaveTextContent(/^0$/);
  });

  it('mostra o marcador de "sombra permanente não encontrada" como texto, não como distância', () => {
    renderApp();
    const period = screen.getByRole('region', { name: /No período inteiro do arquivo/ });
    const row = within(period).getByRole('row', { name: /de Gerlache Rim 2/ });
    expect(row).toHaveTextContent('nenhuma encontrada até 5,2 km');
    expect(row).not.toHaveTextContent('5200 m');
  });

  it('painel de origem e limitações visível: período real, sem afirmar validação', () => {
    renderApp();
    const panel = screen.getByRole('region', { name: 'Origem e limitações dos dados' });
    expect(panel).toBeVisible();
    expect(panel).toHaveTextContent('De 15/11/2026 00:00 UTC a 15/12/2026 00:00 UTC (30 dias), 721 instantes, um a cada 1 h');
    expect(panel).toHaveTextContent('Comparação com o JPL Horizons (auditoria). Comparação não confirmada');
    expect(panel).toHaveTextContent('Sem conferência com o Skyfield (auditoria)');
    expect(panel).toHaveTextContent(/Índice ilustrativo/);
    expect(panel).toHaveTextContent(/Retransmissores hipotéticos/);
    expect(panel).toHaveTextContent(/perto do verão do hemisfério sul da Lua/);
    // The file's own label is shown as a code value next to its plain-language meaning, never as a verdict.
    const label = within(panel).getByText('unverified_no_raw_response');
    expect(label.tagName).toBe('CODE');
    expect(panel).toHaveTextContent('Tolerância declarada: nenhuma; respostas brutas guardadas: 0');
    expect(panel).toHaveTextContent(/Convertido da versão 1\.0\.0 do contrato .* sem recalcular números/);
    expect(panel).toHaveTextContent(/mais curto que um ciclo de estações da Lua/);
    expect(screen.getByRole('banner')).toHaveTextContent('Dados disponíveis de 15/11/2026 00:00 UTC a 15/12/2026 00:00 UTC');
    expect(screen.getByRole('banner')).not.toHaveTextContent(/verified|verificad|validad/i);
    expect(within(panel).getByRole('link', { name: /Licenças do código de terceiros/ })).toHaveAttribute(
      'href',
      '/third-party-licenses.txt',
    );
  });

  it('renderiza um arquivo 1.1.0 nativo (exemplo sintético) sem tratá-lo como o arquivo auditado', () => {
    render(<App dataset={validateDataset(syntheticJson)} />);
    const panel = screen.getByRole('region', { name: 'Origem e limitações dos dados' });
    expect(panel).toHaveTextContent('não é o arquivo revisado pela auditoria científica SPA-9');
    expect(panel).toHaveTextContent('dentro da tolerância declarada de 0,0010° (5 instantes)');
    expect(panel).not.toHaveTextContent('Migração de versão');
    expect(panel).not.toHaveTextContent('Sem conferência com o Skyfield');
  });

  it('animação só começa por ação do usuário, pode ser pausada e fica mais lenta com movimento reduzido', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query }));
    renderApp();
    const slider = screen.getByRole('slider', { name: 'Linha do tempo do período' });
    expect(slider).toHaveValue('0');
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar animação' }));
    act(() => vi.advanceTimersByTime(ANIMATION_STEP_MS.normal * 3));
    expect(slider).toHaveValue('0');
    act(() => vi.advanceTimersByTime(ANIMATION_STEP_MS.reduced));
    expect(slider).toHaveValue('1');
    fireEvent.click(screen.getByRole('button', { name: 'Pausar animação' }));
    act(() => vi.advanceTimersByTime(ANIMATION_STEP_MS.reduced * 3));
    expect(slider).toHaveValue('1');
  });
});
