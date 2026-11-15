import React, { useId } from 'react';
import { formatHours, formatNumber, formatPct, yesNo } from './format';
import { formatUtc } from './timeWindow';
import { LiveSiteAnalysis } from './math';
import { EngineeringConfig, LandingSiteEntry, MissionWindow } from './types';
import { useNarrowViewport } from './useNarrowViewport';

interface PowerCommsChartsProps {
  site: LandingSiteEntry;
  analysis: LiveSiteAnalysis;
  missionWindow: MissionWindow;
  config: EngineeringConfig;
  /** null when the requested instant has no sample: no playhead and no instant values. */
  epochIdx: number | null;
  startIdx: number;
  endIdx: number;
  onSelectEpoch: (idx: number) => void;
}

interface Channel {
  label: string;
  color: string;
  /** null when the file has no such series for the analysed point. */
  values: Array<boolean | null> | null;
}

export const PowerCommsCharts: React.FC<PowerCommsChartsProps> = ({
  site,
  analysis,
  missionWindow,
  config,
  epochIdx,
  startIdx,
  endIdx,
  onSelectEpoch,
}) => {
  const ids = useId();
  const narrow = useNarrowViewport();
  const w = narrow ? 360 : 680;
  const hPower = 155;
  const left = narrow ? 30 : 44;
  const right = narrow ? 6 : 14;
  const plotW = w - left - right;
  const n = analysis.epochStates.length;
  const states = analysis.epochStates;

  const idxToX = (i: number) => left + (i / Math.max(1, n - 1)) * plotW;

  const powerPlotTop = 14;
  const powerPlotH = 112;
  const maxPowerRef = Math.max(analysis.solar.peakPowerW, config.panelAreaM2 * config.panelEfficiency * 1400, 10);

  const illumAreaPoints = [
    `${left},${powerPlotTop + powerPlotH}`,
    ...states.map((s, i) => `${idxToX(i).toFixed(1)},${(powerPlotTop + powerPlotH * (1 - s.fIllum)).toFixed(1)}`),
    `${left + plotW},${powerPlotTop + powerPlotH}`,
  ].join(' ');

  const powerLinePoints = states
    .map((s, i) => {
      const normP = Math.min(1, s.powerW / maxPowerRef);
      return `${idxToX(i).toFixed(1)},${(powerPlotTop + powerPlotH * (1 - normP)).toFixed(1)}`;
    })
    .join(' ');

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const xSvg = ((e.clientX - rect.left) / rect.width) * w;
    const rel = Math.max(0, Math.min(1, (xSvg - left) / plotW));
    onSelectEpoch(Math.round(rel * (n - 1)));
  };

  const curEpoch = epochIdx === null ? null : states[epochIdx];

  // Contiguous "true" runs; a series with any null is not drawn (its values do not exist here).
  const buildRuns = (values: Array<boolean | null>) => {
    const runs: Array<{ start: number; end: number }> = [];
    let activeStart = -1;
    for (let i = 0; i < n; i++) {
      const ok = values[i] === true;
      if (ok && activeStart < 0) activeStart = i;
      if (!ok && activeStart >= 0) {
        runs.push({ start: activeStart, end: i - 1 });
        activeStart = -1;
      }
    }
    if (activeStart >= 0) runs.push({ start: activeStart, end: n - 1 });
    return runs;
  };

  const series = <T,>(get: (i: number) => T) => Array.from({ length: n }, (_, i) => get(i));
  const centerOnly = (get: (i: number) => boolean | null) => {
    const values = series(get);
    return values.some((v) => v === null) ? null : values;
  };

  const channels: Channel[] = [
    { label: 'Terra direta (visada para a Terra)', color: '#38bdf8', values: series((i) => states[i].dteVisible) },
  ];
  if (config.relayEnabled) {
    channels.push(
      { label: 'Satélite 1 do cenário de retransmissores (hipotético)', color: '#a78bfa', values: series((i) => states[i].elfoPrimaryVisible) },
      { label: 'Constelação de 3 satélites (hipotética)', color: '#c084fc', values: centerOnly((i) => states[i].elfoConstellationVisible) },
      { label: 'Órbita polar de 50 km parecida com a do LRO (hipotética)', color: '#cbd5e1', values: centerOnly((i) => states[i].lroVisible) },
      { label: 'Terra ou constelação hipotética', color: '#34d399', values: centerOnly((i) => states[i].combinedLinkVisible) },
    );
  }
  const rowH = 26;
  const commsTop = 8;
  const hComms = commsTop + channels.length * rowH + 10;

  const dayTicks = [0, 5, 10, 15, 20, 25, 30].filter((d) => d * 24 * 3600 <= (n - 1) * missionWindow.step_seconds + 60);
  const playheadX = epochIdx === null ? null : idxToX(epochIdx);
  const outsideInterval = (y: number, height: number) => (
    <>
      {startIdx > 0 && <rect x={left} y={y} width={idxToX(startIdx) - left} height={height} fill="#000000" opacity={0.55} />}
      {endIdx < n - 1 && (
        <rect x={idxToX(endIdx)} y={y} width={left + plotW - idxToX(endIdx)} height={height} fill="#000000" opacity={0.55} />
      )}
    </>
  );
  const offCenterNote = !analysis.isCenter && config.relayEnabled;

  return (
    <section className="panel timeseries-panel" aria-labelledby={`${ids}-titulo`}>
      <h2 id={`${ids}-titulo`}>5. Luz do Sol e linha de visada ao longo do tempo</h2>
      <p className="field-help">
        Resumo de {site.name} para todo o período do arquivo ({formatUtc(missionWindow.timestamps_utc[0])} a{' '}
        {formatUtc(missionWindow.timestamps_utc[n - 1])}), calculado nesta página com o modelo simples de painel e os
        critérios de “Opções avançadas”. São estimativas geométricas: não garantem energia nem comunicação.
      </p>
      <dl className="kpi-strip">
        <div className="mini-kpi">
          <dt>Disco solar acima do relevo, em média</dt>
          <dd>{formatPct(analysis.solar.meanIllumFraction * 100)}</dd>
        </div>
        <div className="mini-kpi">
          <dt>Maior intervalo contínuo com o disco solar todo abaixo do relevo</dt>
          <dd>{formatHours(analysis.solar.maxContinuousShadowHours)}</dd>
        </div>
        <div className="mini-kpi">
          <dt>Energia estimada no período (painel de {formatNumber(config.panelAreaM2, 1)} m²)</dt>
          <dd>{formatNumber(analysis.solar.energyCycleWh / 1000, 1)} kWh</dd>
        </div>
        <div className="mini-kpi">
          <dt>Tempo com visada direta para a Terra</dt>
          <dd>{formatPct(analysis.comms.dteDutyCyclePct)}</dd>
        </div>
        <div className="mini-kpi">
          <dt>Maior intervalo sem visada direta para a Terra</dt>
          <dd>{formatHours(analysis.comms.maxBlackoutDteHours)}</dd>
        </div>
        {config.relayEnabled && (
          <div className="mini-kpi">
            <dt>Tempo com Terra ou constelação hipotética</dt>
            <dd>{formatPct(analysis.comms.combinedDutyCyclePct)}</dd>
          </div>
        )}
      </dl>
      {offCenterNote && (
        <p className="field-help">
          “Sem dado” fora do centro: o arquivo só tem a visibilidade da constelação hipotética e da órbita de 50 km
          para o centro do local, e esta página não a recalcula.
        </p>
      )}

      <h3>Parte do disco solar acima do relevo (área) e potência estimada (linha)</h3>
      <p className="chart-instant">
        {curEpoch
          ? `No instante exibido: ${formatNumber(curEpoch.fIllum * 100, 0)}% do disco solar acima do relevo, ${formatNumber(curEpoch.powerW, 0)} W estimados.`
          : 'Sem amostra para o instante pedido.'}
      </p>
      <svg
        viewBox={`0 0 ${w} ${hPower}`}
        className="timeline-svg"
        onClick={handleSvgClick}
        role="img"
        aria-label="Série temporal da parte do disco solar acima do relevo e da potência estimada no período do arquivo"
        aria-describedby={`${ids}-desc`}
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
        <polygon points={illumAreaPoints} fill="rgba(251, 191, 36, 0.3)" />
        <polyline points={powerLinePoints} fill="none" stroke="#fbbf24" strokeWidth={1.6} />
        {outsideInterval(powerPlotTop, powerPlotH)}
        {playheadX !== null && (
          <line x1={playheadX} y1={powerPlotTop} x2={playheadX} y2={powerPlotTop + powerPlotH} stroke="#ffffff" strokeWidth={1.5} />
        )}
        {dayTicks.map((day) => {
          const tickIdx = Math.min(n - 1, Math.round((day * 86400) / missionWindow.step_seconds));
          return (
            <text key={day} x={idxToX(tickIdx)} y={powerPlotTop + powerPlotH + 16} textAnchor="middle" className="svg-muted-label">
              D+{day}
            </text>
          );
        })}
      </svg>

      <h3>Quando há linha de visada (barras coloridas)</h3>
      <p className="chart-instant">
        {curEpoch
          ? `No instante exibido: visada direta para a Terra ${yesNo(curEpoch.dteVisible)}${
              config.relayEnabled
                ? `; constelação hipotética ${curEpoch.elfoConstellationVisible === null ? 'sem dado fora do centro' : yesNo(curEpoch.elfoConstellationVisible)}`
                : ''
            }.`
          : 'Sem amostra para o instante pedido.'}
      </p>
      <svg
        viewBox={`0 0 ${w} ${hComms}`}
        className="timeline-svg"
        onClick={handleSvgClick}
        role="img"
        aria-label="Intervalos com linha de visada para a Terra e, se incluídos, para os retransmissores hipotéticos, no período do arquivo"
        aria-describedby={`${ids}-desc`}
      >
        {channels.map((ch, rowIdx) => {
          const rowY = commsTop + rowIdx * rowH;
          return (
            <g key={ch.label}>
              <text x={left + 4} y={rowY + 9} className="svg-channel-label">
                {ch.label}
              </text>
              <rect x={left} y={rowY + 12} width={plotW} height={10} rx={2} fill="#111d2c" stroke="#2a405a" strokeWidth={0.6} />
              {ch.values === null ? (
                <text x={left + plotW / 2} y={rowY + 20} textAnchor="middle" className="svg-muted-label">
                  sem dado fora do centro do local
                </text>
              ) : (
                buildRuns(ch.values).map((r, rIdx) => {
                  const x1 = idxToX(r.start);
                  const x2 = idxToX(r.end + 0.8);
                  return <rect key={rIdx} x={x1} y={rowY + 12} width={Math.max(1.2, x2 - x1)} height={10} rx={1.5} fill={ch.color} />;
                })
              )}
            </g>
          );
        })}
        {outsideInterval(commsTop, channels.length * rowH)}
        {playheadX !== null && (
          <line x1={playheadX} y1={commsTop} x2={playheadX} y2={commsTop + channels.length * rowH} stroke="#ffffff" strokeWidth={1.5} />
        )}
      </svg>
      <p id={`${ids}-desc`} className="map-caption">
        Eixo horizontal: dias desde o início do arquivo (D+0, D+5…). A linha branca vertical marca o instante exibido;
        as áreas escurecidas ficam fora do período escolhido. Clicar em um gráfico escolhe o instante mais próximo do
        clique; o mesmo pode ser feito pelo teclado com os campos de data e a linha do tempo. Os valores estão na tabela
        do período.
      </p>
    </section>
  );
};
