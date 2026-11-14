import React, { useMemo, useRef, useState } from 'react';
import { InterpolatedTerrain } from './math';
import { LandingSiteEntry, LocalGridNode } from './types';

type HeatmapLayer = 'score' | 'slope' | 'illum' | 'comms';

interface SouthPoleGridMapProps {
  sites: LandingSiteEntry[];
  selectedSite: LandingSiteEntry;
  selectedSiteLiveScores: Record<string, number>;
  liveTerrain: InterpolatedTerrain;
  relayEnabled: boolean;
  offsetXNorm: number;
  offsetYNorm: number;
  onSelectSite: (siteId: string) => void;
  onChangeOffset: (xNorm: number, yNorm: number) => void;
}

function projectStereo(latDeg: number, lonEastDeg: number, scale = 11.5): { x: number; y: number } {
  const colatDeg = 90 + latDeg; // distance from South Pole in degrees (e.g. -85 -> 5 deg)
  const r = colatDeg * scale;
  const rad = (lonEastDeg * Math.PI) / 180;
  // 0 deg E (Earthward prime meridian) points UP (-y), 90 deg E points RIGHT (+x)
  return {
    x: 130 + r * Math.sin(rad),
    y: 130 - r * Math.cos(rad),
  };
}

function colorForValue(node: LocalGridNode, layer: HeatmapLayer, relayEnabled: boolean): string {
  if (layer === 'slope') {
    if (node.slope_deg >= 15) return 'rgba(239, 68, 68, 0.72)';
    if (node.slope_deg >= 10) return 'rgba(245, 158, 11, 0.72)';
    const t = Math.max(0, Math.min(1, 1 - node.slope_deg / 10));
    return `rgba(${Math.round(30 + (1 - t) * 140)}, ${Math.round(145 + t * 75)}, ${Math.round(125 + t * 65)}, 0.75)`;
  }
  if (layer === 'illum') {
    const f = node.mean_illum_fraction;
    return `rgba(${Math.round(28 + f * 220)}, ${Math.round(45 + f * 145)}, ${Math.round(70 - f * 30)}, 0.78)`;
  }
  if (layer === 'comms') {
    const pct = (relayEnabled ? node.combined_dte_elfo_duty_cycle_pct : node.dte_full_disk_duty_cycle_pct) / 100;
    return `rgba(${Math.round(22 + (1 - pct) * 80)}, ${Math.round(90 + pct * 130)}, ${Math.round(135 + pct * 115)}, 0.78)`;
  }
  const s = node.landing_score_0_100 / 100;
  return `rgba(${Math.round(30 + (1 - s) * 170)}, ${Math.round(65 + s * 165)}, ${Math.round(80 + s * 110)}, 0.78)`;
}

function metricLabel(node: LocalGridNode, layer: HeatmapLayer, relayEnabled: boolean): string {
  if (layer === 'slope') return `${node.slope_deg.toFixed(1)}°`;
  if (layer === 'illum') return `${(node.mean_illum_fraction * 100).toFixed(0)}%`;
  if (layer === 'comms') {
    const v = relayEnabled ? node.combined_dte_elfo_duty_cycle_pct : node.dte_full_disk_duty_cycle_pct;
    return `${v.toFixed(0)}%`;
  }
  return `${node.landing_score_0_100.toFixed(0)}`;
}

export const SouthPoleGridMap: React.FC<SouthPoleGridMapProps> = ({
  sites,
  selectedSite,
  selectedSiteLiveScores,
  liveTerrain,
  relayEnabled,
  offsetXNorm,
  offsetYNorm,
  onSelectSite,
  onChangeOffset,
}) => {
  const [layer, setLayer] = useState<HeatmapLayer>('score');
  const gridSvgRef = useRef<SVGSVGElement | null>(null);
  const draggingRef = useRef(false);

  const sitePoints = useMemo(
    () =>
      sites.map((s) => ({
        site: s,
        pt: projectStereo(s.center.latitude_deg, s.center.longitude_east_deg),
        score: selectedSiteLiveScores[s.id] ?? s.engineering_summary.score.total_0_100,
      })),
    [sites, selectedSiteLiveScores],
  );

  const gridSize = selectedSite.local_grid.grid_size;
  const halfSpanM = ((gridSize - 1) / 2) * selectedSite.local_grid.spacing_m;

  const updateOffsetFromPointer = (clientX: number, clientY: number) => {
    const svg = gridSvgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const padX = 24;
    const padY = 20;
    const innerW = 200;
    const innerH = 200;
    const svgX = ((clientX - rect.left) / rect.width) * 248;
    const svgY = ((clientY - rect.top) / rect.height) * 240;
    const nx = Math.max(-1, Math.min(1, ((svgX - padX) / innerW) * 2 - 1));
    const ny = Math.max(-1, Math.min(1, 1 - ((svgY - padY) / innerH) * 2));
    onChangeOffset(nx, ny);
  };

  const cursorX = 24 + ((offsetXNorm + 1) * 0.5) * 200;
  const cursorY = 20 + ((1 - offsetYNorm) * 0.5) * 200;

  return (
    <div className="panel spatial-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Topografia LOLA 80 m/px & Grade Local</span>
          <h2>Mapa Polar Sul (80°S–90°S) & Malha 5×5 ({selectedSite.local_grid.spacing_m} m)</h2>
        </div>
        <div className="layer-pills" role="group" aria-label="Camada de calor local">
          {(
            [
              ['score', 'Score'],
              ['slope', 'Declive (°)'],
              ['illum', 'Solar (%)'],
              ['comms', 'Link (%)'],
            ] as [HeatmapLayer, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`pill-btn ${layer === key ? 'active' : ''}`}
              onClick={() => setLayer(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="spatial-dual">
        <div className="map-card">
          <svg
            viewBox="0 0 260 260"
            className="polar-svg"
            role="img"
            aria-label="Mapa estereográfico do Polo Sul Lunar"
          >
            <defs>
              <radialGradient id="poleBg" cx="50%" cy="50%" r="55%">
                <stop offset="0%" stopColor="#142231" />
                <stop offset="100%" stopColor="#091019" />
              </radialGradient>
            </defs>
            <circle cx={130} cy={130} r={118} fill="url(#poleBg)" stroke="#23374d" strokeWidth={1.2} />
            {[2, 4, 6, 8].map((colat) => (
              <g key={colat}>
                <circle
                  cx={130}
                  cy={130}
                  r={colat * 11.5}
                  fill="none"
                  stroke="#203245"
                  strokeDasharray="3 3"
                  strokeWidth={0.8}
                />
                <text x={133} y={130 - colat * 11.5 + 9} className="svg-muted-label">
                  {-(90 - colat)}°
                </text>
              </g>
            ))}
            {[0, 90, 180, 270].map((lon) => {
              const rad = (lon * Math.PI) / 180;
              return (
                <line
                  key={lon}
                  x1={130}
                  y1={130}
                  x2={130 + 108 * Math.sin(rad)}
                  y2={130 - 108 * Math.cos(rad)}
                  stroke="#1c2c3d"
                  strokeWidth={0.8}
                />
              );
            })}
            <text x={130} y={15} textAnchor="middle" className="svg-cardinal">
              0°E (Direção Terra)
            </text>
            <text x={245} y={133} textAnchor="end" className="svg-cardinal">
              90°E
            </text>
            <text x={130} y={253} textAnchor="middle" className="svg-cardinal">
              180°E
            </text>
            <text x={15} y={133} textAnchor="start" className="svg-cardinal">
              270°E
            </text>

            {/* Shackleton Crater physical ring (~89.67°S, 129°E, diameter 21 km ≈ 0.35° radius) */}
            <circle
              cx={projectStereo(-89.65, 125).x}
              cy={projectStereo(-89.65, 125).y}
              r={4.2}
              fill="rgba(56, 189, 248, 0.14)"
              stroke="#38bdf8"
              strokeWidth={0.8}
              strokeDasharray="1.5 1.5"
            />

            {sitePoints.map(({ site, pt, score }) => {
              const active = site.id === selectedSite.id;
              const isPsr = site.center.is_psr;
              const fill = isPsr ? '#38bdf8' : score >= 75 ? '#34d399' : score >= 55 ? '#fbbf24' : '#f87171';
              return (
                <g
                  key={site.id}
                  className="site-dot-group"
                  onClick={() => onSelectSite(site.id)}
                  style={{ cursor: 'pointer' }}
                >
                  {active && (
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={10.5}
                      fill="none"
                      stroke="#b5e9d4"
                      strokeWidth={1.3}
                      strokeDasharray="2.5 2"
                    />
                  )}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={active ? 5.2 : 3.8}
                    fill={fill}
                    stroke="#091019"
                    strokeWidth={1.2}
                  />
                  <title>{`${site.name} (${score.toFixed(1)}/100)`}</title>
                </g>
              );
            })}
          </svg>
          <div className="map-caption">
            Clique em um ponto para selecionar. Verde: Score ≥75 | Amarelo: 55–75 | Azul: PSR.
          </div>
        </div>

        <div className="map-card">
          <div className="local-grid-header">
            <span>
              Zoom local: ±{(halfSpanM / 1000).toFixed(1)} km ({selectedSite.name})
            </span>
            <button
              type="button"
              className="mini-reset-btn"
              onClick={() => onChangeOffset(0, 0)}
            >
              Centro (0, 0)
            </button>
          </div>
          <svg
            ref={gridSvgRef}
            viewBox="0 0 248 240"
            className="grid-svg"
            role="img"
            aria-label="Grade topográfica local 5 por 5 de 500 metros"
            onPointerDown={(e) => {
              draggingRef.current = true;
              updateOffsetFromPointer(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
              if (draggingRef.current) updateOffsetFromPointer(e.clientX, e.clientY);
            }}
            onPointerUp={() => {
              draggingRef.current = false;
            }}
            onPointerLeave={() => {
              draggingRef.current = false;
            }}
          >
            {selectedSite.local_grid.nodes.map((node) => {
              const cellW = 200 / gridSize;
              const x = 24 + node.col * cellW;
              const y = 20 + node.row * cellW;
              return (
                <g key={`${node.row}-${node.col}`}>
                  <rect
                    x={x + 1}
                    y={y + 1}
                    width={cellW - 2}
                    height={cellW - 2}
                    rx={4}
                    fill={colorForValue(node, layer, relayEnabled)}
                    stroke={node.is_psr ? '#38bdf8' : '#1e3044'}
                    strokeWidth={node.is_psr ? 1.5 : 0.8}
                  />
                  <text
                    x={x + cellW / 2}
                    y={y + cellW / 2 + 3.5}
                    textAnchor="middle"
                    className="grid-cell-text"
                  >
                    {metricLabel(node, layer, relayEnabled)}
                  </text>
                </g>
              );
            })}
            {/* Continuous bilinear interpolation crosshair */}
            <line x1={cursorX} y1={20} x2={cursorX} y2={220} stroke="#ffffff" strokeWidth={0.9} strokeDasharray="3 2" opacity={0.75} />
            <line x1={24} y1={cursorY} x2={224} y2={cursorY} stroke="#ffffff" strokeWidth={0.9} strokeDasharray="3 2" opacity={0.75} />
            <circle cx={cursorX} cy={cursorY} r={5.5} fill="rgba(181, 233, 212, 0.35)" stroke="#ffffff" strokeWidth={1.6} />
            <text x={124} y={234} textAnchor="middle" className="svg-muted-label">
              Offset interpolado: Δx={liveTerrain.dxM >= 0 ? '+' : ''}
              {liveTerrain.dxM.toFixed(0)} m, Δy={liveTerrain.dyM >= 0 ? '+' : ''}
              {liveTerrain.dyM.toFixed(0)} m | Alt: {liveTerrain.elevationM.toFixed(0)} m
            </text>
          </svg>
          <div className="map-caption">
            Clique ou arraste na grade para interpolar em &lt;5 ms a curva do horizonte e métricas.
          </div>
        </div>
      </div>
    </div>
  );
};
