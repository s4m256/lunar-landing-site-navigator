import React, { useState } from 'react';
import { formatNumber, yesNo } from './format';
import { horizonState } from './horizonState';
import { LiveSiteAnalysis } from './math';
import { formatStep, formatUtc, sampleIndices } from './timeWindow';
import { LandingSiteEntry } from './types';

interface IntervalDataTableProps {
  site: LandingSiteEntry;
  analysis: LiveSiteAnalysis;
  timestamps: string[];
  stepSeconds: number;
  startIdx: number;
  endIdx: number;
  relayEnabled: boolean;
}

const MAX_ROWS = 49;
const above = (el: number, ref: number) => (horizonState(el, ref) === 'above' ? 'acima' : 'não está acima');

/** Text alternative to the sky plot and time-series charts: the same values as a table. */
export const IntervalDataTable: React.FC<IntervalDataTableProps> = ({
  site,
  analysis,
  timestamps,
  stepSeconds,
  startIdx,
  endIdx,
  relayEnabled,
}) => {
  const [open, setOpen] = useState(false);
  const { indices, stride } = sampleIndices(startIdx, endIdx, MAX_ROWS);
  const sky = site.sky_series;

  return (
    <section className="panel" aria-labelledby="tabela-titulo">
      <h2 id="tabela-titulo">6. Valores em tabela</h2>
      <p className="field-help">
        Alternativa em texto aos gráficos: os mesmos valores do período escolhido, para {site.name}. “Acima” só quando
        a elevação do centro é maior que a referência; igual conta como “não está acima”.
      </p>
      <details onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>Ver dados do período em tabela</summary>
        {open && (
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabela de valores do período">
            <table className="ranking-table data-table">
              <caption>
                Sol e Terra vistos de {site.name}, de {formatUtc(timestamps[startIdx])} a {formatUtc(timestamps[endIdx])}.{' '}
                {stride > 1
                  ? `Mostrando um instante a cada ${formatStep(stride * stepSeconds)} (${indices.length} linhas); reduza o período para ver todos os instantes.`
                  : `Todos os ${indices.length} instantes do período.`}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Instante (UTC)</th>
                  <th scope="col">Sol: elevação (°)</th>
                  <th scope="col">Sol: direção (°)</th>
                  <th scope="col">Sol x horizonte idealizado (0°)</th>
                  <th scope="col">Relevo na direção do Sol (°)</th>
                  <th scope="col">Sol x relevo</th>
                  <th scope="col">Disco solar acima do relevo (%)</th>
                  <th scope="col">Terra: elevação (°)</th>
                  <th scope="col">Terra: direção (°)</th>
                  <th scope="col">Terra x horizonte idealizado (0°)</th>
                  <th scope="col">Relevo na direção da Terra (°)</th>
                  <th scope="col">Terra x relevo</th>
                  <th scope="col">Visada direta para a Terra</th>
                  {relayEnabled && <th scope="col">Constelação hipotética visível</th>}
                </tr>
              </thead>
              <tbody>
                {indices.map((i) => {
                  const st = analysis.epochStates[i];
                  const sunEl = sky.sun_el_deg[i];
                  const earthEl = sky.earth_el_deg[i];
                  return (
                    <tr key={i}>
                      <th scope="row" className="mono-cell">
                        {formatUtc(timestamps[i]).replace(' UTC', '')}
                      </th>
                      <td className="mono-cell">{formatNumber(sunEl, 3)}</td>
                      <td className="mono-cell">{formatNumber(sky.sun_az_deg[i], 1)}</td>
                      <td>{above(sunEl, 0)}</td>
                      <td className="mono-cell">{formatNumber(st.horizonAtSunDeg, 3)}</td>
                      <td>{above(sunEl, st.horizonAtSunDeg)}</td>
                      <td className="mono-cell">{formatNumber(st.fIllum * 100, 0)}</td>
                      <td className="mono-cell">{formatNumber(earthEl, 3)}</td>
                      <td className="mono-cell">{formatNumber(sky.earth_az_deg[i], 1)}</td>
                      <td>{above(earthEl, 0)}</td>
                      <td className="mono-cell">{formatNumber(st.horizonAtEarthDeg, 3)}</td>
                      <td>{above(earthEl, st.horizonAtEarthDeg)}</td>
                      <td>{yesNo(st.dteVisible)}</td>
                      {relayEnabled && <td>{yesNo(st.elfoConstellationVisible)}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </section>
  );
};
