import React, { useEffect, useMemo, useState } from 'react';
import rawDataset from './data/south_pole_precomputed.v1.json';
import { parseNavigatorDataset } from './contract';
import { ChartsDrawer } from './landing-guide/ChartsDrawer';
import { DataDrawer } from './landing-guide/DataDrawer';
import { HomeOverlay, HowItWorksModal } from './landing-guide/HomeOverlay';
import { LunarViewport } from './landing-guide/LunarViewport';
import { SelectionPopover } from './landing-guide/SelectionPopover';
import {
  computeWindowSlice,
  CursorTarget,
  formatUtcReadable,
  ScreenMode,
  SelectionMode,
  SiteSlot,
  summarizeAnalysisWindow,
  ViewMode,
} from './landing-guide/state';
import { TimePopover } from './landing-guide/TimePopover';
import {
  DEFAULT_CONFIG,
  evaluateLiveSite,
  LiveSiteAnalysis,
} from './navigator/math';
import {
  EngineeringConfig,
  LandingSiteEntry,
  NavigatorDatasetV1,
} from './navigator/types';

const defaultDataset: NavigatorDatasetV1 = parseNavigatorDataset(rawDataset);

export interface AppProps {
  dataset?: NavigatorDatasetV1;
}

function isCompactViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth <= 820;
}

export function App({ dataset = defaultDataset }: AppProps) {
  const defaultSiteA = dataset.sites[0].id;
  const [screen, setScreen] = useState<ScreenMode>('home');
  const [showHowItWorks, setShowHowItWorks] = useState<boolean>(false);

  // Estado compartilhado preservado entre 2D e 3D
  const [viewMode, setViewMode] = useState<ViewMode>('3d');
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('center');
  const [cursorTarget, setCursorTarget] = useState<CursorTarget>('A');
  const [slotA, setSlotA] = useState<SiteSlot>({ siteId: defaultSiteA, xNorm: 0, yNorm: 0 });
  const [slotB, setSlotB] = useState<SiteSlot | null>(null);
  const [config, setConfig] = useState<EngineeringConfig>(DEFAULT_CONFIG);

  // Controle de janelas/painéis nos 4 cantos (Dados inicia fechado!)
  const [openCharts, setOpenCharts] = useState<boolean>(false);
  const [openSelection, setOpenSelection] = useState<boolean>(false);
  const [openData, setOpenData] = useState<boolean>(false);
  const [openTime, setOpenTime] = useState<boolean>(false);

  // Tempo e animação em UTC
  const initialDate = (dataset.mission_window.start_utc || '2026-11-15T00:00:00Z').slice(0, 10);
  const [startDate, setStartDate] = useState<string>(initialDate);
  const [startHour, setStartHour] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(14);
  const [epochIdx, setEpochIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [liveStatusMsg, setLiveStatusMsg] = useState<string>('');

  const { slice: windowSlice, error: dateError } = useMemo(
    () => computeWindowSlice(dataset.mission_window, startDate, startHour, durationDays),
    [dataset.mission_window, startDate, startHour, durationDays],
  );

  // Garante época dentro da sub-janela selecionada
  const clampedEpoch = Math.max(
    windowSlice.startIdx,
    Math.min(windowSlice.endIdx, epochIdx),
  );

  useEffect(() => {
    if (epochIdx < windowSlice.startIdx || epochIdx > windowSlice.endIdx) {
      setEpochIdx(windowSlice.startIdx);
    }
  }, [windowSlice.startIdx, windowSlice.endIdx, epochIdx]);

  // Loop da animação respeitando velocidade (1x, 3x, 6x)
  useEffect(() => {
    if (!isPlaying) return undefined;
    const intervalMs = Math.max(45, Math.round(240 / speedMultiplier));
    const timer = window.setInterval(() => {
      setEpochIdx((prev) =>
        prev >= windowSlice.endIdx ? windowSlice.startIdx : prev + 1,
      );
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [isPlaying, speedMultiplier, windowSlice.startIdx, windowSlice.endIdx]);

  // Atalho Escape fecha painéis e popovers ativos
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showHowItWorks) {
        setOpenCharts(false);
        setOpenSelection(false);
        setOpenData(false);
        setOpenTime(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showHowItWorks]);

  const siteA = useMemo<LandingSiteEntry>(
    () => dataset.sites.find((s) => s.id === slotA.siteId) ?? dataset.sites[0],
    [dataset.sites, slotA.siteId],
  );

  const siteB = useMemo<LandingSiteEntry | null>(
    () => (slotB ? dataset.sites.find((s) => s.id === slotB.siteId) ?? null : null),
    [dataset.sites, slotB],
  );

  const analysisA = useMemo<LiveSiteAnalysis>(
    () =>
      evaluateLiveSite(
        siteA,
        slotA.xNorm,
        slotA.yNorm,
        dataset.horizon_azimuths_deg,
        dataset.mission_window,
        config,
      ),
    [siteA, slotA.xNorm, slotA.yNorm, dataset.horizon_azimuths_deg, dataset.mission_window, config],
  );

  const analysisB = useMemo<LiveSiteAnalysis | null>(() => {
    if (!siteB || !slotB) return null;
    return evaluateLiveSite(
      siteB,
      slotB.xNorm,
      slotB.yNorm,
      dataset.horizon_azimuths_deg,
      dataset.mission_window,
      config,
    );
  }, [siteB, slotB, dataset.horizon_azimuths_deg, dataset.mission_window, config]);

  const summaryA = useMemo(
    () =>
      summarizeAnalysisWindow(
        analysisA,
        dataset.mission_window,
        windowSlice.startIdx,
        windowSlice.endIdx,
      ),
    [analysisA, dataset.mission_window, windowSlice.startIdx, windowSlice.endIdx],
  );

  const summaryB = useMemo(() => {
    if (!analysisB) return null;
    return summarizeAnalysisWindow(
      analysisB,
      dataset.mission_window,
      windowSlice.startIdx,
      windowSlice.endIdx,
    );
  }, [analysisB, dataset.mission_window, windowSlice.startIdx, windowSlice.endIdx]);

  const currentUtc =
    dataset.mission_window.timestamps_utc[clampedEpoch] ?? dataset.mission_window.start_utc;
  const currentUtcFmt = formatUtcReadable(currentUtc);

  const togglePanel = (target: 'charts' | 'selection' | 'data' | 'time') => {
    const mobile = isCompactViewport();
    if (target === 'charts') {
      const next = !openCharts;
      setOpenCharts(next);
      if (next) {
        setOpenSelection(false);
        setOpenTime(false);
        if (mobile) setOpenData(false);
      }
    } else if (target === 'data') {
      const next = !openData;
      setOpenData(next);
      if (next) {
        setOpenSelection(false);
        setOpenTime(false);
        if (mobile) setOpenCharts(false);
      }
    } else if (target === 'selection') {
      const next = !openSelection;
      setOpenSelection(next);
      if (next) {
        setOpenTime(false);
        if (mobile) {
          setOpenCharts(false);
          setOpenData(false);
        }
      }
    } else {
      const next = !openTime;
      setOpenTime(next);
      if (next) {
        setOpenSelection(false);
        if (mobile) {
          setOpenCharts(false);
          setOpenData(false);
        }
      }
    }
  };

  const handleAssignSlot = (
    target: CursorTarget,
    siteId: string,
    xNorm: number,
    yNorm: number,
    warning: string | null,
  ) => {
    const matchedName = dataset.sites.find((s) => s.id === siteId)?.name ?? siteId;
    if (target === 'A') {
      setSlotA({ siteId, xNorm, yNorm });
      setLiveStatusMsg(
        warning ?? `Local A definido para ${matchedName}.`,
      );
      // Em modo Cursor, se B ainda não existia, prepara suavemente o próximo clique para B
      if (selectionMode === 'cursor' && slotB === null) {
        setCursorTarget('B');
      }
    } else {
      setSlotB({ siteId, xNorm, yNorm });
      setLiveStatusMsg(
        warning ?? `Local B definido para ${matchedName} para comparação.`,
      );
    }
  };

  const handleSwapAB = () => {
    if (!slotB) return;
    const prevA = slotA;
    setSlotA(slotB);
    setSlotB(prevA);
    setLiveStatusMsg('Locais A e B trocados entre si.');
  };

  const handleUseExamplePeriod = () => {
    setStartDate(initialDate);
    setStartHour(0);
    setDurationDays(14);
    setEpochIdx(0);
    setIsPlaying(false);
    setLiveStatusMsg('Período de exemplo restaurado (14 dias em UTC).');
  };

  const sunAzNow = siteA.sky_series.sun_az_deg[clampedEpoch] ?? 0;
  const sunElNow = siteA.sky_series.sun_el_deg[clampedEpoch] ?? 0;
  const earthAzNow = siteA.sky_series.earth_az_deg[clampedEpoch] ?? 0;
  const earthElNow = siteA.sky_series.earth_el_deg[clampedEpoch] ?? 0;

  return (
    <div className="lg-shell">
      {/* Região viva discreta para leitores de tela */}
      <div className="sr-only" role="status" aria-live="polite">
        {liveStatusMsg}
      </div>

      {/* Palco Central: Globo 3D ou Mapa 2D ocupando toda a tela */}
      <LunarViewport
        screen={screen}
        viewMode={viewMode}
        selectionMode={selectionMode}
        cursorTarget={cursorTarget}
        sites={dataset.sites}
        slotA={slotA}
        slotB={slotB}
        analysisA={analysisA}
        sunAzDeg={sunAzNow}
        sunElDeg={sunElNow}
        earthAzDeg={earthAzNow}
        earthElDeg={earthElNow}
        epochA={analysisA.epochStates[clampedEpoch] ?? analysisA.epochStates[0]}
        onAssignSlot={handleAssignSlot}
      />

      {/* Tela Inicial Minimalista */}
      {screen === 'home' && (
        <HomeOverlay
          onStart={() => {
            setScreen('explore');
            setLiveStatusMsg(
              `Exploração iniciada em modo ${viewMode.toUpperCase()}. Local A está em ${siteA.name}.`,
            );
          }}
          onOpenHowItWorks={() => setShowHowItWorks(true)}
        />
      )}

      {/* Controles minimalistas nos 4 cantos + Pílula compacta de Tempo (após clicar Start) */}
      {screen === 'explore' && (
        <div className="hud-layer" aria-label="Controles de exploração lunar">
          {/* Canto Superior Esquerdo — Gráficos */}
          <div className="corner-slot slot-top-left">
            <button
              type="button"
              className={`corner-btn ${openCharts ? 'is-open' : ''}`}
              aria-expanded={openCharts}
              onClick={() => togglePanel('charts')}
            >
              <span className="btn-icon" aria-hidden="true">📈</span>
              <span className="btn-label-col">
                <strong>Gráficos</strong>
                <small>{siteB ? 'A vs B' : 'Luz e sinal'}</small>
              </span>
            </button>
          </div>

          {/* Topo Centro — Controle Compacto de Tempo */}
          <div className="top-center-slot">
            <div className="time-pill" role="group" aria-label="Barra rápida de tempo UTC">
              <button
                type="button"
                className="time-pill-trigger"
                aria-expanded={openTime}
                onClick={() => togglePanel('time')}
              >
                <span aria-hidden="true">🕒</span>
                <span>
                  <strong>Tempo</strong> · {currentUtcFmt.date.slice(5)} {currentUtcFmt.time}
                </span>
              </button>
              <button
                type="button"
                className="time-pill-play"
                onClick={() => setIsPlaying((p) => !p)}
                aria-label={isPlaying ? 'Pausar animação' : 'Iniciar animação'}
              >
                {isPlaying ? 'Pausar' : 'Play'}
              </button>
            </div>
          </div>

          {/* Canto Superior Direito — Seleção */}
          <div className="corner-slot slot-top-right">
            <button
              type="button"
              className={`corner-btn ${openSelection ? 'is-open' : ''}`}
              aria-expanded={openSelection}
              onClick={() => togglePanel('selection')}
            >
              <span className="btn-icon" aria-hidden="true">🎯</span>
              <span className="btn-label-col">
                <strong>Seleção</strong>
                <small>
                  {selectionMode === 'center' ? 'Centro' : `Cursor (${cursorTarget})`} ·{' '}
                  {siteB ? 'A/B' : 'A'}
                </small>
              </span>
            </button>
          </div>

          {/* Canto Inferior Esquerdo — Alternador 2D / 3D */}
          <div className="corner-slot slot-bottom-left">
            <button
              type="button"
              className="corner-btn"
              onClick={() => {
                const next: ViewMode = viewMode === '3d' ? '2d' : '3d';
                setViewMode(next);
                setLiveStatusMsg(
                  next === '2d'
                    ? 'Alternado para projeção polar 2D preservando locais e horário.'
                    : 'Alternado para globo 3D preservando locais e horário.',
                );
              }}
              aria-label={`Alternar visualização. Modo atual ${viewMode.toUpperCase()}. Mudar para ${viewMode === '3d' ? '2D' : '3D'}`}
            >
              <span className="btn-icon" aria-hidden="true">🌐</span>
              <span className="btn-label-col">
                <strong>2D / 3D</strong>
                <small>Atual: {viewMode.toUpperCase()}</small>
              </span>
            </button>
          </div>

          {/* Canto Inferior Direito — Dados (Fechado inicialmente + badge discreto) */}
          <div className="corner-slot slot-bottom-right">
            <button
              type="button"
              className={`corner-btn ${openData ? 'is-open' : ''}`}
              aria-expanded={openData}
              onClick={() => togglePanel('data')}
            >
              <span className="btn-icon" aria-hidden="true">📊</span>
              <span className="btn-label-col">
                <strong>Dados</strong>
                <small>
                  {siteB ? `A/B · ${siteA.name.split(' ')[0]}` : siteA.name}
                </small>
              </span>
              <span className="corner-badge">{siteB ? 'A/B' : '1'}</span>
            </button>
          </div>

          {/* Painéis e Popovers sob demanda */}
          {openCharts && (
            <ChartsDrawer
              siteA={siteA}
              analysisA={analysisA}
              summaryA={summaryA}
              siteB={siteB}
              analysisB={analysisB}
              summaryB={summaryB}
              missionWindow={dataset.mission_window}
              horizonAzDeg={dataset.horizon_azimuths_deg}
              windowSlice={windowSlice}
              epochIdx={clampedEpoch}
              config={config}
              provenance={dataset.provenance}
              onSelectEpoch={(idx) => {
                setIsPlaying(false);
                setEpochIdx(idx);
              }}
              onClose={() => setOpenCharts(false)}
            />
          )}

          {openSelection && (
            <SelectionPopover
              sites={dataset.sites}
              selectionMode={selectionMode}
              cursorTarget={cursorTarget}
              slotA={slotA}
              slotB={slotB}
              onChangeSelectionMode={(mode) => {
                setSelectionMode(mode);
                setLiveStatusMsg(
                  mode === 'center'
                    ? 'Modo Centro ativado: use a mira central sobre a Lua.'
                    : 'Modo Cursor ativado: clique na Lua para definir A ou B.',
                );
              }}
              onChangeCursorTarget={setCursorTarget}
              onSelectSiteA={(id) => {
                setSlotA({ siteId: id, xNorm: 0, yNorm: 0 });
                setLiveStatusMsg(
                  `Local A atualizado para ${dataset.sites.find((s) => s.id === id)?.name ?? id}.`,
                );
              }}
              onSelectSiteB={(id) => {
                setSlotB(id ? { siteId: id, xNorm: 0, yNorm: 0 } : null);
                setLiveStatusMsg(
                  id
                    ? `Local B atualizado para ${dataset.sites.find((s) => s.id === id)?.name ?? id}.`
                    : 'Comparação com Local B removida.',
                );
              }}
              onSwapAB={handleSwapAB}
              onClose={() => setOpenSelection(false)}
            />
          )}

          {openTime && (
            <TimePopover
              startDate={startDate}
              startHour={startHour}
              durationDays={durationDays}
              dateError={dateError}
              windowSlice={windowSlice}
              epochIdx={clampedEpoch}
              currentUtc={currentUtc}
              isPlaying={isPlaying}
              speedMultiplier={speedMultiplier}
              onChangeStartDate={(v) => {
                setIsPlaying(false);
                setStartDate(v);
              }}
              onChangeStartHour={(v) => {
                setIsPlaying(false);
                setStartHour(Number.isNaN(v) ? 0 : Math.max(0, Math.min(23, v)));
              }}
              onChangeDurationDays={(d) => {
                setIsPlaying(false);
                setDurationDays(d);
              }}
              onUseExamplePeriod={handleUseExamplePeriod}
              onChangeEpoch={(idx) => {
                setIsPlaying(false);
                setEpochIdx(idx);
              }}
              onTogglePlay={() => setIsPlaying((p) => !p)}
              onRestart={() => {
                setIsPlaying(false);
                setEpochIdx(windowSlice.startIdx);
              }}
              onChangeSpeed={setSpeedMultiplier}
              onClose={() => setOpenTime(false)}
            />
          )}

          {openData && (
            <DataDrawer
              siteA={siteA}
              slotA={slotA}
              analysisA={analysisA}
              summaryA={summaryA}
              siteB={siteB}
              analysisB={analysisB}
              summaryB={summaryB}
              epochIdx={clampedEpoch}
              currentUtc={currentUtc}
              config={config}
              provenance={dataset.provenance}
              onChangeOffsetA={(x, y) => setSlotA((prev) => ({ ...prev, xNorm: x, yNorm: y }))}
              onChangeConfig={setConfig}
              onClose={() => setOpenData(false)}
            />
          )}
        </div>
      )}

      <HowItWorksModal
        open={showHowItWorks}
        onClose={() => setShowHowItWorks(false)}
        onStartExploring={() => setScreen('explore')}
      />
    </div>
  );
}
