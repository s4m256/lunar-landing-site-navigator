import React, { useId } from 'react';
import { formatDeg, formatNumber, yesNo } from './format';
import { reliefHorizonText } from './horizonState';
import { LiveEpochState } from './math';
import { useNarrowViewport } from './useNarrowViewport';

interface PolarHorizonSkyPlotProps {
  siteName: string;
  horizonAzDeg: number[];
  horizonElevDeg: number[];
  sunAzSeries: number[];
  sunElSeries: number[];
  earthAzSeries: number[];
  earthElSeries: number[];
  elfoAzSeries: number[];
  elfoElSeries: number[];
  /** null when the requested instant has no sample: the tracks are drawn, no current position. */
  epochIdx: number | null;
  epochState: LiveEpochState | null;
  sunRadiusDeg: number | null;
  earthRadiusDeg: number | null;
  antennaMaskDeg: number;
  relayEnabled: boolean;
}

function toPlotY(elDeg: number, yMin: number, yMax: number, topPad: number, height: number): number {
  const clamped = Math.max(yMin, Math.min(yMax, elDeg));
  const frac = (clamped - yMin) / (yMax - yMin);
  return topPad + height * (1 - frac);
}

export const PolarHorizonSkyPlot: React.FC<PolarHorizonSkyPlotProps> = ({
  siteName,
  horizonAzDeg,
  horizonElevDeg,
  sunAzSeries,
  sunElSeries,
  earthAzSeries,
  earthElSeries,
  elfoAzSeries,
  elfoElSeries,
  epochIdx,
  epochState,
  sunRadiusDeg,
  earthRadiusDeg,
  antennaMaskDeg,
  relayEnabled,
}) => {
  const ids = useId();
  const narrow = useNarrowViewport();
  const w = narrow ? 380 : 560;
  const h = 230;
  const left = narrow ? 30 : 42;
  const right = narrow ? 10 : 18;
  const top = 16;
  const bottom = 32;
  const plotW = w - left - right;
  const plotH = h - top - bottom;

  // Dynamic y-range accommodating deep craters (+28 deg walls) or high peaks (-5 to +15)
  const hMin = Math.min(...horizonElevDeg, ...sunElSeries, ...earthElSeries);
  const hMax = Math.max(...horizonElevDeg, ...sunElSeries, ...earthElSeries, 12);
  const yMin = Math.floor(Math.min(-6, hMin - 2));
  const yMax = Math.ceil(Math.max(20, Math.min(85, hMax + 4)));

  const azToX = (az: number) => left + ((((az % 360) + 360) % 360) / 360) * plotW;

  // Terrain silhouette polygon from horizon_elev_deg(Az)
  const terrainPoints = horizonAzDeg
    .map((az, i) => `${azToX(az).toFixed(1)},${toPlotY(horizonElevDeg[i], yMin, yMax, top, plotH).toFixed(1)}`)
    .join(' ');
  const terrainPolygon = `${left},${top + plotH} ${terrainPoints} ${left + plotW},${top + plotH}`;

  // Relay antenna mask threshold dashed curve: h_horiz(Az) + antennaMaskDeg
  const maskPoints = horizonAzDeg
    .map((az, i) => `${azToX(az).toFixed(1)},${toPlotY(horizonElevDeg[i] + antennaMaskDeg, yMin, yMax, top, plotH).toFixed(1)}`)
    .join(' ');

  // Earth libration Lissajous scatter cloud over the 30-day lunar cycle
  const earthTrack = earthAzSeries.map((az, i) => ({
    x: azToX(az),
    y: toPlotY(earthElSeries[i], yMin, yMax, top, plotH),
  }));

  // Sample sun path cleanly breaking wrap-around discontinuities across 360->0
  const sunPathSegments: string[] = [];
  let currentSeg: string[] = [];
  for (let i = 0; i < sunAzSeries.length; i++) {
    const px = azToX(sunAzSeries[i]);
    const py = toPlotY(sunElSeries[i], yMin, yMax, top, plotH);
    if (i > 0 && Math.abs(sunAzSeries[i] - sunAzSeries[i - 1]) > 180) {
      if (currentSeg.length > 1) sunPathSegments.push(`M ${currentSeg.join(' L ')}`);
      currentSeg = [];
    }
    currentSeg.push(`${px.toFixed(1)},${py.toFixed(1)}`);
  }
  if (currentSeg.length > 1) sunPathSegments.push(`M ${currentSeg.join(' L ')}`);

  const cur =
    epochIdx === null || epochState === null || sunRadiusDeg === null || earthRadiusDeg === null
      ? null
      : {
          idx: epochIdx,
          sunX: azToX(sunAzSeries[epochIdx]),
          sunY: toPlotY(sunElSeries[epochIdx], yMin, yMax, top, plotH),
          earthX: azToX(earthAzSeries[epochIdx]),
          earthY: toPlotY(earthElSeries[epochIdx], yMin, yMax, top, plotH),
          elfoX: azToX(elfoAzSeries[epochIdx]),
          elfoY: toPlotY(elfoElSeries[epochIdx], yMin, yMax, top, plotH),
          elfoInRange: elfoElSeries[epochIdx] >= yMin - 5,
          state: epochState,
          // Angular radius into pixels, capped for readability (the drawing is not to scale).
          sunDiskR: Math.max(4.5, Math.min(12, sunRadiusDeg * (plotH / (yMax - yMin)) * 2.5)),
          earthDiskR: Math.max(5.5, Math.min(14, earthRadiusDeg * (plotH / (yMax - yMin)))),
        };

  const yZero = toPlotY(0, yMin, yMax, top, plotH);
  const ticksY: number[] = [];
  const stepY = yMax - yMin > 40 ? 15 : 5;
  for (let yv = Math.ceil(yMin / stepY) * stepY; yv <= yMax; yv += stepY) {
    ticksY.push(yv);
  }

  return (
    <section className="panel horizon-panel" aria-labelledby={`${ids}-titulo`}>
      <div className="panel-head">
        <h2 id={`${ids}-titulo`}>3. Céu visto de {siteName}</h2>
        {cur ? (
          <ul className="horizon-readout" aria-label="Estado no instante exibido">
            <li className="badge badge-sun">
              {reliefHorizonText('sun', sunElSeries[cur.idx], cur.state.horizonAtSunDeg)} (
              {formatNumber(cur.state.fIllum * 100, 0)}% do disco)
            </li>
            <li className="badge badge-earth">Visada direta para a Terra: {yesNo(cur.state.dteVisible)}</li>
            {relayEnabled && (
              <li className="badge badge-elfo">
                Retransmissor hipotético visível:{' '}
                {cur.state.elfoConstellationVisible === null ? 'sem dado fora do centro' : yesNo(cur.state.elfoConstellationVisible)}
              </li>
            )}
          </ul>
        ) : (
          <p className="badge">Sem amostra para o instante pedido: nenhuma posição atual é desenhada.</p>
        )}
      </div>

      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="horizon-svg"
        role="img"
        aria-label="Perfil de horizonte lunar 360 graus com trajetória solar e da Terra"
        aria-describedby={`${ids}-desc`}
      >
        <defs>
          <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#07111e" />
            <stop offset="100%" stopColor="#122133" />
          </linearGradient>
          <linearGradient id="rockGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#334155" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
        </defs>

        <rect x={left} y={top} width={plotW} height={plotH} fill="url(#skyGrad)" stroke="#23374d" />

        {ticksY.map((yv) => {
          const y = toPlotY(yv, yMin, yMax, top, plotH);
          return (
            <g key={yv}>
              <line
                x1={left}
                y1={y}
                x2={left + plotW}
                y2={y}
                stroke={yv === 0 ? '#cbd5e1' : '#1b2b3d'}
                strokeDasharray={yv === 0 ? undefined : '3 3'}
                strokeWidth={yv === 0 ? 1.2 : 0.7}
              />
              <text x={left - 6} y={y + 3.5} textAnchor="end" className="svg-muted-label">
                {yv}°
              </text>
            </g>
          );
        })}

        {[0, 90, 180, 270, 360].map((az) => {
          const x = left + (az / 360) * plotW;
          const dir = az === 0 || az === 360 ? 'N' : az === 90 ? 'L' : az === 180 ? 'S' : 'O';
          return (
            <g key={az}>
              <line x1={x} y1={top} x2={x} y2={top + plotH} stroke="#1b2b3d" strokeWidth={0.7} />
              <text x={x} y={top + plotH + 15} textAnchor="middle" className="svg-muted-label">
                {az}° ({dir})
              </text>
            </g>
          );
        })}

        {/* Sun 30-day track */}
        {sunPathSegments.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="rgba(251, 191, 36, 0.45)" strokeWidth={1.3} />
        ))}

        {/* Earth libration figure-8 locus over lunar month */}
        {earthTrack.map((pt, i) =>
          i % 3 === 0 ? (
            <circle key={i} cx={pt.x} cy={pt.y} r={1.2} fill="rgba(56, 189, 248, 0.35)" />
          ) : null,
        )}

        {/* Horizon terrain mask silhouette */}
        <polygon points={terrainPolygon} fill="url(#rockGrad)" opacity={0.92} />
        <polyline points={terrainPoints} fill="none" stroke="#94a3b8" strokeWidth={1.6} />

        {/* Relay minimum elevation mask */}
        {relayEnabled && (
          <polyline
            points={maskPoints}
            fill="none"
            stroke="#a78bfa"
            strokeWidth={1}
            strokeDasharray="4 3"
            opacity={0.75}
          />
        )}

        {/* Zero elevation reference marker if needed */}
        <line x1={left} y1={yZero} x2={left + 4} y2={yZero} stroke="#64748b" />

        {cur && (
          <g>
            {/* Current Earth disk */}
            <circle
              cx={cur.earthX}
              cy={cur.earthY}
              r={cur.earthDiskR}
              fill={cur.state.dteVisible ? 'rgba(56, 189, 248, 0.85)' : 'rgba(56, 189, 248, 0.25)'}
              stroke="#bae6fd"
              strokeWidth={1.2}
            />
            <text x={cur.earthX} y={cur.earthY - cur.earthDiskR - 3} textAnchor="middle" className="sky-tag sky-tag-earth">
              Terra
            </text>

            {/* Current Sun disk */}
            <circle
              cx={cur.sunX}
              cy={cur.sunY}
              r={cur.sunDiskR}
              fill={cur.state.fIllum > 0.5 ? '#fbbf24' : cur.state.fIllum > 0 ? '#f59e0b' : 'rgba(245, 158, 11, 0.25)'}
              stroke="#fef3c7"
              strokeWidth={1.2}
            />
            <text x={cur.sunX} y={cur.sunY - cur.sunDiskR - 3} textAnchor="middle" className="sky-tag sky-tag-sun">
              Sol
            </text>

            {/* Primary satellite of the hypothetical relay scenario */}
            {relayEnabled && cur.elfoInRange && (
              <g>
                <polygon
                  points={`${cur.elfoX},${cur.elfoY - 5} ${cur.elfoX + 5},${cur.elfoY} ${cur.elfoX},${cur.elfoY + 5} ${cur.elfoX - 5},${cur.elfoY}`}
                  fill={cur.state.elfoPrimaryVisible ? '#c084fc' : '#64748b'}
                  stroke="#f3e8ff"
                  strokeWidth={1}
                />
                <text x={cur.elfoX} y={cur.elfoY - 8} textAnchor="middle" className="sky-tag sky-tag-elfo">
                  Satélite 1 (hipotético)
                </text>
              </g>
            )}
          </g>
        )}
      </svg>
      <ul className="legend-row" aria-label="Legenda do gráfico">
        <li><i className="dot dot-sun" aria-hidden="true" /> Sol: disco amarelo; linha amarela = caminho no período do arquivo</li>
        <li><i className="dot dot-earth" aria-hidden="true" /> Terra: disco azul; pontos azuis = posições no período do arquivo</li>
        <li><i className="dot dot-rock" aria-hidden="true" /> Área cinza: relevo (montanhas e bordas de crateras)</li>
        <li><i className="dot dot-zero" aria-hidden="true" /> Linha contínua em 0°: horizonte idealizado (sem relevo)</li>
        {relayEnabled && (
          <li><i className="dot dot-elfo" aria-hidden="true" /> Losango: satélite 1 do cenário hipotético de retransmissores; linha tracejada = relevo + {formatDeg(antennaMaskDeg, 0)} (altura mínima da antena no arquivo)</li>
        )}
      </ul>
      <p id={`${ids}-desc`} className="map-caption">
        Eixo horizontal: direção em graus a partir do norte (N, L, S, O). Eixo vertical: elevação em graus. O
        tamanho dos discos não está em escala.{' '}
        {cur
          ? `Neste instante o Sol está na direção ${formatDeg(sunAzSeries[cur.idx], 1)} e elevação ${formatDeg(sunElSeries[cur.idx])} (relevo nessa direção: ${formatDeg(cur.state.horizonAtSunDeg)}); a Terra está na direção ${formatDeg(earthAzSeries[cur.idx], 1)} e elevação ${formatDeg(earthElSeries[cur.idx])} (relevo: ${formatDeg(cur.state.horizonAtEarthDeg)}).`
          : 'Não há amostra para o instante pedido; só os caminhos do período aparecem.'}{' '}
        Os mesmos valores estão no resumo do instante e na tabela do período.
      </p>
    </section>
  );
};
