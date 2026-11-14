import React, { useEffect, useMemo, useState } from 'react';
import rawDataset from './data/south_pole_precomputed.v1.json';
import { parseNavigatorDataset } from './contract';
import {
  DEFAULT_CONFIG,
  evaluateLiveSite,
  LiveSiteAnalysis,
} from './navigator/math';
import { PolarHorizonSkyPlot } from './navigator/PolarHorizonSkyPlot';
import { PowerCommsCharts } from './navigator/PowerCommsCharts';
import { SiteComparisonPanel } from './navigator/SiteComparisonPanel';
import { SouthPoleGridMap } from './navigator/SouthPoleGridMap';
import { EngineeringConfig, LandingSiteEntry, NavigatorDatasetV1 } from './navigator/types';

const defaultDataset: NavigatorDatasetV1 = parseNavigatorDataset(rawDataset);

export interface AppProps {
  dataset?: NavigatorDatasetV1;
}

export function App({ dataset = defaultDataset }: AppProps) {
  const [selectedSiteId, setSelectedSiteId] = useState<string>(dataset.sites[0].id);
  const [offsetXNorm, setOffsetXNorm] = useState<number>(0);
  const [offsetYNorm, setOffsetYNorm] = useState<number>(0);
  const [epochIdx, setEpochIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [config, setConfig] = useState<EngineeringConfig>(DEFAULT_CONFIG);

  const selectedSite = useMemo<LandingSiteEntry>(
    () => dataset.sites.find((s) => s.id === selectedSiteId) ?? dataset.sites[0],
    [dataset.sites, selectedSiteId],
  );

  // Live center evaluations for all candidate sites so ranking table reacts instantly to sliders
  const rankedSites = useMemo(() => {
    return dataset.sites
      .map((site) => {
        const isCurrent = site.id === selectedSite.id;
        const analysis: LiveSiteAnalysis = evaluateLiveSite(
          site,
          isCurrent ? offsetXNorm : 0,
          isCurrent ? offsetYNorm : 0,
          dataset.horizon_azimuths_deg,
          dataset.mission_window,
          config,
        );
        return { site, analysis };
      })
      .sort((a, b) => b.analysis.score.total_0_100 - a.analysis.score.total_0_100);
  }, [
    dataset.sites,
    dataset.horizon_azimuths_deg,
    dataset.mission_window,
    selectedSite.id,
    offsetXNorm,
    offsetYNorm,
    config,
  ]);

  const selectedAnalysis = useMemo(
    () =>
      rankedSites.find((r) => r.site.id === selectedSite.id)?.analysis ??
      rankedSites[0].analysis,
    [rankedSites, selectedSite.id],
  );

  const liveScoresMap = useMemo(() => {
    const out: Record<string, number> = {};
    for (const row of rankedSites) {
      out[row.site.id] = row.analysis.score.total_0_100;
    }
    return out;
  }, [rankedSites]);

  const maxEpoch = dataset.mission_window.timestamps_utc.length - 1;
  const clampedEpochIdx = Math.max(0, Math.min(maxEpoch, epochIdx));
  const currentUtc = dataset.mission_window.timestamps_utc[clampedEpochIdx];

  useEffect(() => {
    if (!isPlaying) return undefined;
    const timer = window.setInterval(() => {
      setEpochIdx((prev) => (prev >= maxEpoch ? 0 : prev + 1));
    }, 90);
    return () => window.clearInterval(timer);
  }, [isPlaying, maxEpoch]);

  const handleSelectSite = (siteId: string) => {
    setSelectedSiteId(siteId);
    setOffsetXNorm(0);
    setOffsetYNorm(0);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">NASA Space Apps Challenge :: Lunar Landing Sites</span>
          <h1>Lunar Landing Site Navigator</h1>
          <p className="subtitle">
            Motor físico LOLA 80 m/px + SPICE MOON_ME ({dataset.sites.length} regiões polares ×{' '}
            {dataset.mission_window.timestamps_utc.length}h) com interpolação local instantânea.
          </p>
        </div>
        <div className="topbar-meta">
          <span className="status-chip">
            DEM: {dataset.provenance.dem_product.resolution_m} m/px • Geodésica{' '}
            {(dataset.provenance.dem_product.ray_max_distance_m / 1000).toFixed(0)} km
          </span>
          <span
            className={`status-chip ${
              dataset.provenance.horizons_validation.status === 'verified' ? 'verified' : ''
            }`}
          >
            JPL Horizons: {dataset.provenance.horizons_validation.status}
          </span>
        </div>
      </header>

      <section className="mission-bar" aria-label="Controles principais do sítio e tempo orbital">
        <div className="site-selector-wrap">
          <label>
            Sítio de Pouso Selecionado
            <select
              aria-label="Selecionar sítio de pouso"
              value={selectedSite.id}
              onChange={(e) => handleSelectSite(e.target.value)}
            >
              {dataset.sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.center.latitude_deg.toFixed(2)}°, {s.center.longitude_east_deg.toFixed(1)}°E)
                </option>
              ))}
            </select>
          </label>
          <p className="subtitle" style={{ marginTop: '0.25rem' }}>
            {selectedSite.description}
          </p>
        </div>

        <div className="scrubber-wrap">
          <label>
            Instante da Missão (Ciclo Sinódico): <strong>{currentUtc}</strong>
            <div className="scrubber-controls">
              <button
                type="button"
                className="play-btn"
                onClick={() => setIsPlaying((p) => !p)}
              >
                {isPlaying ? 'Pausar' : 'Animar 30d'}
              </button>
              <input
                type="range"
                aria-label="Controle temporal do ciclo lunar"
                min={0}
                max={maxEpoch}
                value={clampedEpochIdx}
                onChange={(e) => {
                  setIsPlaying(false);
                  setEpochIdx(Number(e.target.value));
                }}
              />
            </div>
          </label>
        </div>

        <div className="score-hero-pill" role="status">
          <span>Landing Score Global</span>
          <strong>{selectedAnalysis.score.total_0_100.toFixed(1)} / 100</strong>
          <div className="score-sub-pills">
            <span>Seg:{selectedAnalysis.score.safety_slope_0_100.toFixed(0)}</span>
            <span>Pow:{selectedAnalysis.score.power_0_100.toFixed(0)}</span>
            <span>Com:{selectedAnalysis.score.comms_0_100.toFixed(0)}</span>
            <span>PSR:{selectedAnalysis.score.science_psr_0_100.toFixed(0)}</span>
          </div>
        </div>
      </section>

      <div className="dashboard-grid">
        <SouthPoleGridMap
          sites={dataset.sites}
          selectedSite={selectedSite}
          selectedSiteLiveScores={liveScoresMap}
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
          epochIdx={clampedEpochIdx}
          epochState={selectedAnalysis.epochStates[clampedEpochIdx]}
          sunRadiusDeg={dataset.mission_window.solar_angular_radius_deg[clampedEpochIdx]}
          earthRadiusDeg={dataset.mission_window.earth_angular_radius_deg[clampedEpochIdx]}
          antennaMaskDeg={config.antennaMaskDeg}
          dteMarginMode={config.dteMarginMode}
          relayEnabled={config.relayEnabled}
        />
      </div>

      <PowerCommsCharts
        site={selectedSite}
        analysis={selectedAnalysis}
        missionWindow={dataset.mission_window}
        config={config}
        epochIdx={clampedEpochIdx}
        onSelectEpoch={(idx) => {
          setIsPlaying(false);
          setEpochIdx(idx);
        }}
      />

      <SiteComparisonPanel
        rankedSites={rankedSites}
        selectedSiteId={selectedSite.id}
        config={config}
        provenance={dataset.provenance}
        relayPresets={dataset.relay_presets}
        onSelectSite={handleSelectSite}
        onChangeConfig={setConfig}
      />
    </div>
  );
}
