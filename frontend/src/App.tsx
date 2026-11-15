import { useEffect, useMemo, useState } from 'react';
import { evaluateLiveSite, initialConfig } from './navigator/math';
import { InstantSummary } from './navigator/InstantSummary';
import { IntervalDataTable } from './navigator/IntervalDataTable';
import { PolarHorizonSkyPlot } from './navigator/PolarHorizonSkyPlot';
import { PowerCommsCharts } from './navigator/PowerCommsCharts';
import { ProvenancePanel } from './navigator/ProvenancePanel';
import { SiteComparisonPanel } from './navigator/SiteComparisonPanel';
import { SouthPoleGridMap } from './navigator/SouthPoleGridMap';
import { TimeControls } from './navigator/TimeControls';
import { formatStep, formatUtc } from './navigator/timeWindow';
import { EngineeringConfig, LandingSiteEntry, NavigatorDatasetV1 } from './navigator/types';

export interface AppProps {
  /** Already validated against the schema and the integrity checks (see datasetLoader.ts). */
  dataset: NavigatorDatasetV1;
  /** Link to the exact file the page reads, shown in the provenance panel. */
  datasetUrl?: string;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Animation step in ms: user-started only, and slower when the system asks for reduced motion. */
export const ANIMATION_STEP_MS = { normal: 120, reduced: 1000 } as const;

export function App({ dataset, datasetUrl }: AppProps) {
  const timestamps = dataset.mission_window.timestamps_utc;
  const maxEpoch = timestamps.length - 1;

  const [selectedSiteId, setSelectedSiteId] = useState<string>(dataset.sites[0].id);
  const [offsetXNorm, setOffsetXNorm] = useState(0);
  const [offsetYNorm, setOffsetYNorm] = useState(0);
  const [startIdx, setStartIdx] = useState(0);
  const [endIdx, setEndIdx] = useState(maxEpoch);
  const [epochIdx, setEpochIdx] = useState(0);
  const [missingInstant, setMissingInstant] = useState<string | null>(null);
  const [epochSync, setEpochSync] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [config, setConfig] = useState<EngineeringConfig>(() => initialConfig(dataset));

  const selectedSite = useMemo<LandingSiteEntry>(
    () => dataset.sites.find((s) => s.id === selectedSiteId) ?? dataset.sites[0],
    [dataset.sites, selectedSiteId],
  );

  // Every site at its centre: the only point where the file has all series. Used for comparison.
  const centerRows = useMemo(
    () =>
      dataset.sites.map((site) => ({
        site,
        analysis: evaluateLiveSite(site, 0, 0, dataset.horizon_azimuths_deg, dataset.mission_window, config),
      })),
    [dataset, config],
  );

  // The selected site at the analysed point (the centre unless the user moved it on the map).
  const selectedAnalysis = useMemo(() => {
    if (offsetXNorm === 0 && offsetYNorm === 0) {
      const row = centerRows.find((r) => r.site.id === selectedSite.id);
      if (row) return row.analysis;
    }
    return evaluateLiveSite(selectedSite, offsetXNorm, offsetYNorm, dataset.horizon_azimuths_deg, dataset.mission_window, config);
  }, [centerRows, selectedSite, offsetXNorm, offsetYNorm, dataset, config]);

  const clampedEpochIdx = Math.max(startIdx, Math.min(endIdx, epochIdx));
  const shownEpoch = missingInstant === null ? clampedEpochIdx : null;
  const utcLabel = shownEpoch === null ? null : formatUtc(timestamps[shownEpoch]);

  useEffect(() => {
    if (!isPlaying) return undefined;
    const timer = window.setInterval(
      () => setEpochIdx((prev) => (prev >= endIdx || prev < startIdx ? startIdx : prev + 1)),
      prefersReducedMotion() ? ANIMATION_STEP_MS.reduced : ANIMATION_STEP_MS.normal,
    );
    return () => window.clearInterval(timer);
  }, [isPlaying, startIdx, endIdx]);

  const handleSelectSite = (siteId: string) => {
    setSelectedSiteId(siteId);
    setOffsetXNorm(0);
    setOffsetYNorm(0);
  };

  const handleSelectEpoch = (idx: number, fromField = false) => {
    setIsPlaying(false);
    setMissingInstant(null);
    setEpochIdx(Math.max(startIdx, Math.min(endIdx, idx)));
    // A value picked elsewhere (slider, buttons, chart) replaces whatever was typed in the date field.
    if (!fromField) setEpochSync((n) => n + 1);
  };

  const handleMissingInstant = (message: string) => {
    setIsPlaying(false);
    setMissingInstant(message);
  };

  const handleChangeInterval = (start: number, end: number) => {
    setIsPlaying(false);
    setStartIdx(start);
    setEndIdx(end);
    setEpochIdx((prev) => Math.max(start, Math.min(end, prev)));
  };

  const handleTogglePlay = () => {
    setMissingInstant(null);
    setEpochSync((n) => n + 1);
    setIsPlaying((p) => !p);
  };

  const windowLabel = `${formatUtc(timestamps[0])} a ${formatUtc(timestamps[maxEpoch])}`;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="topbar">
        <div>
          <span className="eyebrow">NASA Space Apps Challenge 2026</span>
          <h1>Lunar Landing Site Navigator</h1>
          <p className="subtitle">
            Veja onde o Sol e a Terra aparecem no céu de {dataset.sites.length} locais do polo sul da Lua, a partir de um
            arquivo de dados pré-calculado. Dados disponíveis de {windowLabel}, um instante a cada{' '}
            {formatStep(dataset.mission_window.step_seconds)}.
          </p>
        </div>
        <a className="btn" href="#proveniencia">
          Origem e limitações dos dados
        </a>
      </header>

      <main id="conteudo" tabIndex={-1}>
        <aside className="data-notice" aria-label="Aviso sobre os dados">
          <strong>Antes de interpretar os resultados:</strong> os valores vêm de um arquivo pré-calculado e de cálculos
          geométricos simples feitos nesta página. As validações que o arquivo declara não foram confirmadas. Nada aqui
          indica que um local é seguro para pouso, nem garante energia ou comunicação.{' '}
          <a href="#proveniencia">Ler origem e limitações</a>.
        </aside>

        <section className="panel" aria-labelledby="escolha-titulo">
          <h2 id="escolha-titulo">1. Escolha o local e o período</h2>
          <div className="choice-grid">
            <div className="site-selector-wrap">
              <div className="field">
                <label htmlFor="site-select">Local</label>
                <select id="site-select" value={selectedSite.id} onChange={(e) => handleSelectSite(e.target.value)}>
                  {dataset.sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="site-description">
                <span className="field-help">Descrição gravada no arquivo, não verificada: </span>
                {selectedSite.description}
              </p>
              <details>
                <summary>Coordenadas do local</summary>
                <p className="field-help">
                  Latitude {selectedSite.center.latitude_deg.toFixed(3).replace('.', ',')}°, longitude{' '}
                  {selectedSite.center.longitude_east_deg.toFixed(3).replace('.', ',')}° leste, altitude{' '}
                  {selectedSite.center.elevation_m.toFixed(0)} m em relação ao raio de referência do arquivo.
                </p>
              </details>
            </div>
            <TimeControls
              timestamps={timestamps}
              stepSeconds={dataset.mission_window.step_seconds}
              startIdx={startIdx}
              endIdx={endIdx}
              epochIdx={clampedEpochIdx}
              missingInstant={missingInstant}
              epochSync={epochSync}
              isPlaying={isPlaying}
              onChangeInterval={handleChangeInterval}
              onChangeEpoch={handleSelectEpoch}
              onMissingInstant={handleMissingInstant}
              onTogglePlay={handleTogglePlay}
            />
          </div>
        </section>

        <InstantSummary
          site={selectedSite}
          analysis={selectedAnalysis}
          epochIdx={clampedEpochIdx}
          missingInstant={missingInstant}
          utcLabel={formatUtc(timestamps[clampedEpochIdx])}
          config={config}
          announce={!isPlaying}
        />

        <div className="dashboard-grid">
          <PolarHorizonSkyPlot
            siteName={selectedSite.name}
            horizonAzDeg={dataset.horizon_azimuths_deg}
            horizonElevDeg={selectedAnalysis.terrain.horizonElevDeg}
            sunAzSeries={selectedSite.sky_series.sun_az_deg}
            sunElSeries={selectedSite.sky_series.sun_el_deg}
            earthAzSeries={selectedSite.sky_series.earth_az_deg}
            earthElSeries={selectedSite.sky_series.earth_el_deg}
            elfoAzSeries={selectedSite.sky_series.elfo_primary_az_deg}
            elfoElSeries={selectedSite.sky_series.elfo_primary_el_deg}
            epochIdx={shownEpoch}
            epochState={shownEpoch === null ? null : selectedAnalysis.epochStates[shownEpoch]}
            sunRadiusDeg={shownEpoch === null ? null : dataset.mission_window.solar_angular_radius_deg[shownEpoch]}
            earthRadiusDeg={shownEpoch === null ? null : dataset.mission_window.earth_angular_radius_deg[shownEpoch]}
            antennaMaskDeg={config.antennaMaskDeg}
            relayEnabled={config.relayEnabled}
          />
          <SouthPoleGridMap
            sites={dataset.sites}
            selectedSite={selectedSite}
            liveTerrain={selectedAnalysis.terrain}
            relayEnabled={config.relayEnabled}
            offsetXNorm={offsetXNorm}
            offsetYNorm={offsetYNorm}
            onSelectSite={handleSelectSite}
            onChangeOffset={(x, y) => {
              setOffsetXNorm(x);
              setOffsetYNorm(y);
            }}
          />
        </div>

        <PowerCommsCharts
          site={selectedSite}
          analysis={selectedAnalysis}
          missionWindow={dataset.mission_window}
          config={config}
          epochIdx={shownEpoch}
          startIdx={startIdx}
          endIdx={endIdx}
          onSelectEpoch={(idx) => handleSelectEpoch(idx)}
        />

        <IntervalDataTable
          site={selectedSite}
          analysis={selectedAnalysis}
          timestamps={timestamps}
          stepSeconds={dataset.mission_window.step_seconds}
          startIdx={startIdx}
          endIdx={endIdx}
          relayEnabled={config.relayEnabled}
        />

        <SiteComparisonPanel
          rows={centerRows}
          selectedSiteId={selectedSite.id}
          config={config}
          slopeLimitDeg={dataset.provenance.conventions.clps_slope_limit_deg}
          psrSearchRadiusM={dataset.provenance.conventions.psr_search_radius_m}
          relayPresets={dataset.relay_presets}
          windowLabel={windowLabel}
          epochIdx={shownEpoch}
          utcLabel={utcLabel}
          onSelectSite={handleSelectSite}
          onChangeConfig={setConfig}
        />

        <ProvenancePanel dataset={dataset} datasetUrl={datasetUrl} />
      </main>
    </div>
  );
}
