import React, { useState } from 'react';
import { LiveSiteAnalysis } from '../navigator/math';
import {
  EngineeringConfig,
  LandingSiteEntry,
  NavigatorProvenance,
  PanelMode,
} from '../navigator/types';
import {
  describePlainCondition,
  formatCoordLatLon,
  formatUtcReadable,
  GLOSSARY,
  SiteSlot,
  WindowSummary,
} from './state';

interface DataDrawerProps {
  siteA: LandingSiteEntry;
  slotA: SiteSlot;
  analysisA: LiveSiteAnalysis;
  summaryA: WindowSummary;
  siteB: LandingSiteEntry | null;
  analysisB: LiveSiteAnalysis | null;
  summaryB: WindowSummary | null;
  epochIdx: number;
  currentUtc: string;
  config: EngineeringConfig;
  provenance: NavigatorProvenance;
  onChangeOffsetA: (xNorm: number, yNorm: number) => void;
  onChangeConfig: (next: EngineeringConfig) => void;
  onClose: () => void;
}

export const DataDrawer: React.FC<DataDrawerProps> = ({
  siteA,
  slotA,
  analysisA,
  summaryA,
  siteB,
  analysisB,
  summaryB,
  epochIdx,
  currentUtc,
  config,
  provenance,
  onChangeOffsetA,
  onChangeConfig,
  onClose,
}) => {
  const [showGlossary, setShowGlossary] = useState<boolean>(false);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  const epochTime = formatUtcReadable(currentUtc).full;
  const plainA = describePlainCondition(
    siteA.name,
    analysisA,
    epochIdx,
    summaryA,
    config.relayEnabled,
  );
  const plainB =
    siteB && analysisB && summaryB
      ? describePlainCondition(siteB.name, analysisB, epochIdx, summaryB, config.relayEnabled)
      : null;

  const epochStateA = analysisA.epochStates[epochIdx] ?? analysisA.epochStates[0];
  const epochStateB =
    analysisB ? (analysisB.epochStates[epochIdx] ?? analysisB.epochStates[0]) : null;

  return (
    <aside
      className="floating-panel panel-bottom-right"
      role="region"
      aria-label="Painel de Dados do Local Selecionado"
    >
      <div className="panel-header">
        <div>
          <h2>Dados</h2>
          <p className="panel-sub">
            {siteB ? `Comparando A (${siteA.name}) e B (${siteB.name})` : `Local A: ${siteA.name}`}
          </p>
        </div>
        <button type="button" className="btn-icon-close" onClick={onClose} aria-label="Fechar Dados">
          Fechar
        </button>
      </div>

      {/* Camada 1: Resumo em linguagem simples (3 perguntas do guia de acessibilidade) */}
      <div className="data-card">
        <h3>1. Resumo em linguagem simples</h3>
        <dl className="plain-dl">
          <div>
            <dt>Onde estou olhando?</dt>
            <dd>
              <strong>Local A: {siteA.name}</strong> — {siteA.description}
              {siteB && (
                <>
                  <br />
                  <strong>Local B: {siteB.name}</strong> — {siteB.description}
                </>
              )}
            </dd>
          </div>
          <div>
            <dt>O que estou vendo agora ({epochTime})?</dt>
            <dd>
              <strong>A:</strong> {plainA.skyNow} {plainA.commsNow}
              {plainB && (
                <>
                  <br />
                  <strong>B:</strong> {plainB.skyNow} {plainB.commsNow}
                </>
              )}
            </dd>
          </div>
          <div>
            <dt>O que muda neste período ({summaryA.durationHours.toFixed(0)}h)?</dt>
            <dd>
              Em <strong>{siteA.name}</strong>, há luz solar média em{' '}
              <strong>{summaryA.meanIllumPct.toFixed(0)}%</strong> do tempo ({summaryA.sunlitHours.toFixed(0)}h)
              e maior sombra contínua de <strong>{summaryA.maxShadowHours.toFixed(0)}h</strong>.
              {siteB && summaryB && (
                <>
                  {' '}
                  Já em <strong>{siteB.name}</strong>, a luz média é{' '}
                  <strong>{summaryB.meanIllumPct.toFixed(0)}%</strong> ({summaryB.sunlitHours.toFixed(0)}h) e a maior
                  sombra é <strong>{summaryB.maxShadowHours.toFixed(0)}h</strong>.
                </>
              )}
            </dd>
          </div>
        </dl>

        <p className="caution-banner">{plainA.cautionNote}</p>

        <button
          type="button"
          className="btn-link-expand"
          aria-expanded={showGlossary}
          onClick={() => setShowGlossary((v) => !v)}
        >
          {showGlossary ? 'Ocultar: O que significa?' : 'O que significa? (Termos explicados)'}
        </button>

        {showGlossary && (
          <div className="glossary-box">
            {GLOSSARY.map((item) => (
              <div key={item.id} className="glossary-item">
                <strong>{item.term}:</strong> <span>{item.shortExplain}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Camada 2: Indicadores científicos principais + comparação A/B */}
      <div className="data-card">
        <h3>2. Indicadores do período</h3>
        <div className="metric-table-wrap">
          <table className="mini-compare-table">
            <thead>
              <tr>
                <th scope="col">Indicador</th>
                <th scope="col">Local A</th>
                {siteB && <th scope="col">Local B</th>}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Luz solar no período</th>
                <td>{summaryA.meanIllumPct.toFixed(1)}% ({summaryA.sunlitHours.toFixed(0)} h)</td>
                {summaryB && <td>{summaryB.meanIllumPct.toFixed(1)}% ({summaryB.sunlitHours.toFixed(0)} h)</td>}
              </tr>
              <tr>
                <th scope="row">Maior sombra contínua</th>
                <td>{summaryA.maxShadowHours.toFixed(0)} h</td>
                {summaryB && <td>{summaryB.maxShadowHours.toFixed(0)} h</td>}
              </tr>
              <tr>
                <th scope="row">Terra visível (DTE)</th>
                <td>{summaryA.dteDutyPct.toFixed(1)}%</td>
                {summaryB && <td>{summaryB.dteDutyPct.toFixed(1)}%</td>}
              </tr>
              <tr>
                <th scope="row">Comunicação total {config.relayEnabled ? '(DTE+ELFO)' : '(só DTE)'}</th>
                <td>{summaryA.combinedDutyPct.toFixed(1)}%</td>
                {summaryB && <td>{summaryB.combinedDutyPct.toFixed(1)}%</td>}
              </tr>
              <tr>
                <th scope="row">Maior blackout de sinal</th>
                <td>
                  {(config.relayEnabled
                    ? summaryA.maxBlackoutCombinedHours
                    : summaryA.maxBlackoutDteHours
                  ).toFixed(0)}{' '}
                  h
                </td>
                {summaryB && (
                  <td>
                    {(config.relayEnabled
                      ? summaryB.maxBlackoutCombinedHours
                      : summaryB.maxBlackoutDteHours
                    ).toFixed(0)}{' '}
                    h
                  </td>
                )}
              </tr>
              <tr>
                <th scope="row">Declividade local (CLPS &lt; 15°)</th>
                <td>
                  {analysisA.terrain.slopeDeg.toFixed(1)}°{' '}
                  {analysisA.terrain.slopeDeg < 15 ? '(Suave)' : '(Íngreme)'}
                </td>
                {analysisB && (
                  <td>
                    {analysisB.terrain.slopeDeg.toFixed(1)}°{' '}
                    {analysisB.terrain.slopeDeg < 15 ? '(Suave)' : '(Íngreme)'}
                  </td>
                )}
              </tr>
              <tr>
                <th scope="row">Energia estimada no período</th>
                <td>{(summaryA.energyWh / 1000).toFixed(2)} kWh</td>
                {summaryB && <td>{(summaryB.energyWh / 1000).toFixed(2)} kWh</td>}
              </tr>
              <tr>
                <th scope="row">Sol / Terra neste instante</th>
                <td>
                  Sol {(epochStateA.fIllum * 100).toFixed(0)}% ·{' '}
                  {epochStateA.dteVisible ? 'Terra visível' : 'Terra oculta'}
                </td>
                {epochStateB && (
                  <td>
                    Sol {(epochStateB.fIllum * 100).toFixed(0)}% ·{' '}
                    {epochStateB.dteVisible ? 'Terra visível' : 'Terra oculta'}
                  </td>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Camada 3: Opções avançadas (recolhida inicialmente) */}
      <div className="data-card">
        <button
          type="button"
          className="btn-advanced-toggle"
          aria-expanded={showAdvanced}
          onClick={() => setShowAdvanced((v) => !v)}
        >
          <span>Opções avançadas (Coordenadas, Grid 500 m, Relay e NASA)</span>
          <span aria-hidden="true">{showAdvanced ? '▲' : '▼'}</span>
        </button>

        {showAdvanced && (
          <div className="advanced-content">
            <div className="adv-block">
              <h4>Coordenadas selenográficas &amp; relevo</h4>
              <p className="adv-line">
                <strong>A:</strong>{' '}
                {formatCoordLatLon(analysisA.terrain.latitudeDeg, analysisA.terrain.longitudeEastDeg)} · Elevação{' '}
                {analysisA.terrain.elevationM.toFixed(0)} m · Dist. PSR {analysisA.terrain.psrDistanceM.toFixed(0)} m
              </p>
              {analysisB && siteB && (
                <p className="adv-line">
                  <strong>B:</strong>{' '}
                  {formatCoordLatLon(analysisB.terrain.latitudeDeg, analysisB.terrain.longitudeEastDeg)} · Elevação{' '}
                  {analysisB.terrain.elevationM.toFixed(0)} m · Dist. PSR {analysisB.terrain.psrDistanceM.toFixed(0)} m
                </p>
              )}
            </div>

            <div className="adv-block">
              <h4>Deslocamento fino no grid local 5×5 (±500 m em A)</h4>
              <label htmlFor="adv-dx-range">
                Deslocamento Leste/Oeste (dx): {analysisA.terrain.dxM.toFixed(0)} m
              </label>
              <input
                id="adv-dx-range"
                type="range"
                min={-1}
                max={1}
                step={0.1}
                value={slotA.xNorm}
                onChange={(e) => onChangeOffsetA(Number(e.target.value), slotA.yNorm)}
              />
              <label htmlFor="adv-dy-range">
                Deslocamento Norte/Sul (dy): {analysisA.terrain.dyM.toFixed(0)} m
              </label>
              <input
                id="adv-dy-range"
                type="range"
                min={-1}
                max={1}
                step={0.1}
                value={slotA.yNorm}
                onChange={(e) => onChangeOffsetA(slotA.xNorm, Number(e.target.value))}
              />
              <button
                type="button"
                className="btn-secondary-sm"
                onClick={() => onChangeOffsetA(0, 0)}
              >
                Centralizar ponto A no sítio
              </button>
            </div>

            <div className="adv-block">
              <h4>Parâmetros do sistema espacial</h4>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={config.relayEnabled}
                  onChange={(e) =>
                    onChangeConfig({ ...config, relayEnabled: e.target.checked })
                  }
                />
                <span>Ativar Rede Satélites Relay (ELFO)</span>
              </label>

              <label htmlFor="adv-panel-mode">Modo do painel solar</label>
              <select
                id="adv-panel-mode"
                className="ui-select"
                value={config.panelMode}
                onChange={(e) =>
                  onChangeConfig({ ...config, panelMode: e.target.value as PanelMode })
                }
              >
                <option value="tracking">Rastreamento solar vertical (ideal)</option>
                <option value="fixed_north">Painel fixo voltado para o Norte (0° L)</option>
                <option value="fixed_horiz">Painel plano horizontal</option>
              </select>

              <label htmlFor="adv-panel-area">
                Área do painel solar: {config.panelAreaM2.toFixed(1)} m²
              </label>
              <input
                id="adv-panel-area"
                type="range"
                min={1}
                max={20}
                step={0.5}
                value={config.panelAreaM2}
                onChange={(e) =>
                  onChangeConfig({ ...config, panelAreaM2: Number(e.target.value) })
                }
              />
            </div>

            <div className="adv-block">
              <h4>Fontes e Limitações NASA</h4>
              <p className="adv-line">
                DEM: <code>{provenance.dem_product.product_id}</code> ({provenance.dem_product.resolution_m} m/px) ·
                Efemérides: {provenance.ephemeris.engine} ({provenance.ephemeris.frame})
              </p>
              {provenance.horizons_validation.max_sun_az_diff_deg != null && (
                <p className="adv-line">
                  Validação Cruzada JPL Horizons ({provenance.horizons_validation.status}): erro máximo Sol Az{' '}
                  {provenance.horizons_validation.max_sun_az_diff_deg.toFixed(3)}° / El{' '}
                  {(provenance.horizons_validation.max_sun_el_diff_deg ?? 0).toFixed(3)}°
                </p>
              )}
              <ul className="limitation-list">
                {provenance.limitations.slice(0, 3).map((lim, i) => (
                  <li key={i}>{lim}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
