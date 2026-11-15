import React from 'react';
import { formatDeg, formatNumber, yesNo } from './format';
import { HorizonState, horizonState, idealHorizonText, reliefHorizonText } from './horizonState';
import { LiveSiteAnalysis } from './math';
import { EngineeringConfig, LandingSiteEntry } from './types';

interface InstantSummaryProps {
  site: LandingSiteEntry;
  analysis: LiveSiteAnalysis;
  epochIdx: number;
  /** Message explaining why there is no sample; when set, no value is shown. */
  missingInstant: string | null;
  utcLabel: string;
  config: EngineeringConfig;
  /** When false (animation running) screen readers are not interrupted at every step. */
  announce: boolean;
}

/** Short word in the table; the full sentence is in the list above it. */
function StateCell({ state }: { state: HorizonState }) {
  if (state === 'no_data') return <td>sem dado</td>;
  return <td className={state === 'above' ? 'state-above' : 'state-not-above'}>{state === 'above' ? 'Acima' : 'Não está acima'}</td>;
}

/** Plain-language reading of the selected instant; every number comes from the file or the page's interpolation. */
export const InstantSummary: React.FC<InstantSummaryProps> = ({
  site,
  analysis,
  epochIdx,
  missingInstant,
  utcLabel,
  config,
  announce,
}) => {
  const offCenter = !analysis.isCenter;

  let body: React.ReactNode;
  if (missingInstant !== null) {
    body = (
      <div className="state-missing">
        <p>
          <strong>Sem amostra para este local e instante.</strong>
        </p>
        <p>{missingInstant}</p>
        <p>Nenhuma direção ou elevação é mostrada. Escolha um instante que exista no arquivo.</p>
      </div>
    );
  } else {
    const state = analysis.epochStates[epochIdx];
    const sky = site.sky_series;
    const sunEl = sky.sun_el_deg[epochIdx];
    const earthEl = sky.earth_el_deg[epochIdx];
    const sunIdeal = idealHorizonText('sun', sunEl);
    const earthIdeal = idealHorizonText('earth', earthEl);
    const sunRelief = reliefHorizonText('sun', sunEl, state.horizonAtSunDeg);
    const earthRelief = reliefHorizonText('earth', earthEl, state.horizonAtEarthDeg);

    body = (
      <>
        <p className="summary-lead">
          <strong>{site.name}</strong>, {utcLabel}.
        </p>
        {offCenter && (
          <p className="field-help">
            Ponto deslocado do centro do local: o relevo foi interpolado nesta página entre pontos da grade do
            arquivo; as posições do Sol e da Terra são as do centro do local.
          </p>
        )}
        <ul className="summary-list">
          <li>
            {sunIdeal}; {sunRelief.charAt(0).toLowerCase() + sunRelief.slice(1)}.
          </li>
          <li>
            {earthIdeal}; {earthRelief.charAt(0).toLowerCase() + earthRelief.slice(1)}.
          </li>
        </ul>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabela do Sol e da Terra no instante">
          <table className="state-table">
            <caption className="sr-only">
              Sol e Terra em relação ao horizonte em {site.name}, {utcLabel}
            </caption>
            <thead>
              <tr>
                <th scope="col">Grandeza</th>
                <th scope="col">Sol</th>
                <th scope="col">Terra</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Direção (azimute, a partir do norte, sentido horário)</th>
                <td className="mono-cell">{formatDeg(sky.sun_az_deg[epochIdx], 1)}</td>
                <td className="mono-cell">{formatDeg(sky.earth_az_deg[epochIdx], 1)}</td>
              </tr>
              <tr>
                <th scope="row">Elevação do centro</th>
                <td className="mono-cell">{formatDeg(sunEl)}</td>
                <td className="mono-cell">{formatDeg(earthEl)}</td>
              </tr>
              <tr>
                <th scope="row">Em relação ao horizonte idealizado (0°, sem relevo)</th>
                <StateCell state={horizonState(sunEl)} />
                <StateCell state={horizonState(earthEl)} />
              </tr>
              <tr>
                <th scope="row">Relevo nessa direção (perfil de horizonte do arquivo)</th>
                <td className="mono-cell">{formatDeg(state.horizonAtSunDeg)}</td>
                <td className="mono-cell">{formatDeg(state.horizonAtEarthDeg)}</td>
              </tr>
              <tr>
                <th scope="row">Em relação ao relevo</th>
                <StateCell state={horizonState(sunEl, state.horizonAtSunDeg)} />
                <StateCell state={horizonState(earthEl, state.horizonAtEarthDeg)} />
              </tr>
              <tr>
                <th scope="row">Parte do disco solar acima do relevo (estimativa geométrica)</th>
                <td className="mono-cell">{formatNumber(state.fIllum * 100, 0)}%</td>
                <td>não se aplica</td>
              </tr>
              <tr>
                <th scope="row">
                  Visada direta para a Terra ({config.dteMarginMode === 'full_disk' ? 'disco inteiro' : 'centro'} acima
                  do relevo)
                </th>
                <td>não se aplica</td>
                <td>{yesNo(state.dteVisible)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {config.relayEnabled && (
          <p>
            <strong>Retransmissores hipotéticos</strong> (constelação modelada no arquivo, não existe em operação):
            pelo menos um satélite acima do relevo + {formatDeg(config.antennaMaskDeg, 0)}:{' '}
            {state.elfoConstellationVisible === null
              ? 'sem dado para pontos fora do centro do local'
              : yesNo(state.elfoConstellationVisible)}
            .
          </p>
        )}
      </>
    );
  }

  return (
    <section className="panel summary-panel" aria-labelledby="resumo-titulo">
      <h2 id="resumo-titulo">2. Resumo do instante</h2>
      <div aria-live={announce ? 'polite' : 'off'} aria-atomic="true" data-testid="instant-summary">
        {body}
      </div>
      <details>
        <summary>O que significa?</summary>
        <dl className="glossary">
          <dt>Direção (azimute)</dt>
          <dd>Para onde olhar: ângulo a partir do norte do local, no sentido horário (90° é leste).</dd>
          <dt>Elevação</dt>
          <dd>Altura angular do centro do astro em relação ao plano horizontal do local.</dd>
          <dt>Horizonte idealizado</dt>
          <dd>
            Plano de 0°, sem montanhas nem crateras. “Acima” só quando a elevação é maior que 0°; exatamente 0° conta
            como “não está acima”.
          </dd>
          <dt>Relevo nessa direção</dt>
          <dd>Altura angular de montanhas e bordas de crateras segundo o perfil de horizonte do arquivo.</dd>
        </dl>
        <p className="field-help">
          Estes valores descrevem geometria. Não indicam luz efetiva no local, energia nem comunicação.
        </p>
      </details>
    </section>
  );
};
