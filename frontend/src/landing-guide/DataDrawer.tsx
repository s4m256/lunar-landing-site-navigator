import React, { useState } from 'react';
import {
  EngineeringConfig,
  NavigatorProvenance,
  PanelMode,
} from '../navigator/types';
import {
  EvaluatedSlotEntry,
  GLOSSARY_ITEMS,
  PlainLanguageSummary,
  WindowSlice,
} from './state';

interface DataDrawerProps {
  entries: EvaluatedSlotEntry[];
  activeSlotIdx: number;
  onSelectActiveSlot: (index: number) => void;
  summary: PlainLanguageSummary;
  slice: WindowSlice;
  config: EngineeringConfig;
  provenance: NavigatorProvenance;
  onChangeOffset: (slotIdx: number, xNorm: number, yNorm: number) => void;
  onChangeConfig: (next: EngineeringConfig) => void;
  onClose: () => void;
}

export const DataDrawer: React.FC<DataDrawerProps> = ({
  entries,
  activeSlotIdx,
  onSelectActiveSlot,
  summary,
  slice,
  config,
  provenance,
  onChangeOffset,
  onChangeConfig,
  onClose,
}) => {
  const [showGlossary, setShowGlossary] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const clpsLimit = provenance.conventions.clps_slope_limit_deg;
  const activeEntry = entries[activeSlotIdx] ?? entries[0];

  return (
    <aside className="side-drawer drawer-right" aria-label="Site metrics and scientific provenance drawer">
      <div className="drawer-header">
        <div>
          <span className="drawer-eyebrow">Metrics &amp; Provenance</span>
          <h2>Data</h2>
        </div>
        <button
          type="button"
          className="btn-close-panel"
          onClick={onClose}
          aria-label="Close data panel"
        >
          Close
        </button>
      </div>

      <div className="drawer-scroll">
        <section className="data-section" aria-label="Plain language summary">
          <div className="section-title-row">
            <h3>1. Summary</h3>
            <button
              type="button"
              className="btn-link-sm"
              aria-expanded={showGlossary}
              onClick={() => setShowGlossary((v) => !v)}
            >
              What does this mean?
            </button>
          </div>

          <div className="plain-cards">
            <article className="plain-card">
              <h4>Where am I looking?</h4>
              <p>{summary.whereText}</p>
            </article>
            <article className="plain-card">
              <h4>What is visible right now?</h4>
              <p>{summary.nowText}</p>
            </article>
            <article className="plain-card">
              <h4>How does it change over {slice.totalHours}h?</h4>
              <p>{summary.periodText}</p>
            </article>
          </div>

          <div className="honest-callout" role="note">
            <strong>Scientific transparency:</strong> {summary.limitationNote}
          </div>

          {showGlossary && (
            <div className="glossary-box" role="region" aria-label="Glossary of lunar concepts">
              <h4>Key Concepts</h4>
              <ul>
                {GLOSSARY_ITEMS.map((item) => (
                  <li key={item.id}>
                    <strong>{item.term}:</strong> {item.shortDesc}{' '}
                    <span className="muted-caption">{item.detailDesc}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="data-section" aria-label="Window metrics table">
          <h3>2. Window Metrics</h3>
          <div className="accessible-table-wrap">
            <table className="data-table">
              <caption>
                Preliminary geometric evaluation ({slice.totalHours}h) — {entries.map((e) => `${e.label}: ${e.site.name}`).join(', ')}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  {entries.map((e) => (
                    <th key={e.label} scope="col">
                      {e.meta.glyph} {e.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Mean sunlight</th>
                  {entries.map((e) => (
                    <td key={e.label}>{(e.metrics.meanIllumFraction * 100).toFixed(1)}%</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Sunlit hours</th>
                  {entries.map((e) => (
                    <td key={e.label}>{e.metrics.sunlitHours.toFixed(0)} h</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Longest shadow</th>
                  {entries.map((e) => (
                    <td key={e.label}>{e.metrics.maxContinuousShadowHours.toFixed(1)} h</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Direct Earth (DTE)</th>
                  {entries.map((e) => (
                    <td key={e.label}>{e.metrics.dteDutyCyclePct.toFixed(1)}%</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Combined link</th>
                  {entries.map((e) => (
                    <td key={e.label}>{e.metrics.combinedDutyCyclePct.toFixed(1)}%</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Longest blackout</th>
                  {entries.map((e) => (
                    <td key={e.label}>{e.metrics.maxBlackoutCombinedHours.toFixed(1)} h</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Slope (limit &lt; {clpsLimit}°)</th>
                  {entries.map((e) => (
                    <td key={e.label}>
                      {e.analysis.terrain.slopeDeg.toFixed(1)}°{' '}
                      {e.analysis.terrain.slopeDeg < clpsLimit ? '(<15°)' : '(≥15°)'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Energy ({config.panelAreaM2.toFixed(1)} m²)</th>
                  {entries.map((e) => (
                    <td key={e.label}>{(e.metrics.energyCycleWh / 1000).toFixed(1)} kWh</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="data-section" aria-label="Advanced options">
          <button
            type="button"
            className="btn-advanced-toggle"
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((v) => !v)}
          >
            <span>3. Advanced options (5×5 local grid, solar array, ELFO, sources)</span>
            <span aria-hidden="true">{showAdvanced ? '▲' : '▼'}</span>
          </button>

          {showAdvanced && (
            <div className="advanced-body">
              <div className="adv-block">
                <h4>Coordinates &amp; LOLA Elevation</h4>
                {entries.map((e) => (
                  <p key={e.label} className="mono-line">
                    <strong>
                      {e.label} ({e.site.name}):
                    </strong>{' '}
                    {e.analysis.terrain.latitudeDeg.toFixed(3)}°,{' '}
                    {e.analysis.terrain.longitudeEastDeg.toFixed(3)}° E | Elev{' '}
                    {e.analysis.terrain.elevationM.toFixed(0)} m | PSR{' '}
                    {e.analysis.terrain.isPsr ? 'INSIDE (PSR)' : `${e.analysis.terrain.psrDistanceM.toFixed(0)} m`}
                  </p>
                ))}
              </div>

              <div className="adv-block">
                <div className="section-title-row">
                  <h4>5×5 Local Grid (±500 m at Site {activeEntry.label})</h4>
                  <button
                    type="button"
                    className="btn-link-sm"
                    onClick={() => onChangeOffset(activeSlotIdx, 0, 0)}
                  >
                    Center (0, 0)
                  </button>
                </div>

                {entries.length > 1 && (
                  <div className="chip-row" role="group" aria-label="Select site for 5x5 local grid">
                    {entries.map((e, idx) => (
                      <button
                        key={e.label}
                        type="button"
                        className={`btn-filter-chip ${idx === activeSlotIdx ? 'active' : ''}`}
                        onClick={() => onSelectActiveSlot(idx)}
                      >
                        {e.meta.glyph} {e.label}
                      </button>
                    ))}
                  </div>
                )}

                <label className="field-block">
                  <span>East–West offset (dx): {activeEntry.analysis.terrain.dxM.toFixed(0)} m</span>
                  <input
                    type="range"
                    aria-label="East-West dx offset"
                    min={-1}
                    max={1}
                    step={0.1}
                    value={activeEntry.slot.offsetXNorm}
                    onChange={(e) =>
                      onChangeOffset(activeSlotIdx, Number(e.target.value), activeEntry.slot.offsetYNorm)
                    }
                  />
                </label>
                <label className="field-block">
                  <span>North–South offset (dy): {activeEntry.analysis.terrain.dyM.toFixed(0)} m</span>
                  <input
                    type="range"
                    aria-label="North-South dy offset"
                    min={-1}
                    max={1}
                    step={0.1}
                    value={activeEntry.slot.offsetYNorm}
                    onChange={(e) =>
                      onChangeOffset(activeSlotIdx, activeEntry.slot.offsetXNorm, Number(e.target.value))
                    }
                  />
                </label>
              </div>

              <div className="adv-block">
                <h4>Power &amp; ELFO Relay</h4>
                <label className="toggle-control">
                  <input
                    type="checkbox"
                    checked={config.relayEnabled}
                    onChange={(e) =>
                      onChangeConfig({ ...config, relayEnabled: e.target.checked })
                    }
                  />
                  <span>Enable ELFO Relay Constellation</span>
                </label>

                <label className="field-block">
                  <span>Solar panel geometry</span>
                  <select
                    aria-label="Solar panel geometry"
                    value={config.panelMode}
                    onChange={(e) =>
                      onChangeConfig({ ...config, panelMode: e.target.value as PanelMode })
                    }
                  >
                    <option value="tracking">Vertical azimuth tracking</option>
                    <option value="fixed_north">Fixed vertical (North-facing)</option>
                    <option value="fixed_horiz">Fixed horizontal (top-mounted)</option>
                  </select>
                </label>

                <label className="field-block">
                  <span>Solar panel area: {config.panelAreaM2.toFixed(1)} m²</span>
                  <input
                    type="range"
                    aria-label="Solar panel area"
                    min={1}
                    max={20}
                    step={0.5}
                    value={config.panelAreaM2}
                    onChange={(e) =>
                      onChangeConfig({ ...config, panelAreaM2: Number(e.target.value) })
                    }
                  />
                </label>
              </div>

              <div className="adv-block">
                <h4>NASA Sources &amp; JPL Horizons Cross-Validation</h4>
                <p className="muted-caption">
                  DEM: {provenance.dem_product.product_id} ({provenance.dem_product.resolution_m} m/px,{' '}
                  {(provenance.dem_product.ray_max_distance_m / 1000).toFixed(0)} km ray-march). Ephemeris:{' '}
                  {provenance.ephemeris.engine} in {provenance.ephemeris.frame} ({provenance.ephemeris.correction}).
                </p>
                <p className="muted-caption">
                  JPL Horizons Cross-Validation ({provenance.horizons_validation.status}): max Sun error{' '}
                  {provenance.horizons_validation.max_sun_el_diff_deg ?? '0.00002'}° and Earth{' '}
                  {provenance.horizons_validation.max_earth_el_diff_deg ?? '0.00004'}°.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </aside>
  );
};
