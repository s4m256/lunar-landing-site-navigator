import React from 'react';
import { formatDeg, formatHours, formatNumber, formatPct } from './format';
import { horizonState } from './horizonState';
import { DEFAULT_CONFIG, LiveScore, LiveSiteAnalysis, psrSearchFoundNothing } from './math';
import { PairComparison } from './PairComparison';
import { EngineeringConfig, LandingSiteEntry, PanelMode, RelayPresets } from './types';

interface SiteRow {
  site: LandingSiteEntry;
  /** Always evaluated at the site centre, the only point with every series in the file. */
  analysis: LiveSiteAnalysis;
}

interface SiteComparisonPanelProps {
  /** Every site, in file order, evaluated at its centre. */
  rows: SiteRow[];
  selectedSiteId: string;
  config: EngineeringConfig;
  /** Slope value recorded in the file conventions (no cited source). */
  slopeLimitDeg: number;
  /** conventions.psr_search_radius_m; undefined when the file does not declare it. */
  psrSearchRadiusM?: number;
  relayPresets: RelayPresets;
  windowLabel: string;
  /** File time axis and the period chosen in section 1 (used by the A × B comparison). */
  timestamps: string[];
  stepSeconds: number;
  startIdx: number;
  endIdx: number;
  /** null when the requested instant has no sample. */
  epochIdx: number | null;
  utcLabel: string | null;
  onSelectSite: (siteId: string) => void;
  onChangeConfig: (next: EngineeringConfig) => void;
}

function scoreText(score: LiveScore, slopeLimitDeg: number): string {
  if (score.total_0_100 !== null && score.eliminated) {
    return `0 de 100 (eliminado: declive acima de ${formatDeg(slopeLimitDeg, 0)})`;
  }
  if (score.total_0_100 !== null) return `${formatNumber(score.total_0_100, 1)} de 100`;
  return score.unavailableReason === 'zero_weights' ? 'sem índice (todos os pesos em zero)' : 'sem índice';
}

/** Short value for table cells: the number, "0 (eliminado)" or "sem índice". */
function scoreCell(total: number | null, eliminated: boolean): string {
  if (total === null) return 'sem índice';
  return eliminated ? '0 (eliminado)' : formatNumber(total, 1);
}

/** "até 5,2 km" from conventions.psr_search_radius_m, or a plain phrase when the file omits it. */
export function psrSearchExtent(radiusM: number | undefined): string {
  return radiusM === undefined ? 'na busca do gerador' : `até ${formatNumber(radiusM / 1000, 1)} km`;
}

function psrText(row: SiteRow, radiusM: number | undefined): string {
  if (row.analysis.terrain.isPsr) return 'dentro (marcado no arquivo)';
  const distance = row.analysis.terrain.psrDistanceM;
  if (psrSearchFoundNothing(row.site) || distance === null) return `nenhuma encontrada ${psrSearchExtent(radiusM)}`;
  return `${formatNumber(distance, 0)} m`;
}

const stateWord = (el: number, ref: number) => (horizonState(el, ref) === 'above' ? 'acima' : 'não está acima');

export const SiteComparisonPanel: React.FC<SiteComparisonPanelProps> = ({
  rows,
  selectedSiteId,
  config,
  slopeLimitDeg,
  psrSearchRadiusM,
  relayPresets,
  windowLabel,
  timestamps,
  stepSeconds,
  startIdx,
  endIdx,
  epochIdx,
  utcLabel,
  onSelectSite,
  onChangeConfig,
}) => {
  const updateWeight = (key: keyof EngineeringConfig['weights'], value: number) => {
    onChangeConfig({ ...config, weights: { ...config.weights, [key]: value } });
  };
  const ranked = [...rows].sort((a, b) => (b.analysis.score.total_0_100 ?? -1) - (a.analysis.score.total_0_100 ?? -1));
  const selectedRow = rows.find((r) => r.site.id === selectedSiteId);
  const constellation = relayPresets.elfo_constellation;
  const weightsAreDefault = (Object.keys(DEFAULT_CONFIG.weights) as Array<keyof EngineeringConfig['weights']>).every(
    (k) => config.weights[k] === DEFAULT_CONFIG.weights[k],
  );

  const siteButton = (site: LandingSiteEntry) => {
    const selected = site.id === selectedSiteId;
    return (
      <>
        <button type="button" className="link-btn" aria-pressed={selected} onClick={() => onSelectSite(site.id)}>
          {site.name}
        </button>
        {selected && <span className="site-cat-sub">selecionado</span>}
      </>
    );
  };

  return (
    <div className="comparison-stack">
      <section className="panel table-panel" aria-labelledby="comparacao-titulo">
        <h2 id="comparacao-titulo">7. Comparar os locais</h2>

        <PairComparison
          rows={rows}
          initialSiteId={selectedSiteId}
          timestamps={timestamps}
          stepSeconds={stepSeconds}
          startIdx={startIdx}
          endIdx={endIdx}
          epochIdx={epochIdx}
          slopeLimitDeg={slopeLimitDeg}
          psrSearchRadiusM={psrSearchRadiusM}
        />

        <h3 id="comparacao-instante">Todos os locais no instante exibido{utcLabel ? ` (${utcLabel})` : ''}</h3>
        {epochIdx === null ? (
          <p className="state-missing">Sem amostra para o instante pedido: nenhum valor é comparado.</p>
        ) : (
          <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="comparacao-instante">
            <table className="ranking-table">
              <caption className="sr-only">
                Sol e Terra no centro de cada local, no mesmo instante, na ordem do arquivo
              </caption>
              <thead>
                <tr>
                  <th scope="col">Local</th>
                  <th scope="col">Sol: elevação do centro</th>
                  <th scope="col">Sol x relevo</th>
                  <th scope="col">Terra: elevação do centro</th>
                  <th scope="col">Terra x relevo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const st = row.analysis.epochStates[epochIdx];
                  const sunEl = row.site.sky_series.sun_el_deg[epochIdx];
                  const earthEl = row.site.sky_series.earth_el_deg[epochIdx];
                  return (
                    <tr key={row.site.id} className={row.site.id === selectedSiteId ? 'row-selected' : ''}>
                      <th scope="row">{siteButton(row.site)}</th>
                      <td className="mono-cell">{formatDeg(sunEl)}</td>
                      <td>{stateWord(sunEl, st.horizonAtSunDeg)}</td>
                      <td className="mono-cell">{formatDeg(earthEl)}</td>
                      <td>{stateWord(earthEl, st.horizonAtEarthDeg)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <h3 id="comparacao-periodo">Todos os locais no período inteiro do arquivo ({windowLabel})</h3>
        <p className="field-help">
          Valores no centro de cada local. O <strong>índice ilustrativo</strong> (0 a 100) soma declive, luz do Sol,
          linha de visada e proximidade de sombra permanente com os pesos de “Opções avançadas”. Pesos e limites vêm do
          gerador de dados e não têm fonte citada: serve para explorar escolhas, não para recomendar um local nem medir
          segurança de pouso.
        </p>
        {selectedRow && (
          <p className="score-hero-pill" role="status">
            Índice ilustrativo de {selectedRow.site.name}: <strong>{scoreText(selectedRow.analysis.score, slopeLimitDeg)}</strong>{' '}
            <span>
              (partes: declive {formatNumber(selectedRow.analysis.score.safety_slope_0_100, 0)}, luz do Sol{' '}
              {formatNumber(selectedRow.analysis.score.power_0_100, 0)}, linha de visada{' '}
              {selectedRow.analysis.score.comms_0_100 === null ? 'sem dado' : formatNumber(selectedRow.analysis.score.comms_0_100, 0)},
              sombra permanente {formatNumber(selectedRow.analysis.score.science_psr_0_100, 0)}
              {config.relayEnabled ? '; inclui o cenário hipotético de retransmissores' : ''})
              {config.relayEnabled && selectedRow.analysis.score.totalWithoutRelay_0_100 !== null && (
                <> Sem os retransmissores: {scoreCell(selectedRow.analysis.score.totalWithoutRelay_0_100, selectedRow.analysis.score.eliminated)}.</>
              )}
            </span>
          </p>
        )}
        <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="comparacao-periodo">
          <table className="ranking-table">
            <caption className="sr-only">Locais ordenados pelo índice ilustrativo, valores no centro de cada local</caption>
            <thead>
              <tr>
                <th scope="col">Ordem pelo índice</th>
                <th scope="col">Local</th>
                <th scope="col">Declive no centro</th>
                <th scope="col">Distância até sombra permanente</th>
                <th scope="col">Disco solar acima do relevo, em média</th>
                <th scope="col">Maior intervalo com o disco solar todo abaixo do relevo</th>
                <th scope="col">Tempo com visada direta para a Terra</th>
                {config.relayEnabled && <th scope="col">Tempo com Terra ou constelação hipotética</th>}
                <th scope="col">Índice ilustrativo</th>
                {config.relayEnabled && <th scope="col">Índice sem os retransmissores</th>}
              </tr>
            </thead>
            <tbody>
              {ranked.map((row, idx) => {
                const { site, analysis } = row;
                const steep = analysis.terrain.slopeDeg > slopeLimitDeg;
                return (
                  <tr key={site.id} className={site.id === selectedSiteId ? 'row-selected' : ''}>
                    <td>{analysis.score.total_0_100 === null ? '—' : idx + 1}</td>
                    <th scope="row">{siteButton(site)}</th>
                    <td>
                      <span className={`hazard-pill ${steep ? 'hazard-warn' : ''}`}>
                        {formatDeg(analysis.terrain.slopeDeg, 1)} ({steep ? 'acima de' : 'até'} {formatDeg(slopeLimitDeg, 0)})
                      </span>
                    </td>
                    <td className="mono-cell">{psrText(row, psrSearchRadiusM)}</td>
                    <td className="mono-cell">{formatPct(analysis.solar.meanIllumFraction * 100)}</td>
                    <td className="mono-cell">{formatHours(analysis.solar.maxContinuousShadowHours)}</td>
                    <td className="mono-cell">{formatPct(analysis.comms.dteDutyCyclePct)}</td>
                    {config.relayEnabled && <td className="mono-cell">{formatPct(analysis.comms.combinedDutyCyclePct)}</td>}
                    <td className="mono-cell">
                      <strong>{scoreCell(analysis.score.total_0_100, analysis.score.eliminated)}</strong>
                    </td>
                    {config.relayEnabled && (
                      <td className="mono-cell">{scoreCell(analysis.score.totalWithoutRelay_0_100, analysis.score.eliminated)}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ul className="field-help notes-list">
          <li>
            {formatDeg(slopeLimitDeg, 0)} é o valor de referência de declive gravado no arquivo, sem fonte citada. Acima
            dele, o índice desta página vale 0 (“eliminado”); isso não é um critério de segurança. O declive do arquivo usa
            uma base de 160 m e pode ser maior na escala de um módulo de pouso.
          </li>
          <li>
            “Nenhuma encontrada {psrSearchExtent(psrSearchRadiusM)}”: a busca do gerador não achou sombra permanente e o
            arquivo não tem distância para esse local (valor vazio). O índice não dá pontos de proximidade nesse caso.
          </li>
          <li>
            Luz do Sol e linha de visada se referem só ao período do arquivo ({windowLabel}); não representam outras
            épocas do ano. Veja “Origem e limitações dos dados”.
          </li>
        </ul>
      </section>

      <section className="panel controls-panel" aria-labelledby="avancadas-titulo">
        <h2 id="avancadas-titulo">Opções avançadas</h2>
        <p className="field-help">
          Estes ajustes mudam as estimativas de energia, a linha de visada e o índice ilustrativo. Os valores iniciais
          são os do gerador de dados, sem fonte citada: exemplos, não recomendações.
        </p>
        <div className="controls-grid">
          <div className="control-card">
            <h3>Painel solar e bateria</h3>
            <label>
              Posição do painel
              <select value={config.panelMode} onChange={(e) => onChangeConfig({ ...config, panelMode: e.target.value as PanelMode })}>
                <option value="tracking">Vertical, girando para acompanhar o Sol</option>
                <option value="fixed_north">Vertical fixo, voltado para o norte</option>
                <option value="fixed_horiz">Horizontal fixo, no topo do módulo</option>
              </select>
            </label>
            <label>
              Área do painel: <strong>{formatNumber(config.panelAreaM2, 1)} m²</strong>
              <input
                type="range"
                min={1}
                max={20}
                step={0.5}
                value={config.panelAreaM2}
                onChange={(e) => onChangeConfig({ ...config, panelAreaM2: Number(e.target.value) })}
              />
            </label>
            <label>
              Eficiência do painel: <strong>{formatNumber(config.panelEfficiency * 100, 0)}%</strong>
              <input
                type="range"
                min={0.18}
                max={0.36}
                step={0.01}
                value={config.panelEfficiency}
                onChange={(e) => onChangeConfig({ ...config, panelEfficiency: Number(e.target.value) })}
              />
            </label>
            <label>
              Consumo mínimo durante a sombra: <strong>{config.survivalLoadW} W</strong>
              <input
                type="range"
                min={40}
                max={300}
                step={10}
                value={config.survivalLoadW}
                onChange={(e) => onChangeConfig({ ...config, survivalLoadW: Number(e.target.value) })}
              />
            </label>
          </div>

          <div className="control-card">
            <h3>Linha de visada</h3>
            <label>
              Quando a Terra conta como visível
              <select
                value={config.dteMarginMode}
                onChange={(e) => onChangeConfig({ ...config, dteMarginMode: e.target.value as 'full_disk' | 'center' })}
              >
                <option value="full_disk">Disco inteiro da Terra acima do relevo</option>
                <option value="center">Centro da Terra acima do relevo</option>
              </select>
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={config.relayEnabled}
                onChange={(e) => onChangeConfig({ ...config, relayEnabled: e.target.checked })}
              />
              <span>Incluir o cenário hipotético de satélites retransmissores</span>
            </label>
            <div className="orbit-spec-note">
              <p>
                Cenário modelado no arquivo, <strong>não é uma constelação em operação</strong>. Nome no arquivo:{' '}
                <q lang="en">{constellation.name}</q>; {constellation.satellites_count} satélites, semieixo maior{' '}
                {formatNumber(constellation.a_km, 0)} km, excentricidade {formatNumber(constellation.e, 2)}, inclinação{' '}
                {formatDeg(constellation.i_deg, 1)}, período {formatNumber(constellation.period_hours, 1)} h. As fases
                iniciais dos satélites são arbitrárias.
              </p>
              <p>
                Altura mínima acima do relevo usada no arquivo: {formatDeg(config.antennaMaskDeg, 0)}. Ela não pode ser
                alterada aqui porque a visibilidade da constelação foi gravada com esse valor.
              </p>
            </div>
          </div>

          <div className="control-card">
            <h3>Pesos do índice ilustrativo</h3>
            <label>
              Declive do terreno: <strong>{Math.round(config.weights.safety * 100)}%</strong>
              <input type="range" min={0} max={1} step={0.05} value={config.weights.safety} onChange={(e) => updateWeight('safety', Number(e.target.value))} />
            </label>
            <label>
              Luz do Sol e sombra: <strong>{Math.round(config.weights.power * 100)}%</strong>
              <input type="range" min={0} max={1} step={0.05} value={config.weights.power} onChange={(e) => updateWeight('power', Number(e.target.value))} />
            </label>
            <label>
              Linha de visada: <strong>{Math.round(config.weights.comms * 100)}%</strong>
              <input type="range" min={0} max={1} step={0.05} value={config.weights.comms} onChange={(e) => updateWeight('comms', Number(e.target.value))} />
            </label>
            <label>
              Proximidade de sombra permanente: <strong>{Math.round(config.weights.science_psr * 100)}%</strong>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={config.weights.science_psr}
                onChange={(e) => updateWeight('science_psr', Number(e.target.value))}
              />
            </label>
            <button
              type="button"
              className="btn btn-small"
              disabled={weightsAreDefault}
              onClick={() => onChangeConfig({ ...config, weights: { ...DEFAULT_CONFIG.weights } })}
            >
              Restaurar pesos iniciais
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
