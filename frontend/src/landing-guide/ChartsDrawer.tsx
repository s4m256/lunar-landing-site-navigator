import React, { useMemo, useState } from 'react';
import { LiveSiteAnalysis } from '../navigator/math';
import { PolarHorizonSkyPlot } from '../navigator/PolarHorizonSkyPlot';
import {
  EngineeringConfig,
  LandingSiteEntry,
  MissionWindow,
  NavigatorProvenance,
} from '../navigator/types';
import { formatUtcReadable, WindowSlice, WindowSummary } from './state';

interface ChartsDrawerProps {
  siteA: LandingSiteEntry;
  analysisA: LiveSiteAnalysis;
  summaryA: WindowSummary;
  siteB: LandingSiteEntry | null;
  analysisB: LiveSiteAnalysis | null;
  summaryB: WindowSummary | null;
  missionWindow: MissionWindow;
  horizonAzDeg: number[];
  windowSlice: WindowSlice;
  epochIdx: number;
  config: EngineeringConfig;
  provenance: NavigatorProvenance;
  onSelectEpoch: (idx: number) => void;
  onClose: () => void;
}

interface BlackoutInterval {
  startUtc: string;
  endUtc: string;
  hours: number;
}

function extractBlackouts(
  analysis: LiveSiteAnalysis,
  missionWindow: MissionWindow,
  startIdx: number,
  endIdx: number,
  relayEnabled: boolean,
): BlackoutInterval[] {
  const stepHours = missionWindow.step_seconds / 3600;
  const spans: BlackoutInterval[] = [];
  let runStart: number | null = null;

  for (let i = startIdx; i <= endIdx; i++) {
    const st = analysis.epochStates[i];
    const hasLink = relayEnabled ? st.combinedLinkVisible : st.dteVisible;
    if (!hasLink) {
      if (runStart === null) runStart = i;
    } else if (runStart !== null) {
      spans.push({
        startUtc: missionWindow.timestamps_utc[runStart],
        endUtc: missionWindow.timestamps_utc[i - 1],
        hours: (i - runStart) * stepHours,
      });
      runStart = null;
    }
  }
  if (runStart !== null) {
    spans.push({
      startUtc: missionWindow.timestamps_utc[runStart],
      endUtc: missionWindow.timestamps_utc[endIdx],
      hours: (endIdx - runStart + 1) * stepHours,
    });
  }
  return spans;
}

export const ChartsDrawer: React.FC<ChartsDrawerProps> = ({
  siteA,
  analysisA,
  summaryA,
  siteB,
  analysisB,
  summaryB,
  missionWindow,
  horizonAzDeg,
  windowSlice,
  epochIdx,
  config,
  provenance,
  onSelectEpoch,
  onClose,
}) => {
  const [viewTab, setViewTab] = useState<'charts' | 'table'>('charts');
  const [skyTarget, setSkyTarget] = useState<'A' | 'B'>('A');

  const { startIdx, endIdx } = windowSlice;
  const spanCount = Math.max(2, endIdx - startIdx + 1);

  // Construção dos pontos SVG para curvas de luz solar (A sólido âmbar, B tracejado ciano)
  const W = 340;
  const H = 112;
  const PL = 34;
  const PR = 10;
  const PT = 12;
  const PB = 22;
  const plotW = W - PL - PR;
  const plotH = H - PT - PB;

  const toX = (idx: number) => PL + ((idx - startIdx) / Math.max(1, endIdx - startIdx)) * plotW;
  const toY = (pct: number) => PT + (1 - Math.max(0, Math.min(100, pct)) / 100) * plotH;

  const sunPathA = useMemo(() => {
    const pts: string[] = [];
    for (let i = startIdx; i <= endIdx; i++) {
      const x = toX(i);
      const y = toY(analysisA.epochStates[i].fIllum * 100);
      pts.push(`${i === startIdx ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(' ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisA, startIdx, endIdx]);

  const sunPathB = useMemo(() => {
    if (!analysisB) return '';
    const pts: string[] = [];
    for (let i = startIdx; i <= endIdx; i++) {
      const x = toX(i);
      const y = toY(analysisB.epochStates[i].fIllum * 100);
      pts.push(`${i === startIdx ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(' ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisB, startIdx, endIdx]);

  const blackoutsA = useMemo(
    () => extractBlackouts(analysisA, missionWindow, startIdx, endIdx, config.relayEnabled),
    [analysisA, missionWindow, startIdx, endIdx, config.relayEnabled],
  );
  const blackoutsB = useMemo(
    () =>
      analysisB
        ? extractBlackouts(analysisB, missionWindow, startIdx, endIdx, config.relayEnabled)
        : [],
    [analysisB, missionWindow, startIdx, endIdx, config.relayEnabled],
  );

  // Linhas da tabela acessível (amostragem inteligente max ~24 linhas + época atual garantida)
  const tableRows = useMemo(() => {
    const step = Math.max(1, Math.ceil(spanCount / 18));
    const indices: number[] = [];
    for (let i = startIdx; i <= endIdx; i += step) {
      indices.push(i);
    }
    if (epochIdx >= startIdx && epochIdx <= endIdx && !indices.includes(epochIdx)) {
      indices.push(epochIdx);
      indices.sort((a, b) => a - b);
    }
    return indices;
  }, [startIdx, endIdx, spanCount, epochIdx]);

  const activeSkySite = skyTarget === 'B' && siteB ? siteB : siteA;
  const activeSkyAnalysis = skyTarget === 'B' && analysisB ? analysisB : analysisA;
  const clampedEpoch = Math.max(startIdx, Math.min(endIdx, epochIdx));
  const cursorX = toX(clampedEpoch);

  return (
    <aside
      className="floating-panel panel-top-left"
      role="region"
      aria-label="Painel de Gráficos e Comparação Temporal"
    >
      <div className="panel-header">
        <div>
          <h2>Gráficos</h2>
          <p className="panel-sub">
            {formatUtcReadable(missionWindow.timestamps_utc[startIdx]).date} ·{' '}
            {summaryA.durationHours.toFixed(0)}h ({siteB ? 'A vs B' : siteA.name})
          </p>
        </div>
        <button type="button" className="btn-icon-close" onClick={onClose} aria-label="Fechar Gráficos">
          Fechar
        </button>
      </div>

      {/* Alternância acessível Gráfico <-> Tabela */}
      <div className="segmented-row" role="group" aria-label="Formato de leitura dos dados">
        <button
          type="button"
          className={`seg-btn ${viewTab === 'charts' ? 'is-active' : ''}`}
          aria-pressed={viewTab === 'charts'}
          onClick={() => setViewTab('charts')}
        >
          Gráficos visuais
        </button>
        <button
          type="button"
          className={`seg-btn ${viewTab === 'table' ? 'is-active' : ''}`}
          aria-pressed={viewTab === 'table'}
          onClick={() => setViewTab('table')}
        >
          Ver em tabela
        </button>
      </div>

      {viewTab === 'charts' ? (
        <div className="charts-stack">
          {/* 1. Iluminação Solar A vs B */}
          <div className="data-card">
            <h3>Iluminação solar (% do disco visível)</h3>
            <p className="chart-caption">
              A ({siteA.name}): média {summaryA.meanIllumPct.toFixed(0)}%
              {siteB && summaryB ? ` · B (${siteB.name}): média ${summaryB.meanIllumPct.toFixed(0)}%` : ''}
            </p>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="mini-chart-svg"
              role="img"
              aria-label={`Gráfico de iluminação solar ao longo de ${summaryA.durationHours.toFixed(0)} horas`}
            >
              <line x1={PL} y1={PT} x2={PL} y2={H - PB} stroke="#475569" strokeWidth="1" />
              <line x1={PL} y1={H - PB} x2={W - PR} y2={H - PB} stroke="#475569" strokeWidth="1" />
              <line x1={PL} y1={toY(50)} x2={W - PR} y2={toY(50)} stroke="#334155" strokeDasharray="3 3" />
              <text x="4" y={PT + 6} fill="#cbd5e1" fontSize="9">100%</text>
              <text x="10" y={toY(50) + 3} fill="#94a3b8" fontSize="9">50%</text>
              <text x="16" y={H - PB} fill="#94a3b8" fontSize="9">0%</text>

              <path d={sunPathA} fill="none" stroke="#f5b749" strokeWidth="2.2" />
              {sunPathB && (
                <path d={sunPathB} fill="none" stroke="#57d6ff" strokeWidth="2" strokeDasharray="5 3" />
              )}

              {/* Marcador da época atual */}
              <line x1={cursorX} y1={PT - 3} x2={cursorX} y2={H - PB} stroke="#ffffff" strokeWidth="1.4" />
            </svg>
            <div className="legend-row">
              <span className="legend-item">
                <span className="swatch-solid-amber" aria-hidden="true" /> A: {siteA.name} (linha cheia)
              </span>
              {siteB && (
                <span className="legend-item">
                  <span className="swatch-dashed-cyan" aria-hidden="true" /> B: {siteB.name} (tracejada)
                </span>
              )}
            </div>
          </div>

          {/* 2. Visibilidade da Terra (DTE), Comunicação e Intervalos de Blackout */}
          <div className="data-card">
            <h3>Comunicação e intervalos de blackout</h3>
            <p className="chart-caption">
              Faixas azuis = Terra direta (DTE); ciano = Relay satélite; vermelho escuro = Blackout sem sinal.
            </p>
            <svg
              viewBox={`0 0 ${W} 76`}
              className="mini-chart-svg"
              role="img"
              aria-label="Linha do tempo de disponibilidade de comunicação direta, satélite relay e blackouts"
            >
              {[
                { label: 'A', y: 12, analysis: analysisA },
                ...(analysisB ? [{ label: 'B', y: 42, analysis: analysisB }] : []),
              ].map((row) => (
                <g key={row.label}>
                  <text x="6" y={row.y + 13} fill="#f1f5f9" fontSize="11" fontWeight="700">
                    {row.label}
                  </text>
                  {Array.from({ length: spanCount }).map((_, offset) => {
                    const idx = startIdx + offset;
                    const st = row.analysis.epochStates[idx];
                    const bw = Math.max(1.2, plotW / spanCount);
                    const bx = PL + (offset / spanCount) * plotW;
                    let fill = '#b91c1c'; // Blackout
                    if (st.dteVisible) {
                      fill = '#3b82f6'; // Terra DTE direta
                    } else if (config.relayEnabled && st.combinedLinkVisible) {
                      fill = '#22d3ee'; // Coberto por Relay ELFO
                    }
                    return <rect key={offset} x={bx} y={row.y} width={bw + 0.4} height={18} fill={fill} />;
                  })}
                </g>
              ))}
              <line x1={cursorX} y1="6" x2={cursorX} y2="68" stroke="#ffffff" strokeWidth="1.5" />
            </svg>
            <p className="helper-note">
              A: DTE {summaryA.dteDutyPct.toFixed(0)}% · Total {summaryA.combinedDutyPct.toFixed(0)}% ·{' '}
              {blackoutsA.length} blackout(s) (máx. {Math.max(...blackoutsA.map((b) => b.hours), 0).toFixed(0)}h).
              {summaryB &&
                ` B: DTE ${summaryB.dteDutyPct.toFixed(0)}% · Total ${summaryB.combinedDutyPct.toFixed(0)}% · ${blackoutsB.length} blackout(s).`}
            </p>
          </div>

          {/* 3. Horizonte 360° + Posição de Sol e Terra no céu */}
          <div className="data-card">
            <div className="card-header-inline">
              <h3>Céu e horizonte 360°</h3>
              {siteB && (
                <div className="mini-toggle">
                  <button
                    type="button"
                    className={`seg-btn-sm ${skyTarget === 'A' ? 'is-active-amber' : ''}`}
                    onClick={() => setSkyTarget('A')}
                  >
                    Ver A
                  </button>
                  <button
                    type="button"
                    className={`seg-btn-sm ${skyTarget === 'B' ? 'is-active-cyan' : ''}`}
                    onClick={() => setSkyTarget('B')}
                  >
                    Ver B
                  </button>
                </div>
              )}
            </div>
            <PolarHorizonSkyPlot
              siteName={activeSkySite.name}
              horizonAzDeg={horizonAzDeg}
              horizonElevDeg={activeSkyAnalysis.terrain.horizonElevDeg}
              sunAzSeries={activeSkySite.sky_series.sun_az_deg}
              sunElSeries={activeSkySite.sky_series.sun_el_deg}
              earthAzSeries={activeSkySite.sky_series.earth_az_deg}
              earthElSeries={activeSkySite.sky_series.earth_el_deg}
              elfoAzSeries={activeSkySite.sky_series.elfo_primary_az_deg}
              elfoElSeries={activeSkySite.sky_series.elfo_primary_el_deg}
              epochIdx={clampedEpoch}
              epochState={activeSkyAnalysis.epochStates[clampedEpoch]}
              sunRadiusDeg={missionWindow.solar_angular_radius_deg[clampedEpoch]}
              earthRadiusDeg={missionWindow.earth_angular_radius_deg[clampedEpoch]}
              antennaMaskDeg={config.antennaMaskDeg}
              dteMarginMode={config.dteMarginMode}
              relayEnabled={config.relayEnabled}
            />
          </div>
        </div>
      ) : (
        /* Alternativa acessível em Tabela HTML */
        <div className="data-card">
          <h3>Valores numéricos do período (Tabela acessível)</h3>
          <p className="helper-note">
            Clique em uma linha para mover o instante atual para aquela data UTC.
          </p>
          <div className="metric-table-wrap">
            <table className="mini-compare-table">
              <thead>
                <tr>
                  <th scope="col">Data / Hora (UTC)</th>
                  <th scope="col">Sol A</th>
                  <th scope="col">Sinal A</th>
                  {siteB && <th scope="col">Sol B</th>}
                  {siteB && <th scope="col">Sinal B</th>}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((idx) => {
                  const stA = analysisA.epochStates[idx];
                  const stB = analysisB?.epochStates[idx];
                  const utc = formatUtcReadable(missionWindow.timestamps_utc[idx]);
                  const linkA = stA.dteVisible
                    ? 'Terra DTE'
                    : config.relayEnabled && stA.combinedLinkVisible
                      ? 'Relay ELFO'
                      : 'Blackout';
                  const linkB = stB
                    ? stB.dteVisible
                      ? 'Terra DTE'
                      : config.relayEnabled && stB.combinedLinkVisible
                        ? 'Relay ELFO'
                        : 'Blackout'
                    : '';
                  return (
                    <tr
                      key={idx}
                      className={idx === clampedEpoch ? 'is-current-row' : undefined}
                    >
                      <td>
                        <button
                          type="button"
                          className="btn-table-jump"
                          onClick={() => onSelectEpoch(idx)}
                        >
                          {utc.date.slice(5)} {utc.time.replace(' UTC', '')}
                        </button>
                      </td>
                      <td>{(stA.fIllum * 100).toFixed(0)}%</td>
                      <td>{linkA}</td>
                      {siteB && stB && <td>{(stB.fIllum * 100).toFixed(0)}%</td>}
                      {siteB && stB && <td>{linkB}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="panel-source-note">
        Fonte: NASA LOLA DEM ({provenance.dem_product.resolution_m} m/px) + SPICE ({provenance.ephemeris.frame}).
        Modelo estritamente geométrico; não considera iluminação indireta ou multipercurso RF.
      </p>
    </aside>
  );
};
