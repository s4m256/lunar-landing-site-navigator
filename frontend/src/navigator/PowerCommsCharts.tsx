import React from 'react';
import { LiveSiteAnalysis } from './math';
import { EngineeringConfig, LandingSiteEntry, MissionWindow } from './types';

interface PowerCommsChartsProps {
  site: LandingSiteEntry;
  analysis: LiveSiteAnalysis;
  missionWindow: MissionWindow;
  config: EngineeringConfig;
  epochIdx: number;
  onSelectEpoch: (idx: number) => void;
}

export const PowerCommsCharts: React.FC<PowerCommsChartsProps> = ({
  site,
  analysis,
  missionWindow,
  config,
  epochIdx,
  onSelectEpoch,
}) => {
  const w = 680;
  const hPower = 155;
  const hComms = 128;
  const left = 44;
  const right = 14;
  const plotW = w - left - right;
  const n = analysis.epochStates.length;

  const idxToX = (i: number) => left + (i / Math.max(1, n - 1)) * plotW;

  const powerPlotTop = 14;
  const powerPlotH = 112;
  const maxPowerRef = Math.max(
    analysis.solar.peakPowerW,
    config.panelAreaM2 * config.panelEfficiency * 1400,
    10,
  );

  const illumAreaPoints = [
    `${left},${powerPlotTop + powerPlotH}`,
    ...analysis.epochStates.map(
      (s, i) =>
        `${idxToX(i).toFixed(1)},${(powerPlotTop + powerPlotH * (1 - s.fIllum)).toFixed(1)}`,
    ),
    `${left + plotW},${powerPlotTop + powerPlotH}`,
  ].join(' ');

  const powerLinePoints = analysis.epochStates
    .map((s, i) => {
      const normP = Math.min(1, s.powerW / maxPowerRef);
      return `${idxToX(i).toFixed(1)},${(powerPlotTop + powerPlotH * (1 - normP)).toFixed(1)}`;
    })
    .join(' ');

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xSvg = ((e.clientX - rect.left) / rect.width) * w;
    const rel = Math.max(0, Math.min(1, (xSvg - left) / plotW));
    onSelectEpoch(Math.round(rel * (n - 1)));
  };

  const curEpoch = analysis.epochStates[epochIdx];
  const curElfoAltKm = site.sky_series.elfo_constellation_best_alt_km[epochIdx];
  const curElfoFspl = site.sky_series.elfo_constellation_best_fspl_db[epochIdx];

  // Compress contiguous true runs for crisp SVG link bars
  const buildRuns = (getter: (i: number) => boolean) => {
    const runs: Array<{ start: number; end: number }> = [];
    let activeStart = -1;
    for (let i = 0; i < n; i++) {
      const ok = getter(i);
      if (ok && activeStart < 0) activeStart = i;
      if (!ok && activeStart >= 0) {
        runs.push({ start: activeStart, end: i - 1 });
        activeStart = -1;
      }
    }
    if (activeStart >= 0) runs.push({ start: activeStart, end: n - 1 });
    return runs;
  };

  const linkChannels = [
    { label: 'DTE (Terra)', color: '#38bdf8', runs: buildRuns((i) => analysis.epochStates[i].dteVisible) },
    { label: 'ELFO-1', color: '#a78bfa', runs: buildRuns((i) => analysis.epochStates[i].elfoPrimaryVisible) },
    { label: 'ELFO 3-Sat', color: '#c084fc', runs: buildRuns((i) => analysis.epochStates[i].elfoConstellationVisible) },
    { label: 'LRO (50km)', color: '#94a3b8', runs: buildRuns((i) => analysis.epochStates[i].lroVisible) },
    { label: 'Combinado', color: '#34d399', runs: buildRuns((i) => analysis.epochStates[i].combinedLinkVisible) },
  ];

  const dayTicks = [0, 5, 10, 15, 20, 25, 30].filter(
    (d) => d * 24 * 3600 <= (n - 1) * missionWindow.step_seconds + 60,
  );
  const playheadX = idxToX(epochIdx);

  return (
    <div className="panel timeseries-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Simulação Sinódica Completa (~30 dias / {n} horas)</span>
          <h2>Geração Solar, Sombra Máxima & Janelas de Link (DTE vs Relay)</h2>
        </div>
        <div className="kpi-strip">
          <div className="mini-kpi">
            <span>Iluminação Média</span>
            <strong>{(analysis.solar.meanIllumFraction * 100).toFixed(1)}%</strong>
          </div>
          <div className="mini-kpi">
            <span>Energia ({config.panelAreaM2.toFixed(1)} m²)</span>
            <strong>{(analysis.solar.energyCycleWh / 1000).toFixed(1)} kWh</strong>
          </div>
          <div className="mini-kpi">
            <span>Sombra Contínua Máx</span>
            <strong>{analysis.solar.maxContinuousShadowHours.toFixed(1)} h</strong>
          </div>
          <div className="mini-kpi">
            <span>Bateria Mín ({config.survivalLoadW}W)</span>
            <strong>{(analysis.solar.minBatteryWh / 1000).toFixed(2)} kWh</strong>
          </div>
          <div className="mini-kpi">
            <span>DTE / Combinado</span>
            <strong>
              {analysis.comms.dteDutyCyclePct.toFixed(1)}% /{' '}
              {analysis.comms.combinedDutyCyclePct.toFixed(1)}%
            </strong>
          </div>
          <div className="mini-kpi accent">
            <span>Ganho Relay</span>
            <strong>+{analysis.comms.relayCoverageGainPct.toFixed(1)}%</strong>
          </div>
        </div>
      </div>

      {/* Solar power & f_illum chart */}
      <div className="chart-subhead">
        <span>Fração Iluminada f_illum(t) (área âmbar) & Potência Elétrica ({config.panelMode})</span>
        <span className="chart-instant">
          No instante: Sol {(curEpoch.fIllum * 100).toFixed(1)}% |{' '}
          {curEpoch.powerW.toFixed(0)} W ({curEpoch.irradianceWM2.toFixed(0)} W/m²)
        </span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${hPower}`}
        className="timeline-svg"
        onClick={handleSvgClick}
        role="img"
        aria-label="Série temporal de iluminação solar e geração de potência ao longo de 30 dias"
      >
        <rect x={left} y={powerPlotTop} width={plotW} height={powerPlotH} fill="#0a131f" stroke="#1e2f42" />
        {[0, 0.5, 1].map((f) => {
          const y = powerPlotTop + powerPlotH * (1 - f);
          return (
            <g key={f}>
              <line x1={left} y1={y} x2={left + plotW} y2={y} stroke="#192838" strokeDasharray="3 3" />
              <text x={left - 6} y={y + 3} textAnchor="end" className="svg-muted-label">
                {Math.round(f * 100)}%
              </text>
            </g>
          );
        })}
        <polygon points={illumAreaPoints} fill="rgba(251, 191, 36, 0.25)" />
        <polyline points={powerLinePoints} fill="none" stroke="#fbbf24" strokeWidth={1.6} />
        <line x1={playheadX} y1={powerPlotTop} x2={playheadX} y2={powerPlotTop + powerPlotH} stroke="#b5e9d4" strokeWidth={1.5} />

        {dayTicks.map((day) => {
          const tickIdx = Math.min(
            n - 1,
            Math.round((day * 86400) / missionWindow.step_seconds),
          );
          const tx = idxToX(tickIdx);
          return (
            <text key={day} x={tx} y={powerPlotTop + powerPlotH + 16} textAnchor="middle" className="svg-muted-label">
              D+{day}
            </text>
          );
        })}
      </svg>

      {/* Telecom windows Gantt */}
      <div className="chart-subhead" style={{ marginTop: '0.65rem' }}>
        <span>Janelas de Link: DTE vs ELFO vs LRO | Blackout máx DTE {analysis.comms.maxBlackoutDteHours.toFixed(1)}h → Comb {analysis.comms.maxBlackoutCombinedHours.toFixed(1)}h</span>
        <span className="chart-instant">
          ELFO melhor alt: {curElfoAltKm.toFixed(0)} km | FSPL: {curElfoFspl.toFixed(1)} dB
        </span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${hComms}`}
        className="timeline-svg"
        onClick={handleSvgClick}
        role="img"
        aria-label="Janelas de comunicação direta e satélites relay ao longo de 30 dias"
      >
        <rect x={left} y={8} width={plotW} height={100} fill="#0a131f" stroke="#1e2f42" />
        {linkChannels.map((ch, rowIdx) => {
          const rowY = 14 + rowIdx * 18;
          return (
            <g key={ch.label}>
              <text x={left - 5} y={rowY + 10} textAnchor="end" className="svg-channel-label">
                {ch.label}
              </text>
              <rect x={left} y={rowY + 1} width={plotW} height={11} rx={2} fill="#111d2c" />
              {ch.runs.map((r, rIdx) => {
                const x1 = idxToX(r.start);
                const x2 = idxToX(r.end + 0.8);
                return (
                  <rect
                    key={rIdx}
                    x={x1}
                    y={rowY + 1}
                    width={Math.max(1.2, x2 - x1)}
                    height={11}
                    rx={1.5}
                    fill={ch.color}
                    opacity={0.9}
                  />
                );
              })}
            </g>
          );
        })}
        <line x1={playheadX} y1={8} x2={playheadX} y2={108} stroke="#b5e9d4" strokeWidth={1.5} />
        <text x={left + plotW / 2} y={122} textAnchor="middle" className="svg-muted-label">
          Clique em qualquer ponto das curvas acima para posicionar o instante orbital
        </text>
      </svg>
    </div>
  );
};
