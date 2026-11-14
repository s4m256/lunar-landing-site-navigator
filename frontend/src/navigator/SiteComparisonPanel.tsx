import React, { useState } from 'react';
import { LiveSiteAnalysis } from './math';
import {
  EngineeringConfig,
  LandingSiteEntry,
  NavigatorProvenance,
  PanelMode,
  RelayPresets,
} from './types';

interface RankedSiteRow {
  site: LandingSiteEntry;
  analysis: LiveSiteAnalysis;
}

interface SiteComparisonPanelProps {
  rankedSites: RankedSiteRow[];
  selectedSiteId: string;
  config: EngineeringConfig;
  provenance: NavigatorProvenance;
  relayPresets: RelayPresets;
  onSelectSite: (siteId: string) => void;
  onChangeConfig: (next: EngineeringConfig) => void;
}

function slopeBadgeClass(slopeDeg: number, limitDeg: number): { cls: string; text: string } {
  if (slopeDeg >= 15) return { cls: 'hazard-high', text: 'Risco (>15°)' };
  if (slopeDeg >= limitDeg || slopeDeg >= 10) return { cls: 'hazard-warn', text: 'Alerta (10-15°)' };
  return { cls: 'hazard-ok', text: 'CLPS OK' };
}

export const SiteComparisonPanel: React.FC<SiteComparisonPanelProps> = ({
  rankedSites,
  selectedSiteId,
  config,
  provenance,
  relayPresets,
  onSelectSite,
  onChangeConfig,
}) => {
  const [showProvenance, setShowProvenance] = useState(false);

  const updateWeight = (key: keyof EngineeringConfig['weights'], value: number) => {
    onChangeConfig({
      ...config,
      weights: { ...config.weights, [key]: value },
    });
  };

  return (
    <div className="comparison-stack">
      {/* Engineering Parameter Controls */}
      <div className="panel controls-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Parametrização em Tempo Real (&lt;10 ms)</span>
            <h2>Arquitetura do Lander, Telecom & Pesos do Score</h2>
          </div>
        </div>

        <div className="controls-grid">
          <div className="control-card">
            <h3>Painel Solar & Bateria</h3>
            <label>
              Configuração do Painel
              <select
                value={config.panelMode}
                onChange={(e) =>
                  onChangeConfig({ ...config, panelMode: e.target.value as PanelMode })
                }
              >
                <option value="tracking">Vertical c/ Rastreamento Azimutal</option>
                <option value="fixed_north">Fixo Vertical (Face Norte)</option>
                <option value="fixed_horiz">Fixo Horizontal (Topo Lander)</option>
              </select>
            </label>
            <label>
              Área do Painel: <strong>{config.panelAreaM2.toFixed(1)} m²</strong>
              <input
                type="range"
                min={1}
                max={20}
                step={0.5}
                value={config.panelAreaM2}
                onChange={(e) =>
                  onChangeConfig({ ...config, panelAreaM2: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Eficiência Célula (η): <strong>{(config.panelEfficiency * 100).toFixed(0)}%</strong>
              <input
                type="range"
                min={0.18}
                max={0.36}
                step={0.01}
                value={config.panelEfficiency}
                onChange={(e) =>
                  onChangeConfig({ ...config, panelEfficiency: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Carga Sobrevivência (Aviônica+Aquec.): <strong>{config.survivalLoadW} W</strong>
              <input
                type="range"
                min={40}
                max={300}
                step={10}
                value={config.survivalLoadW}
                onChange={(e) =>
                  onChangeConfig({ ...config, survivalLoadW: Number(e.target.value) })
                }
              />
            </label>
          </div>

          <div className="control-card">
            <h3>Enlace DTE & Constelação ELFO</h3>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={config.relayEnabled}
                onChange={(e) =>
                  onChangeConfig({ ...config, relayEnabled: e.target.checked })
                }
              />
              <span>Ativar Rede Satélites Relay (ELFO LunaNet)</span>
            </label>
            <label>
              Critério DTE
              <select
                value={config.dteMarginMode}
                onChange={(e) =>
                  onChangeConfig({
                    ...config,
                    dteMarginMode: e.target.value as 'full_disk' | 'center',
                  })
                }
              >
                <option value="full_disk">Disco Terrestre Completo (δ⊕ ≈ 0.95°)</option>
                <option value="center">Centro da Terra Acima do Relevo (0°)</option>
              </select>
            </label>
            <label>
              Máscara Mínima Antena (α_mask): <strong>{config.antennaMaskDeg.toFixed(0)}°</strong>
              <input
                type="range"
                min={0}
                max={15}
                step={1}
                value={config.antennaMaskDeg}
                onChange={(e) =>
                  onChangeConfig({ ...config, antennaMaskDeg: Number(e.target.value) })
                }
              />
            </label>
            <div className="orbit-spec-note">
              ELFO: a={relayPresets.elfo_constellation.a_km} km, e={relayPresets.elfo_constellation.e}, i={relayPresets.elfo_constellation.i_deg}° (apolúnio {relayPresets.elfo_constellation.apolune_alt_km.toFixed(0)} km, P={relayPresets.elfo_constellation.period_hours.toFixed(1)}h).
            </div>
          </div>

          <div className="control-card">
            <h3>Pesos do Landing Score (0–100)</h3>
            <label>
              Segurança / Declive CLPS: <strong>{Math.round(config.weights.safety * 100)}%</strong>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={config.weights.safety}
                onChange={(e) => updateWeight('safety', Number(e.target.value))}
              />
            </label>
            <label>
              Geração Solar & Sombra: <strong>{Math.round(config.weights.power * 100)}%</strong>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={config.weights.power}
                onChange={(e) => updateWeight('power', Number(e.target.value))}
              />
            </label>
            <label>
              Telecom DTE + Relay: <strong>{Math.round(config.weights.comms * 100)}%</strong>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={config.weights.comms}
                onChange={(e) => updateWeight('comms', Number(e.target.value))}
              />
            </label>
            <label>
              Proximidade Ciência PSR: <strong>{Math.round(config.weights.science_psr * 100)}%</strong>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={config.weights.science_psr}
                onChange={(e) => updateWeight('science_psr', Number(e.target.value))}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Ranked Candidate Comparison Table */}
      <div className="panel table-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Matriz Comparativa Multi-Critério</span>
            <h2>Ranking dos Sítios Candidatos (Artemis III, Cristas & PSR)</h2>
          </div>
          <button
            type="button"
            className="pill-btn"
            onClick={() => setShowProvenance((v) => !v)}
          >
            {showProvenance ? 'Ocultar Proveniência & Limitações' : 'Ver Proveniência NASA & JPL Horizons'}
          </button>
        </div>

        <div className="table-scroll">
          <table className="ranking-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Sítio de Pouso</th>
                <th>Coord (Lat, Lon E)</th>
                <th>Declive</th>
                <th>Dist. PSR</th>
                <th>Sol Médio</th>
                <th>Sombra Máx</th>
                <th>DTE (%)</th>
                <th>Comb. (%)</th>
                <th>Ganho Relay</th>
                <th>Blackout Comb.</th>
                <th>Landing Score</th>
              </tr>
            </thead>
            <tbody>
              {rankedSites.map(({ site, analysis }, idx) => {
                const selected = site.id === selectedSiteId;
                const badge = slopeBadgeClass(
                  analysis.terrain.slopeDeg,
                  provenance.conventions.clps_slope_limit_deg,
                );
                return (
                  <tr
                    key={site.id}
                    className={selected ? 'row-selected' : ''}
                    onClick={() => onSelectSite(site.id)}
                  >
                    <td>{idx + 1}</td>
                    <td>
                      <strong>{site.name}</strong>
                      <div className="site-cat-sub">{site.category}</div>
                    </td>
                    <td className="mono-cell">
                      {analysis.terrain.latitudeDeg.toFixed(2)}°,{' '}
                      {analysis.terrain.longitudeEastDeg.toFixed(2)}°
                    </td>
                    <td>
                      <span className={`hazard-pill ${badge.cls}`}>
                        {analysis.terrain.slopeDeg.toFixed(1)}° ({badge.text})
                      </span>
                    </td>
                    <td className="mono-cell">
                      {analysis.terrain.isPsr ? 'DENTRO (PSR)' : `${analysis.terrain.psrDistanceM.toFixed(0)} m`}
                    </td>
                    <td className="mono-cell">
                      {(analysis.solar.meanIllumFraction * 100).toFixed(1)}%
                    </td>
                    <td className="mono-cell">
                      {analysis.solar.maxContinuousShadowHours.toFixed(1)} h
                    </td>
                    <td className="mono-cell">
                      {analysis.comms.dteDutyCyclePct.toFixed(1)}%
                    </td>
                    <td className="mono-cell">
                      {analysis.comms.combinedDutyCyclePct.toFixed(1)}%
                    </td>
                    <td className="mono-cell gain-cell">
                      +{analysis.comms.relayCoverageGainPct.toFixed(1)}%
                    </td>
                    <td className="mono-cell">
                      {analysis.comms.maxBlackoutCombinedHours.toFixed(1)} h
                    </td>
                    <td>
                      <div className="score-cell">
                        <strong>{analysis.score.total_0_100.toFixed(1)}</strong>
                        <div className="score-bar-track">
                          <div
                            className="score-bar-fill"
                            style={{ width: `${analysis.score.total_0_100}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {showProvenance && (
          <div className="provenance-box">
            <h3>Proveniência Científica, Verificação Horizons & Limitações</h3>
            <div className="prov-cols">
              <div>
                <p>
                  <strong>DEM:</strong> {provenance.dem_product.product_id} (
                  {provenance.dem_product.resolution_m} m/px, raio R=
                  {provenance.conventions.lunar_radius_m} m, geodésica 120 km). SHA-256:{' '}
                  <code>{provenance.dem_product.sha256.slice(0, 16)}...</code>
                </p>
                <p>
                  <strong>Efemérides:</strong> {provenance.ephemeris.engine} em{' '}
                  <code>{provenance.ephemeris.frame}</code> ({provenance.ephemeris.correction}).
                </p>
                <p>
                  <strong>Validação Cruzada JPL Horizons:</strong>{' '}
                  <code>{provenance.horizons_validation.status}</code>
                  {provenance.horizons_validation.max_sun_az_diff_deg != null && (
                    <span>
                      {' '}
                      — Δmax Sol Az/El: {provenance.horizons_validation.max_sun_az_diff_deg}° /{' '}
                      {provenance.horizons_validation.max_sun_el_diff_deg}°, Terra Az/El:{' '}
                      {provenance.horizons_validation.max_earth_az_diff_deg}° /{' '}
                      {provenance.horizons_validation.max_earth_el_diff_deg}°
                    </span>
                  )}
                </p>
              </div>
              <div>
                <strong>Limitações declaradas:</strong>
                <ul>
                  {provenance.limitations.map((lim, i) => (
                    <li key={i}>{lim}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
