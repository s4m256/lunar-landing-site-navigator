import React from 'react';
import { LiveEpochState } from './math';

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
  epochIdx: number;
  epochState: LiveEpochState;
  sunRadiusDeg: number;
  earthRadiusDeg: number;
  antennaMaskDeg: number;
  dteMarginMode: 'full_disk' | 'center';
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
  dteMarginMode,
  relayEnabled,
}) => {
  const w = 560;
  const h = 230;
  const left = 42;
  const right = 18;
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

  const curSunX = azToX(sunAzSeries[epochIdx]);
  const curSunY = toPlotY(sunElSeries[epochIdx], yMin, yMax, top, plotH);
  const curEarthX = azToX(earthAzSeries[epochIdx]);
  const curEarthY = toPlotY(earthElSeries[epochIdx], yMin, yMax, top, plotH);
  const curElfoX = azToX(elfoAzSeries[epochIdx]);
  const curElfoY = toPlotY(elfoElSeries[epochIdx], yMin, yMax, top, plotH);

  // Convert angular radius into pixel radius capped reasonably for readability
  const pxPerDeg = plotH / (yMax - yMin);
  const sunDiskR = Math.max(4.5, Math.min(12, sunRadiusDeg * pxPerDeg * 2.5));
  const earthDiskR = Math.max(5.5, Math.min(14, earthRadiusDeg * pxPerDeg));

  const yZero = toPlotY(0, yMin, yMax, top, plotH);
  const ticksY: number[] = [];
  const stepY = yMax - yMin > 40 ? 15 : 5;
  for (let yv = Math.ceil(yMin / stepY) * stepY; yv <= yMax; yv += stepY) {
    ticksY.push(yv);
  }

  return (
    <div className="panel horizon-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Céu Topocêntrico ENU (360° × Elevação)</span>
          <h2>Curva do Horizonte & Posições Sol / Terra / ELFO — {siteName}</h2>
        </div>
        <div className="horizon-readout">
          <span className={`badge ${epochState.fIllum > 0.01 ? 'badge-sun' : 'badge-dark'}`}>
            Sol: {(epochState.fIllum * 100).toFixed(0)}% disco (El {sunElSeries[epochIdx].toFixed(2)}° vs Horiz {epochState.horizonAtSunDeg.toFixed(2)}°)
          </span>
          <span className={`badge ${epochState.dteVisible ? 'badge-earth' : 'badge-dark'}`}>
            DTE ({dteMarginMode === 'full_disk' ? 'disco cheio' : 'centro'}): {epochState.dteVisible ? 'ATIVO' : 'BLOQ'}
          </span>
          {relayEnabled && (
            <span className={`badge ${epochState.elfoConstellationVisible ? 'badge-elfo' : 'badge-dark'}`}>
              ELFO Relay: {epochState.elfoConstellationVisible ? 'ATIVO' : 'SEM LINK'}
            </span>
          )}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="horizon-svg"
        role="img"
        aria-label="Perfil de horizonte lunar 360 graus com trajetória solar e da Terra"
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
                stroke={yv === 0 ? '#475569' : '#1b2b3d'}
                strokeDasharray={yv === 0 ? undefined : '3 3'}
                strokeWidth={yv === 0 ? 1 : 0.7}
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

        {/* Current Earth disk */}
        <circle
          cx={curEarthX}
          cy={curEarthY}
          r={earthDiskR}
          fill={epochState.dteVisible ? 'rgba(56, 189, 248, 0.85)' : 'rgba(56, 189, 248, 0.25)'}
          stroke="#bae6fd"
          strokeWidth={1.2}
        />
        <text x={curEarthX} y={curEarthY - earthDiskR - 3} textAnchor="middle" className="sky-tag sky-tag-earth">
          Terra
        </text>

        {/* Current Sun disk */}
        <circle
          cx={curSunX}
          cy={curSunY}
          r={sunDiskR}
          fill={epochState.fIllum > 0.5 ? '#fbbf24' : epochState.fIllum > 0 ? '#f59e0b' : 'rgba(245, 158, 11, 0.25)'}
          stroke="#fef3c7"
          strokeWidth={1.2}
        />
        <text x={curSunX} y={curSunY - sunDiskR - 3} textAnchor="middle" className="sky-tag sky-tag-sun">
          Sol
        </text>

        {/* Current ELFO Primary Relay satellite */}
        {relayEnabled && elfoElSeries[epochIdx] >= yMin - 5 && (
          <g>
            <polygon
              points={`${curElfoX},${curElfoY - 5} ${curElfoX + 5},${curElfoY} ${curElfoX},${curElfoY + 5} ${curElfoX - 5},${curElfoY}`}
              fill={epochState.elfoPrimaryVisible ? '#c084fc' : '#64748b'}
              stroke="#f3e8ff"
              strokeWidth={1}
            />
            <text x={curElfoX} y={curElfoY - 8} textAnchor="middle" className="sky-tag sky-tag-elfo">
              ELFO-1
            </text>
          </g>
        )}
      </svg>
      <div className="legend-row">
        <span><i className="dot dot-sun" /> Sol (com eclipse parcial pelo disco solar δ☉)</span>
        <span><i className="dot dot-earth" /> Terra (nuvem azul = curva de libração lunar 30d)</span>
        <span><i className="dot dot-elfo" /> Satélite ELFO-1 & máscara de antena (+{antennaMaskDeg.toFixed(0)}°)</span>
      </div>
    </div>
  );
};
