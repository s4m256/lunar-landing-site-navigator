import React, { useId, useMemo, useRef, useState } from 'react';
import { formatDeg, formatNumber } from './format';
import { InterpolatedTerrain, computeCompositeScore } from './math';
import { EngineeringConfig, LandingSiteEntry, LocalGridNode } from './types';

/** What the index layer needs from the page settings. */
export type GridScoreSettings = Pick<EngineeringConfig, 'weights' | 'relayEnabled' | 'slopeLimitDeg'>;

/**
 * Illustrative index of one grid node, computed here with the shared formula (contract 1.1.0 rule)
 * from the node summaries stored in the file; null when every weight is zero.
 */
export function nodeScore(node: LocalGridNode, settings: GridScoreSettings): number | null {
  const w = settings.weights;
  if (w.safety + w.power + w.comms + w.science_psr <= 0) return null;
  return computeCompositeScore(
    node.slope_deg,
    node.mean_illum_fraction,
    node.max_continuous_shadow_hours,
    node.dte_full_disk_duty_cycle_pct,
    node.combined_dte_elfo_duty_cycle_pct,
    node.psr_distance_m,
    node.is_psr,
    w,
    settings.relayEnabled,
    settings.slopeLimitDeg,
  ).total_0_100;
}

type HeatmapLayer = 'score' | 'slope' | 'illum' | 'comms';

interface SouthPoleGridMapProps {
  sites: LandingSiteEntry[];
  selectedSite: LandingSiteEntry;
  liveTerrain: InterpolatedTerrain;
  relayEnabled: boolean;
  /** Weights, relay option and slope limit used for the index layer. */
  scoreSettings: GridScoreSettings;
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

function colorForValue(node: LocalGridNode, layer: HeatmapLayer, relayEnabled: boolean, settings: GridScoreSettings): string {
  if (layer === 'slope') {
    // Continuous ramp only; the number printed in each cell carries the value.
    const t = Math.max(0, Math.min(1, 1 - node.slope_deg / 20));
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
  const score = nodeScore(node, settings);
  if (score === null) return 'rgba(60, 70, 85, 0.6)';
  const s = score / 100;
  return `rgba(${Math.round(30 + (1 - s) * 170)}, ${Math.round(65 + s * 165)}, ${Math.round(80 + s * 110)}, 0.78)`;
}

function metricLabel(node: LocalGridNode, layer: HeatmapLayer, relayEnabled: boolean, settings: GridScoreSettings): string {
  if (layer === 'slope') return formatDeg(node.slope_deg, 1);
  if (layer === 'illum') return `${formatNumber(node.mean_illum_fraction * 100, 0)}%`;
  if (layer === 'comms') {
    const v = relayEnabled ? node.combined_dte_elfo_duty_cycle_pct : node.dte_full_disk_duty_cycle_pct;
    return `${formatNumber(v, 0)}%`;
  }
  const score = nodeScore(node, settings);
  return score === null ? '—' : formatNumber(score, 0);
}

function layerOptions(relayEnabled: boolean, slopeLimitDeg: number): Array<{ key: HeatmapLayer; label: string; description: string }> {
  return [
    { key: 'slope', label: 'Declive (°)', description: 'o declive do terreno em graus' },
    {
      key: 'illum',
      label: 'Disco solar acima do relevo (%)',
      description: 'a parte média do disco solar acima do relevo no período do arquivo, em %',
    },
    relayEnabled
      ? {
          key: 'comms',
          label: 'Terra ou retransmissor hipotético (%)',
          description: 'a parte do período com visada para a Terra ou para a constelação hipotética, em %',
        }
      : {
          key: 'comms',
          label: 'Visada para a Terra (%)',
          description: 'a parte do período com o disco inteiro da Terra acima do relevo, em %',
        },
    {
      key: 'score',
      label: 'Índice ilustrativo (pesos atuais)',
      description: `o índice ilustrativo calculado nesta página para cada ponto da grade, a partir dos resumos gravados no arquivo, com os pesos e a opção de retransmissores atuais; declive acima de ${formatDeg(slopeLimitDeg, 0)} dá índice 0`,
    },
  ];
}

const signed = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(0)}`;

export const SouthPoleGridMap: React.FC<SouthPoleGridMapProps> = ({
  sites,
  selectedSite,
  liveTerrain,
  relayEnabled,
  scoreSettings,
  offsetXNorm,
  offsetYNorm,
  onSelectSite,
  onChangeOffset,
}) => {
  const [layer, setLayer] = useState<HeatmapLayer>('slope');
  const gridSvgRef = useRef<SVGSVGElement | null>(null);
  const draggingRef = useRef(false);
  const ids = useId();

  const sitePoints = useMemo(
    () =>
      sites.map((s, i) => ({
        site: s,
        number: i + 1,
        pt: projectStereo(s.center.latitude_deg, s.center.longitude_east_deg),
      })),
    [sites],
  );

  const gridSize = selectedSite.local_grid.grid_size;
  const spacingM = selectedSite.local_grid.spacing_m;
  const halfSpanM = ((gridSize - 1) / 2) * spacingM;
  const layers = layerOptions(relayEnabled, scoreSettings.slopeLimitDeg);
  const activeLayer = layers.find((l) => l.key === layer) ?? layers[0];

  const updateOffsetFromPointer = (clientX: number, clientY: number) => {
    const svg = gridSvgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const svgX = ((clientX - rect.left) / rect.width) * 248;
    const svgY = ((clientY - rect.top) / rect.height) * 240;
    const nx = Math.max(-1, Math.min(1, ((svgX - 24) / 200) * 2 - 1));
    const ny = Math.max(-1, Math.min(1, 1 - ((svgY - 20) / 200) * 2));
    onChangeOffset(nx, ny);
  };

  const cursorX = 24 + (offsetXNorm + 1) * 0.5 * 200;
  const cursorY = 20 + (1 - offsetYNorm) * 0.5 * 200;

  return (
    <section className="panel spatial-panel" aria-labelledby={`${ids}-titulo`}>
      <div className="panel-head">
        <h2 id={`${ids}-titulo`}>4. Mapa dos locais</h2>
      </div>

      <div className="spatial-dual">
        <div className="map-card">
          <h3>Polo sul da Lua (80° S a 90° S)</h3>
          <svg
            viewBox="0 0 260 260"
            className="polar-svg"
            role="img"
            aria-label="Mapa estereográfico do Polo Sul Lunar"
            aria-describedby={`${ids}-mapa-desc`}
          >
            <circle cx={130} cy={130} r={118} fill="#0c1826" stroke="#5b7896" strokeWidth={1.2} />
            {[2, 4, 6, 8].map((colat) => (
              <g key={colat}>
                <circle cx={130} cy={130} r={colat * 11.5} fill="none" stroke="#3a536e" strokeDasharray="3 3" strokeWidth={0.8} />
                <text x={133} y={130 - colat * 11.5 + 9} className="svg-muted-label">
                  {-(90 - colat)}°
                </text>
              </g>
            ))}
            {[0, 90, 180, 270].map((lon) => {
              const rad = (lon * Math.PI) / 180;
              return (
                <line key={lon} x1={130} y1={130} x2={130 + 108 * Math.sin(rad)} y2={130 - 108 * Math.cos(rad)} stroke="#3a536e" strokeWidth={0.8} />
              );
            })}
            <text x={130} y={15} textAnchor="middle" className="svg-cardinal">
              0° L
            </text>
            <text x={245} y={133} textAnchor="end" className="svg-cardinal">
              90° L
            </text>
            <text x={130} y={253} textAnchor="middle" className="svg-cardinal">
              180° L
            </text>
            <text x={15} y={133} textAnchor="start" className="svg-cardinal">
              270° L
            </text>

            {sitePoints.map(({ site, pt, number }) => {
              const active = site.id === selectedSite.id;
              const r = active ? 7.5 : 6;
              return (
                <g key={site.id} className="site-dot-group" onClick={() => onSelectSite(site.id)}>
                  {site.center.is_psr ? (
                    <rect x={pt.x - r} y={pt.y - r} width={r * 2} height={r * 2} fill={active ? '#ffffff' : '#0c1826'} stroke="#ffffff" strokeWidth={active ? 2.2 : 1.2} />
                  ) : (
                    <circle cx={pt.x} cy={pt.y} r={r} fill={active ? '#ffffff' : '#0c1826'} stroke="#ffffff" strokeWidth={active ? 2.2 : 1.2} />
                  )}
                  <text x={pt.x} y={pt.y + 2.6} textAnchor="middle" className={`site-dot-number ${active ? 'active' : ''}`}>
                    {number}
                  </text>
                </g>
              );
            })}
          </svg>
          <p id={`${ids}-mapa-desc`} className="map-caption">
            Cada número é um local da lista abaixo. Marcador preenchido: local selecionado. Marcador quadrado: o
            centro do local é marcado no arquivo como região permanentemente sombreada. Locais próximos podem se
            sobrepor no mapa; use a lista para escolher.
          </p>
          <ol className="site-legend" aria-label="Locais do mapa">
            {sitePoints.map(({ site }) => (
              <li key={site.id}>
                <button
                  type="button"
                  className="site-legend-btn"
                  aria-pressed={site.id === selectedSite.id}
                  onClick={() => onSelectSite(site.id)}
                >
                  {site.name}
                  <span className="site-cat-sub">
                    latitude {formatDeg(site.center.latitude_deg, 2)}, longitude {formatDeg(site.center.longitude_east_deg, 1)} L
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>

        <div className="map-card">
          <h3>
            Arredores de {selectedSite.name} (±{formatNumber(halfSpanM / 1000, 1)} km)
          </h3>
          <div className="layer-pills" role="group" aria-label="Valor mostrado na grade">
            {layers.map(({ key, label }) => (
              <button key={key} type="button" className="btn btn-small" aria-pressed={layer === key} onClick={() => setLayer(key)}>
                {label}
              </button>
            ))}
          </div>
          <svg
            ref={gridSvgRef}
            viewBox="0 0 248 240"
            className="grid-svg"
            role="img"
            aria-label={`Grade local de ${gridSize} por ${gridSize} pontos, um a cada ${formatNumber(spacingM, 0)} metros, mostrando ${activeLayer.description}`}
            aria-describedby={`${ids}-grade-desc`}
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
                    fill={colorForValue(node, layer, relayEnabled, scoreSettings)}
                    stroke={node.is_psr ? '#ffffff' : '#3a536e'}
                    strokeWidth={node.is_psr ? 1.6 : 0.8}
                    strokeDasharray={node.is_psr ? '3 2' : undefined}
                  />
                  <text x={x + cellW / 2} y={y + cellW / 2 + 3.5} textAnchor="middle" className="grid-cell-text">
                    {metricLabel(node, layer, relayEnabled, scoreSettings)}
                  </text>
                </g>
              );
            })}
            <line x1={cursorX} y1={20} x2={cursorX} y2={220} stroke="#ffffff" strokeWidth={0.9} strokeDasharray="3 2" />
            <line x1={24} y1={cursorY} x2={224} y2={cursorY} stroke="#ffffff" strokeWidth={0.9} strokeDasharray="3 2" />
            <circle cx={cursorX} cy={cursorY} r={7} fill="none" stroke="#ffffff" strokeWidth={1.8} />
          </svg>
          <p id={`${ids}-grade-desc`} className="map-caption">
            Cada célula mostra {activeLayer.description}
            {layer === 'score'
              ? '; esse índice muda com as opções avançadas.'
              : ', como gravado no arquivo para aquele ponto; esses valores não mudam com as opções avançadas.'}{' '}
            Borda tracejada: ponto marcado no arquivo como região permanentemente
            sombreada. A cruz indica o ponto analisado: Δx {signed(liveTerrain.dxM)} m, Δy {signed(liveTerrain.dyM)} m
            do centro, altitude {formatNumber(liveTerrain.elevationM, 0)} m, declive {formatDeg(liveTerrain.slopeDeg, 1)}
            {liveTerrain.dxM === 0 && liveTerrain.dyM === 0 ? ' (centro do local).' : ' (valores interpolados nesta página).'}
          </p>
          <div className="field">
            <label htmlFor={`${ids}-dx`}>Mover o ponto analisado na horizontal (Δx)</label>
            <input
              id={`${ids}-dx`}
              type="range"
              min={-1}
              max={1}
              step={0.05}
              value={offsetXNorm}
              aria-valuetext={`${signed(offsetXNorm * halfSpanM)} metros`}
              onChange={(e) => onChangeOffset(Number(e.target.value), offsetYNorm)}
            />
          </div>
          <div className="field">
            <label htmlFor={`${ids}-dy`}>Mover o ponto analisado na vertical (Δy)</label>
            <input
              id={`${ids}-dy`}
              type="range"
              min={-1}
              max={1}
              step={0.05}
              value={offsetYNorm}
              aria-valuetext={`${signed(offsetYNorm * halfSpanM)} metros`}
              onChange={(e) => onChangeOffset(offsetXNorm, Number(e.target.value))}
            />
          </div>
          <button type="button" className="btn btn-small" disabled={offsetXNorm === 0 && offsetYNorm === 0} onClick={() => onChangeOffset(0, 0)}>
            Voltar ao centro do local
          </button>
          <p className="map-caption">
            Você também pode clicar ou arrastar na grade. Fora do centro, o relevo é interpolado nesta página entre os
            pontos da grade e as posições do Sol e da Terra são as do centro; a visibilidade dos retransmissores
            hipotéticos não existe no arquivo para esses pontos.
          </p>
          <details>
            <summary>Ver a grade em tabela</summary>
            <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabela da grade local">
              <table className="ranking-table data-table">
                <caption>
                  Pontos da grade local de {selectedSite.name}, como gravados no arquivo; o índice ilustrativo é calculado
                  nesta página com os pesos atuais.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Δx (m)</th>
                    <th scope="col">Δy (m)</th>
                    <th scope="col">Altitude (m)</th>
                    <th scope="col">Declive (°)</th>
                    <th scope="col">Disco solar acima do relevo, em média (%)</th>
                    <th scope="col">{layers[2].label}</th>
                    <th scope="col">Índice ilustrativo (pesos atuais)</th>
                    <th scope="col">Sombra permanente</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSite.local_grid.nodes.map((node) => (
                    <tr key={`${node.row}-${node.col}`}>
                      <td className="mono-cell">{signed(node.dx_m)}</td>
                      <td className="mono-cell">{signed(node.dy_m)}</td>
                      <td className="mono-cell">{formatNumber(node.elevation_m, 0)}</td>
                      <td className="mono-cell">{metricLabel(node, 'slope', relayEnabled, scoreSettings)}</td>
                      <td className="mono-cell">{metricLabel(node, 'illum', relayEnabled, scoreSettings)}</td>
                      <td className="mono-cell">{metricLabel(node, 'comms', relayEnabled, scoreSettings)}</td>
                      <td className="mono-cell">{metricLabel(node, 'score', relayEnabled, scoreSettings)}</td>
                      <td>{node.is_psr ? 'sim' : 'não'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      </div>
    </section>
  );
};
