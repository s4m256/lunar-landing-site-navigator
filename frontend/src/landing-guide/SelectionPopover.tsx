import React, { useMemo, useState } from 'react';
import { LandingSiteEntry } from '../navigator/types';
import { CursorTarget, SelectionMode, SiteSlot } from './state';

interface SelectionPopoverProps {
  sites: LandingSiteEntry[];
  selectionMode: SelectionMode;
  cursorTarget: CursorTarget;
  slotA: SiteSlot;
  slotB: SiteSlot | null;
  onChangeSelectionMode: (mode: SelectionMode) => void;
  onChangeCursorTarget: (target: CursorTarget) => void;
  onSelectSiteA: (siteId: string) => void;
  onSelectSiteB: (siteId: string | null) => void;
  onSwapAB: () => void;
  onClose: () => void;
}

export const SelectionPopover: React.FC<SelectionPopoverProps> = ({
  sites,
  selectionMode,
  cursorTarget,
  slotA,
  slotB,
  onChangeSelectionMode,
  onChangeCursorTarget,
  onSelectSiteA,
  onSelectSiteB,
  onSwapAB,
  onClose,
}) => {
  const [query, setQuery] = useState<string>('');

  const filteredSites = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sites;
    return sites.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q),
    );
  }, [sites, query]);

  return (
    <section
      className="floating-panel panel-top-right"
      role="region"
      aria-label="Painel de Seleção de Locais"
    >
      <div className="panel-header">
        <div>
          <h2>Seleção</h2>
          <p className="panel-sub">Escolha até 2 pontos na Lua (A e B)</p>
        </div>
        <button type="button" className="btn-icon-close" onClick={onClose} aria-label="Fechar Seleção">
          Fechar
        </button>
      </div>

      {/* Modo Centro vs Cursor */}
      <fieldset className="segmented-fieldset">
        <legend>Modo de seleção no mapa/globo</legend>
        <div className="segmented-row">
          <button
            type="button"
            className={`seg-btn ${selectionMode === 'center' ? 'is-active' : ''}`}
            aria-pressed={selectionMode === 'center'}
            onClick={() => onChangeSelectionMode('center')}
          >
            Centro (Mira)
          </button>
          <button
            type="button"
            className={`seg-btn ${selectionMode === 'cursor' ? 'is-active' : ''}`}
            aria-pressed={selectionMode === 'cursor'}
            onClick={() => onChangeSelectionMode('cursor')}
          >
            Cursor (Clique)
          </button>
        </div>
        <p className="helper-note">
          {selectionMode === 'center'
            ? 'Arraste a Lua (ou use as setas do teclado) até alinhar o local desejado com a mira central e clique em Fixar Local A ou B.'
            : 'Clique diretamente na superfície lunar ou em um marcador para definir o local ativo.'}
        </p>
      </fieldset>

      {selectionMode === 'cursor' && (
        <fieldset className="segmented-fieldset">
          <legend>Próximo clique define</legend>
          <div className="segmented-row">
            <button
              type="button"
              className={`seg-btn ${cursorTarget === 'A' ? 'is-active-amber' : ''}`}
              aria-pressed={cursorTarget === 'A'}
              onClick={() => onChangeCursorTarget('A')}
            >
              Local A
            </button>
            <button
              type="button"
              className={`seg-btn ${cursorTarget === 'B' ? 'is-active-cyan' : ''}`}
              aria-pressed={cursorTarget === 'B'}
              onClick={() => onChangeCursorTarget('B')}
            >
              Local B (Comparar)
            </button>
          </div>
        </fieldset>
      )}

      {/* Alternativa completa por teclado / leitor de tela */}
      <div className="form-group">
        <label htmlFor="site-search-input">Buscar região (por nome ou tipo)</label>
        <input
          id="site-search-input"
          type="search"
          className="ui-input"
          placeholder="Ex.: Shackleton, Malapert, PSR..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label htmlFor="select-site-a">
          <span className="dot-badge dot-a" aria-hidden="true">A</span> Local A (principal)
        </label>
        <select
          id="select-site-a"
          className="ui-select"
          value={slotA.siteId}
          onChange={(e) => onSelectSiteA(e.target.value)}
        >
          {(filteredSites.some((s) => s.id === slotA.siteId) ? filteredSites : sites).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.center.latitude_deg.toFixed(2)}°, {s.center.longitude_east_deg.toFixed(1)}°L)
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="select-site-b">
          <span className="dot-badge dot-b" aria-hidden="true">B</span> Local B (para comparar)
        </label>
        <select
          id="select-site-b"
          className="ui-select"
          value={slotB?.siteId ?? ''}
          onChange={(e) => onSelectSiteB(e.target.value || null)}
        >
          <option value="">Nenhum (explorar apenas Local A)</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.center.latitude_deg.toFixed(2)}°, {s.center.longitude_east_deg.toFixed(1)}°L)
            </option>
          ))}
        </select>
      </div>

      <div className="action-row-wrap">
        <button
          type="button"
          className="btn-secondary-sm"
          disabled={!slotB}
          onClick={onSwapAB}
        >
          Trocar A ↔ B
        </button>
        {slotB ? (
          <button
            type="button"
            className="btn-secondary-sm"
            onClick={() => onSelectSiteB(null)}
          >
            Remover Local B
          </button>
        ) : (
          <button
            type="button"
            className="btn-secondary-sm"
            onClick={() => {
              const contrast = sites.find((s) => s.category === 'psr_contrast' && s.id !== slotA.siteId)
                ?? sites.find((s) => s.id !== slotA.siteId);
              if (contrast) onSelectSiteB(contrast.id);
            }}
          >
            Comparar com cratera escura (PSR)
          </button>
        )}
      </div>
    </section>
  );
};
