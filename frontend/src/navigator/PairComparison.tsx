import React, { useId, useState } from 'react';
import { NO_VALUE, formatDeg, formatHours, formatNumber, formatPct } from './format';
import { horizonState } from './horizonState';
import { LiveSiteAnalysis, psrSearchFoundNothing } from './math';
import { periodStats } from './periodStats';
import { formatUtc } from './timeWindow';
import { LandingSiteEntry } from './types';

export interface PairRow {
  site: LandingSiteEntry;
  /** Evaluated at the site centre with the page settings. */
  analysis: LiveSiteAnalysis;
}

interface PairComparisonProps {
  rows: PairRow[];
  /** Initial site A (the site selected in section 1). */
  initialSiteId: string;
  timestamps: string[];
  stepSeconds: number;
  startIdx: number;
  endIdx: number;
  /** null when the requested instant has no sample (no instant value is shown, CA-6). */
  epochIdx: number | null;
  slopeLimitDeg: number;
  psrSearchRadiusM?: number;
}

type Cell = { text: string; className?: string };

const stateCell = (elevation: number, reference: number): Cell =>
  horizonState(elevation, reference) === 'above'
    ? { text: 'Acima', className: 'state-above' }
    : { text: 'Não está acima', className: 'state-not-above' };

function psrCell(row: PairRow, radiusM: number | undefined): Cell {
  if (row.analysis.terrain.isPsr) return { text: 'dentro (marcado no arquivo)' };
  const d = row.analysis.terrain.psrDistanceM;
  if (psrSearchFoundNothing(row.site) || d === null) {
    return { text: radiusM === undefined ? 'nenhuma encontrada' : `nenhuma encontrada até ${formatNumber(radiusM / 1000, 1)} km` };
  }
  return { text: `${formatNumber(d, 0)} m` };
}

function indexCell(row: PairRow): Cell {
  const s = row.analysis.score;
  if (s.total_0_100 === null) return { text: 'sem índice' };
  return { text: s.eliminated ? '0 de 100 (eliminado)' : `${formatNumber(s.total_0_100, 1)} de 100` };
}

/**
 * Two sites side by side at the same instant and over the same period (SPA-12, SPA-7 CA-2). Every
 * value in a column comes from that column's own site: nothing is copied from the other site,
 * from a neighbouring instant or from outside the selected period.
 */
export const PairComparison: React.FC<PairComparisonProps> = ({
  rows,
  initialSiteId,
  timestamps,
  stepSeconds,
  startIdx,
  endIdx,
  epochIdx,
  slopeLimitDeg,
  psrSearchRadiusM,
}) => {
  const id = useId();
  const [aId, setAId] = useState(initialSiteId);
  const [bId, setBId] = useState(() => (rows.find((r) => r.site.id !== initialSiteId) ?? rows[0]).site.id);
  const a = rows.find((r) => r.site.id === aId) ?? rows[0];
  const b = rows.find((r) => r.site.id === bId) ?? rows[0];
  const stepHours = stepSeconds / 3600;
  const period = `${formatUtc(timestamps[startIdx])} a ${formatUtc(timestamps[endIdx])}`;
  const instant = epochIdx === null ? null : formatUtc(timestamps[epochIdx]);

  const instantRow = (label: string, cell: (r: PairRow, i: number) => Cell): [string, Cell, Cell] => [
    label,
    epochIdx === null ? { text: 'sem amostra' } : cell(a, epochIdx),
    epochIdx === null ? { text: 'sem amostra' } : cell(b, epochIdx),
  ];
  const sun = (r: PairRow, i: number) => r.site.sky_series.sun_el_deg[i];
  const earth = (r: PairRow, i: number) => r.site.sky_series.earth_el_deg[i];
  const statsA = periodStats(a.analysis, startIdx, endIdx, stepHours);
  const statsB = periodStats(b.analysis, startIdx, endIdx, stepHours);
  const slopeCell = (r: PairRow): Cell => {
    const steep = r.analysis.terrain.slopeDeg > slopeLimitDeg;
    // The words carry the state (never colour alone).
    return { text: `${formatDeg(r.analysis.terrain.slopeDeg, 1)} (${steep ? 'acima de' : 'até'} ${formatDeg(slopeLimitDeg, 0)})` };
  };

  const lines: Array<[string, Cell, Cell]> = [
    instantRow('Sol: elevação do centro', (r, i) => ({ text: formatDeg(sun(r, i)) })),
    instantRow('Sol em relação ao horizonte idealizado (0°)', (r, i) => stateCell(sun(r, i), 0)),
    instantRow('Sol em relação ao relevo nessa direção', (r, i) => stateCell(sun(r, i), r.analysis.epochStates[i].horizonAtSunDeg)),
    instantRow('Terra: elevação do centro', (r, i) => ({ text: formatDeg(earth(r, i)) })),
    instantRow('Terra em relação ao horizonte idealizado (0°)', (r, i) => stateCell(earth(r, i), 0)),
    instantRow('Terra em relação ao relevo nessa direção', (r, i) => stateCell(earth(r, i), r.analysis.epochStates[i].horizonAtEarthDeg)),
    ['No período: disco solar acima do relevo, em média', { text: formatPct(statsA.meanIllumFraction * 100) }, { text: formatPct(statsB.meanIllumFraction * 100) }],
    ['No período: maior intervalo com o disco solar todo abaixo do relevo', { text: formatHours(statsA.maxShadowHours) }, { text: formatHours(statsB.maxShadowHours) }],
    ['No período: tempo com visada direta para a Terra', { text: formatPct(statsA.dtePct) }, { text: formatPct(statsB.dtePct) }],
    ['Declive no centro', slopeCell(a), slopeCell(b)],
    ['Distância até sombra permanente', psrCell(a, psrSearchRadiusM), psrCell(b, psrSearchRadiusM)],
    ['Índice ilustrativo (período inteiro do arquivo)', indexCell(a), indexCell(b)],
  ];

  return (
    <div className="pair-comparison">
      <h3 id={`${id}-titulo`}>Local A × local B</h3>
      <p className="field-help">
        Os dois locais são lidos no mesmo instante e no mesmo período escolhidos na seção 1. Cada coluna usa só os
        valores do próprio local, no centro dele. Elevações acima ou abaixo de 0° descrevem geometria; não indicam luz
        efetiva, energia nem comunicação.
      </p>
      <div className="field-row">
        <div className="field">
          <label htmlFor={`${id}-a`}>Local A</label>
          <select id={`${id}-a`} value={a.site.id} onChange={(e) => setAId(e.target.value)}>
            {rows.map((r) => (
              <option key={r.site.id} value={r.site.id}>
                {r.site.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-b`}>Local B</label>
          <select id={`${id}-b`} value={b.site.id} onChange={(e) => setBId(e.target.value)}>
            {rows.map((r) => (
              <option key={r.site.id} value={r.site.id}>
                {r.site.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {a.site.id === b.site.id && <p className="caveat">A e B são o mesmo local: escolha dois locais diferentes para comparar.</p>}
      <div className="table-scroll" tabIndex={0} role="region" aria-labelledby={`${id}-titulo`}>
        <table className="ranking-table pair-table">
          <caption>
            {a.site.name} (A) e {b.site.name} (B). Instante: {instant ?? 'sem amostra para o instante pedido'}. Período:{' '}
            {period} ({statsA.samples} instantes).
          </caption>
          <thead>
            <tr>
              <th scope="col">Indicador</th>
              <th scope="col">A: {a.site.name}</th>
              <th scope="col">B: {b.site.name}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(([label, ca, cb]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td className={ca.className ?? 'mono-cell'}>{ca.text || NO_VALUE}</td>
                <td className={cb.className ?? 'mono-cell'}>{cb.text || NO_VALUE}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
