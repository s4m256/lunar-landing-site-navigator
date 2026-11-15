import React, { useMemo, useState } from 'react';
import { LandingSiteEntry } from '../navigator/types';
import {
  EvaluatedSlotEntry,
  MAX_SITE_SLOTS,
  SelectionMode,
} from './state';

interface SelectionPopoverProps {
  sites: LandingSiteEntry[];
  entries: EvaluatedSlotEntry[];
  activeSlotIdx: number;
  selectionMode: SelectionMode;
  reticleCoords: { latDeg: number; lonEastDeg: number };
  coverageNotice: string | null;
  onChangeSelectionMode: (mode: SelectionMode) => void;
  onSelectActiveSlot: (index: number) => void;
  onAssignSiteAt: (slotIdx: number, siteId: string) => void;
  onPickCustomCoords: (latDeg: number, lonEastDeg: number, slotIdx: number) => void;
  onAddSlot: () => void;
  onRemoveSlot: (slotIdx: number) => void;
  onSwapFirstTwo: () => void;
  onFixReticleToActive: () => void;
  onCompareWithPsr: () => void;
  onKeepOnlyOne: () => void;
  onClose: () => void;
}

type CategoryFilter = 'all' | 'sunlit' | 'psr';

export const SelectionPopover: React.FC<SelectionPopoverProps> = ({
  sites,
  entries,
  activeSlotIdx,
  selectionMode,
  reticleCoords,
  coverageNotice,
  onChangeSelectionMode,
  onSelectActiveSlot,
  onAssignSiteAt,
  onPickCustomCoords,
  onAddSlot,
  onRemoveSlot,
  onSwapFirstTwo,
  onFixReticleToActive,
  onCompareWithPsr,
  onKeepOnlyOne,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [catFilter, setCatFilter] = useState<CategoryFilter>('all');

  const activeEntry = entries[activeSlotIdx] ?? entries[0];

  const [customLatInput, setCustomLatInput] = useState<string>(() =>
    activeEntry.analysis.terrain.latitudeDeg.toFixed(2),
  );
  const [customLonInput, setCustomLonInput] = useState<string>(() =>
    activeEntry.analysis.terrain.longitudeEastDeg.toFixed(1),
  );
  const [customError, setCustomError] = useState<string | null>(null);

  const handleSubmitCustomCoords = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = Number.parseFloat(customLatInput);
    const lon = Number.parseFloat(customLonInput);
    if (!Number.isFinite(lat) || lat < -89.9 || lat > 89.9) {
      setCustomError('Enter a latitude between -89.9° and +89.9°.');
      return;
    }
    if (!Number.isFinite(lon) || lon < -360 || lon > 360) {
      setCustomError('Enter an East longitude between -360° and 360°.');
      return;
    }
    setCustomError(null);
    onPickCustomCoords(lat, lon, activeSlotIdx);
  };

  const filteredSites = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sites.filter((s) => {
      if (catFilter === 'psr' && !s.center.is_psr) return false;
      if (catFilter === 'sunlit' && s.center.is_psr) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
      );
    });
  }, [sites, searchQuery, catFilter]);

  const selectOptions = useMemo(() => {
    const hasCurrent = filteredSites.some((s) => s.id === activeEntry.site.id);
    if (hasCurrent) return filteredSites;
    return [activeEntry.site, ...filteredSites];
  }, [filteredSites, activeEntry.site]);

  return (
    <section
      className="popover-card selection-popover"
      role="dialog"
      aria-label="Lunar landing site selection (1 to 4 points)"
    >
      <div className="popover-head">
        <div>
          <span className="drawer-eyebrow">1 to 4 Landing Points</span>
          <h2>Select Sites</h2>
        </div>
        <button
          type="button"
          className="btn-close-panel"
          onClick={onClose}
          aria-label="Close site selection"
        >
          Close
        </button>
      </div>

      <div className="field-block">
        <div className="section-title-row">
          <span>Active points ({entries.length}/{MAX_SITE_SLOTS})</span>
          {entries.length < MAX_SITE_SLOTS && (
            <button
              type="button"
              className="btn-link-sm"
              onClick={onAddSlot}
              aria-label="Add comparison site"
            >
              + Add site
            </button>
          )}
        </div>

        <div className="slot-tabs-grid" role="group" aria-label="Selected sites">
          {entries.map((item, idx) => {
            const isActive = idx === activeSlotIdx;
            return (
              <div
                key={`${item.label}-${idx}`}
                className={`slot-tab-item ${isActive ? 'active' : ''}`}
              >
                <button
                  type="button"
                  className="slot-tab-pick"
                  aria-pressed={isActive}
                  onClick={() => onSelectActiveSlot(idx)}
                >
                  <span aria-hidden="true">{item.meta.glyph}</span>
                  <span className="slot-tab-label">{item.label}</span>
                  <span className="slot-tab-name">{item.site.name}</span>
                </button>
                {entries.length > 1 && (
                  <button
                    type="button"
                    className="slot-tab-remove"
                    aria-label={`Remove Site ${item.label}`}
                    onClick={() => onRemoveSlot(idx)}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="field-block">
        <span>Click Moon terrain or target Site {activeEntry.label}</span>
        <div className="chip-row" role="group" aria-label="3D Moon selection mode">
          <button
            type="button"
            className={`choice-btn ${selectionMode === 'cursor' ? 'active' : ''}`}
            aria-pressed={selectionMode === 'cursor'}
            onClick={() => onChangeSelectionMode('cursor')}
          >
            Click Anywhere
          </button>
          <button
            type="button"
            className={`choice-btn ${selectionMode === 'crosshair' ? 'active' : ''}`}
            aria-pressed={selectionMode === 'crosshair'}
            onClick={() => onChangeSelectionMode('crosshair')}
          >
            Center Reticle
          </button>
        </div>
      </div>

      {selectionMode === 'crosshair' && (
        <div className="mode-panel">
          <p className="muted-caption">
            Reticle: {reticleCoords.latDeg.toFixed(1)}°, {reticleCoords.lonEastDeg.toFixed(1)}° E
          </p>
          <button
            type="button"
            className="btn-primary-sm"
            onClick={onFixReticleToActive}
          >
            Drop custom pin on Site {activeEntry.label}
          </button>
        </div>
      )}

      <form className="mode-panel" onSubmit={handleSubmitCustomCoords} aria-label="Custom unvisited landing coordinates">
        <span className="muted-caption">Unvisited spot · Drop Site {activeEntry.label} anywhere on the Moon</span>
        <div className="time-fields-row">
          <label className="field-block">
            <span>Lat (°)</span>
            <input
              type="number"
              aria-label="Custom latitude degrees"
              step="0.1"
              min={-89.9}
              max={89.9}
              value={customLatInput}
              onChange={(e) => setCustomLatInput(e.target.value)}
            />
          </label>
          <label className="field-block">
            <span>Lon (°E)</span>
            <input
              type="number"
              aria-label="Custom East longitude degrees"
              step="0.1"
              min={-360}
              max={360}
              value={customLonInput}
              onChange={(e) => setCustomLonInput(e.target.value)}
            />
          </label>
        </div>
        <div className="action-row">
          <button type="submit" className="btn-primary-sm">
            Drop custom pin
          </button>
          <button
            type="button"
            className="btn-secondary-sm"
            onClick={() => {
              setCustomLatInput('-83.40');
              setCustomLonInput('42.5');
              setCustomError(null);
              onPickCustomCoords(-83.4, 42.5, activeSlotIdx);
            }}
          >
            Unvisited Ridge
          </button>
          <button
            type="button"
            className="btn-secondary-sm"
            onClick={() => {
              setCustomLatInput('-43.30');
              setCustomLonInput('348.8');
              setCustomError(null);
              onPickCustomCoords(-43.3, 348.8, activeSlotIdx);
            }}
          >
            Tycho Crater
          </button>
        </div>
        {customError && <p className="muted-caption">{customError}</p>}
      </form>

      {coverageNotice && (
        <div className="notice-box" role="status">
          {coverageNotice}
        </div>
      )}

      <label className="field-block">
        <span>Search NASA candidate sites</span>
        <input
          type="search"
          aria-label="Search South Pole site"
          placeholder="Shackleton, Malapert, Nobile, Cabeus..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </label>

      <div className="chip-row" role="group" aria-label="Filter sites by lighting">
        <button
          type="button"
          className={`btn-filter-chip ${catFilter === 'all' ? 'active' : ''}`}
          aria-pressed={catFilter === 'all'}
          onClick={() => setCatFilter('all')}
        >
          All ({sites.length})
        </button>
        <button
          type="button"
          className={`btn-filter-chip ${catFilter === 'sunlit' ? 'active' : ''}`}
          aria-pressed={catFilter === 'sunlit'}
          onClick={() => setCatFilter('sunlit')}
        >
          Sunlit Ridges
        </button>
        <button
          type="button"
          className={`btn-filter-chip ${catFilter === 'psr' ? 'active' : ''}`}
          aria-pressed={catFilter === 'psr'}
          onClick={() => setCatFilter('psr')}
        >
          PSR Craters
        </button>
      </div>

      <label className="field-block">
        <span>
          {activeEntry.meta.glyph} Site {activeEntry.label} ({activeEntry.meta.shapeName})
        </span>
        <select
          aria-label={`Select Site ${activeEntry.label}`}
          value={activeEntry.site.id}
          onChange={(e) => onAssignSiteAt(activeSlotIdx, e.target.value)}
        >
          {selectOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.center.latitude_deg.toFixed(2)}°, {s.center.longitude_east_deg.toFixed(1)}°E)
            </option>
          ))}
        </select>
      </label>

      <ul className="site-cards-list" aria-label="South Pole candidate sites">
        {filteredSites.length === 0 ? (
          <li className="muted-caption">No sites match this filter.</li>
        ) : (
          filteredSites.map((s) => {
            const assignedSlots = entries.filter((e) => e.site.id === s.id);
            const isActiveAssigned = activeEntry.site.id === s.id;
            const solarPct = (s.engineering_summary.solar.mean_illum_fraction * 100).toFixed(0);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className={`site-pick-card ${isActiveAssigned ? 'is-selected' : ''}`}
                  onClick={() => onAssignSiteAt(activeSlotIdx, s.id)}
                >
                  <div className="site-pick-top">
                    <strong>{s.name}</strong>
                    <div className="site-pick-badges">
                      {s.center.is_psr && <span className="tag-psr">PSR</span>}
                      {assignedSlots.map((slotItem) => (
                        <span key={slotItem.label} className="tag-slot">
                          {slotItem.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="site-pick-meta">
                    Mean sun {solarPct}% · Slope {s.center.slope_deg.toFixed(1)}° · {Math.abs(s.center.latitude_deg).toFixed(2)}° S
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>

      <div className="action-row wrap">
        <button
          type="button"
          className="btn-primary-sm"
          onClick={onCompareWithPsr}
        >
          Compare with dark PSR
        </button>
        {entries.length >= 2 && (
          <button
            type="button"
            className="btn-secondary-sm"
            onClick={onSwapFirstTwo}
          >
            Swap A ↔ B
          </button>
        )}
        {entries.length > 1 && (
          <button
            type="button"
            className="btn-secondary-sm"
            onClick={onKeepOnlyOne}
          >
            Single site only
          </button>
        )}
      </div>
    </section>
  );
};
