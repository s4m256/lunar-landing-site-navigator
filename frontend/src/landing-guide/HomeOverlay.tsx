import React, { useMemo, useState } from 'react';
import { computeSolarIllumFraction, interpolateHorizon } from '../navigator/math';
import { LandingSiteEntry, MissionWindow } from '../navigator/types';

interface HomeOverlayProps {
  sites: LandingSiteEntry[];
  horizonAzDeg: number[];
  missionWindow: MissionWindow;
  onStart: (siteId?: string) => void;
}

const DEG = Math.PI / 180;
const TAN_5_DEG = Math.tan(5 * DEG);

function projectPolarPercent(latDeg: number, lonEastDeg: number): { leftPct: number; topPct: number } {
  const rNorm = Math.min(0.96, Math.tan(((latDeg + 90) * 0.5) * DEG) / TAN_5_DEG);
  const lam = lonEastDeg * DEG;
  return {
    leftPct: 50 + rNorm * 46.5 * Math.sin(lam),
    topPct: 50 - rNorm * 46.5 * Math.cos(lam),
  };
}

export const HomeOverlay: React.FC<HomeOverlayProps> = ({
  sites,
  horizonAzDeg,
  missionWindow,
  onStart,
}) => {
  const landmarkSites = useMemo(() => {
    const wantedIds = [
      'shackleton_ridge',
      'malapert_massif',
      'mons_mouton_plateau',
      'haworth_rim',
      'shackleton_psr_floor',
    ];
    const picked = wantedIds
      .map((id) => sites.find((s) => s.id === id))
      .filter((s): s is LandingSiteEntry => Boolean(s));
    return picked.length > 0 ? picked : sites.slice(0, 4);
  }, [sites]);

  const [activeLandmarkId, setActiveLandmarkId] = useState<string>(
    () => landmarkSites[0]?.id ?? sites[0].id,
  );
  const activeLandmark =
    landmarkSites.find((s) => s.id === activeLandmarkId) ?? landmarkSites[0] ?? sites[0];

  // Interactive Sunlight explorer state
  const ridgeSite =
    sites.find((s) => s.id === 'shackleton_ridge') ?? sites[0];
  const psrSite =
    sites.find((s) => s.id === 'shackleton_psr_floor') ??
    sites.find((s) => s.center.is_psr) ??
    sites[sites.length - 1];

  const [energyMode, setEnergyMode] = useState<'ridge' | 'psr'>('ridge');
  const [energyEpochIdx, setEnergyEpochIdx] = useState<number>(180);

  const activeEnergySite = energyMode === 'ridge' ? ridgeSite : psrSite;
  const maxEpoch = Math.max(0, missionWindow.timestamps_utc.length - 1);
  const safeEnergyEpoch = Math.min(maxEpoch, Math.max(0, energyEpochIdx));

  const energyStats = useMemo(() => {
    const sAz = activeEnergySite.sky_series.sun_az_deg[safeEnergyEpoch] ?? 0;
    const sEl = activeEnergySite.sky_series.sun_el_deg[safeEnergyEpoch] ?? 0;
    const hRim = interpolateHorizon(sAz, horizonAzDeg, activeEnergySite.horizon_elev_deg);
    const fIllum = computeSolarIllumFraction(
      sEl,
      hRim,
      missionWindow.solar_angular_radius_deg[safeEnergyEpoch] ?? 0.267,
    );
    return {
      utcLabel: missionWindow.timestamps_utc[safeEnergyEpoch]?.slice(0, 16).replace('T', ' ') ?? '',
      sAz,
      sEl,
      hRim,
      fIllum,
      meanPct: activeEnergySite.engineering_summary.solar.mean_illum_fraction * 100,
    };
  }, [activeEnergySite, safeEnergyEpoch, horizonAzDeg, missionWindow]);

  // Real 360° LOLA horizon polyline + sampled Sun arc for Energy panel
  const energySvgData = useMemo(() => {
    const w = 480;
    const h = 230;
    const padL = 36;
    const padR = 14;
    const padT = 18;
    const padB = 28;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const minEl = -8;
    const maxEl = 20;

    const toX = (az: number) => padL + (az / 360) * plotW;
    const toY = (el: number) =>
      padT + plotH - ((Math.max(minEl, Math.min(maxEl, el)) - minEl) / (maxEl - minEl)) * plotH;

    const horizonPts: string[] = [];
    for (let az = 0; az <= 360; az += 4) {
      const val = interpolateHorizon(az % 360, horizonAzDeg, activeEnergySite.horizon_elev_deg);
      horizonPts.push(`${toX(az).toFixed(1)},${toY(val).toFixed(1)}`);
    }
    const horizonArea = `${padL},${toY(minEl).toFixed(1)} ${horizonPts.join(' ')} ${(padL + plotW).toFixed(1)},${toY(minEl).toFixed(1)}`;

    const sunDots: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < activeEnergySite.sky_series.sun_az_deg.length; i += 12) {
      sunDots.push({
        x: toX(activeEnergySite.sky_series.sun_az_deg[i]),
        y: toY(activeEnergySite.sky_series.sun_el_deg[i]),
      });
    }

    return {
      w,
      h,
      padL,
      padR,
      plotW,
      horizonPts: horizonPts.join(' '),
      horizonArea,
      sunDots,
      zeroY: toY(0),
      curSunX: toX(energyStats.sAz),
      curSunY: toY(energyStats.sEl),
    };
  }, [activeEnergySite, horizonAzDeg, energyStats.sAz, energyStats.sEl]);

  // Interactive Comms explorer state
  const commsCandidates = useMemo(() => {
    const ids = ['haworth_rim', 'malapert_massif', 'shackleton_ridge'];
    const found = ids
      .map((id) => sites.find((s) => s.id === id))
      .filter((s): s is LandingSiteEntry => Boolean(s));
    return found.length > 0 ? found : sites.slice(0, 3);
  }, [sites]);

  const [commsSiteId, setCommsSiteId] = useState<string>(
    () => commsCandidates[0]?.id ?? sites[0].id,
  );
  const [relayOn, setRelayOn] = useState<boolean>(false);
  const activeCommsSite =
    commsCandidates.find((s) => s.id === commsSiteId) ?? commsCandidates[0] ?? sites[0];

  const commsSvgData = useMemo(() => {
    const w = 480;
    const h = 230;
    const padL = 36;
    const padR = 14;
    const padT = 18;
    const padB = 28;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const minEl = -10;
    const maxEl = 12;

    const n = activeCommsSite.sky_series.earth_el_deg.length;
    const toX = (idx: number) => padL + (idx / Math.max(1, n - 1)) * plotW;
    const toY = (el: number) =>
      padT + plotH - ((Math.max(minEl, Math.min(maxEl, el)) - minEl) / (maxEl - minEl)) * plotH;

    const earthPts: string[] = [];
    const rimPts: string[] = [];
    const dteMask: boolean[] = [];
    const combinedMask: boolean[] = [];

    for (let i = 0; i < n; i++) {
      const eAz = activeCommsSite.sky_series.earth_az_deg[i];
      const eEl = activeCommsSite.sky_series.earth_el_deg[i];
      const rim = interpolateHorizon(eAz, horizonAzDeg, activeCommsSite.horizon_elev_deg);
      const rEarth = missionWindow.earth_angular_radius_deg[i] ?? 0.95;
      const dte = eEl - rEarth > rim;
      const elfo = activeCommsSite.sky_series.elfo_constellation_visible[i];
      dteMask.push(dte);
      combinedMask.push(relayOn ? dte || elfo : dte);
      if (i % 4 === 0 || i === n - 1) {
        earthPts.push(`${toX(i).toFixed(1)},${toY(eEl).toFixed(1)}`);
        rimPts.push(`${toX(i).toFixed(1)},${toY(rim).toFixed(1)}`);
      }
    }

    const maskRuns = (flags: boolean[], want: boolean) => {
      const segs: Array<{ x: number; w: number }> = [];
      let start = -1;
      for (let i = 0; i < flags.length; i++) {
        const hit = flags[i] === want;
        if (hit && start < 0) start = i;
        if ((!hit || i === flags.length - 1) && start >= 0) {
          const endIdx = hit ? i : i - 1;
          const x0 = toX(start);
          const x1 = toX(endIdx);
          segs.push({ x: x0, w: Math.max(2, x1 - x0) });
          start = -1;
        }
      }
      return segs;
    };

    return {
      w,
      h,
      padL,
      plotW,
      earthPts: earthPts.join(' '),
      rimPts: rimPts.join(' '),
      zeroY: toY(0),
      dteSegs: maskRuns(dteMask, true),
      blackoutSegs: maskRuns(combinedMask, false),
      dtePct: activeCommsSite.engineering_summary.comms.dte_full_disk_duty_cycle_pct,
      combinedPct: activeCommsSite.engineering_summary.comms.combined_dte_elfo_duty_cycle_pct,
      maxBlkDte: activeCommsSite.engineering_summary.comms.max_blackout_dte_hours,
      maxBlkCombined: activeCommsSite.engineering_summary.comms.max_blackout_combined_hours,
    };
  }, [activeCommsSite, horizonAzDeg, missionWindow, relayOn]);

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="editorial-landing" role="region" aria-label="Lunar South Pole interactive overview">
      <nav className="brief-nav is-dark" aria-label="Primary navigation">
        <button
          type="button"
          className="brief-nav-brand"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          LANDING GUIDE
        </button>
        <div className="brief-nav-links">
          <button type="button" className="brief-nav-link" onClick={() => scrollToSection('mission')}>
            South Pole
          </button>
          <button type="button" className="brief-nav-link" onClick={() => scrollToSection('energy')}>
            Sunlight
          </button>
          <button type="button" className="brief-nav-link" onClick={() => scrollToSection('comms')}>
            Signal
          </button>
          <button type="button" className="brief-nav-cta" onClick={() => onStart()}>
            Open Explorer
          </button>
        </div>
      </nav>

      {/* Transparent Hero over rotatable NASA 3D Moon */}
      <header className="hero-section">
        <div className="hero-content">
          <span className="editorial-eyebrow">NASA LRO · LOLA · SPICE DE421</span>
          <h1 className="hero-title">
            Landing
            <br />
            Guide.
          </h1>
          <p className="hero-subtitle">
            Spin the Moon, drop a pin anywhere—even off the beaten Artemis spots—and check what the Sun and Earth look like from the ground.
          </p>
          <div className="hero-actions">
            <button type="button" className="btn-bw-primary" onClick={() => onStart()}>
              <span>Open Explorer</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
          <p className="hero-drag-hint">Drag the Moon to rotate it</p>
        </div>

        <footer className="hero-bottom-bar">
          <span>2026 LUNAR SOUTH POLE NOTEBOOK</span>
          <button
            type="button"
            className="hero-scroll-btn"
            onClick={() => scrollToSection('mission')}
          >
            Scroll to explore the data ↓
          </button>
        </footer>
      </header>

      {/* Section 01: Interactive LOLA Polar Relief Map (Pure Black) */}
      <section id="mission" className="editorial-section section-dark" aria-labelledby="mission-heading">
        <div className="section-container">
          <div className="section-grid">
            <div className="section-copy">
              <span className="section-index">SOUTH POLE · 80°S–90°S</span>
              <h2 id="mission-heading" className="section-heading">
                Eternal peaks beside pitch-black craters.
              </h2>
              <p className="section-lead">
                Click any pin on the LOLA elevation map to inspect real terrain heights—or jump into the 3D Explorer and click an unvisited crater of your own.
              </p>
              <p className="section-body">
                Unlike the lunar equator, ridges near the South Pole catch sunlight most of the month while deep basins next door stay permanently shadowed, cold enough to trap water ice.
              </p>

              <div className="brief-card" aria-live="polite">
                <div className="brief-card-head">
                  <strong>{activeLandmark.name}</strong>
                  <span>{activeLandmark.center.is_psr ? 'Dark Crater (PSR)' : 'Elevated Ridge'}</span>
                </div>
                <dl className="spec-strip">
                  <div>
                    <dt>Elevation</dt>
                    <dd>{activeLandmark.center.elevation_m.toFixed(0)} m</dd>
                  </div>
                  <div>
                    <dt>Mean Sun</dt>
                    <dd>{(activeLandmark.engineering_summary.solar.mean_illum_fraction * 100).toFixed(0)}%</dd>
                  </div>
                  <div>
                    <dt>Direct Earth</dt>
                    <dd>{activeLandmark.engineering_summary.comms.dte_full_disk_duty_cycle_pct.toFixed(0)}%</dd>
                  </div>
                </dl>
                <div className="brief-card-foot">
                  <button
                    type="button"
                    className="btn-bw-inline"
                    onClick={() => onStart(activeLandmark.id)}
                  >
                    Inspect {activeLandmark.name} in 3D →
                  </button>
                </div>
              </div>
            </div>

            <figure className="section-visual-frame">
              <div className="polar-interactive-disc">
                <img
                  src="/assets/lunar/lola_south_pole_hillshade.jpg"
                  alt="NASA LRO LOLA LDEM_80S_80M hillshaded elevation map of the Lunar South Pole from 80°S to 90°S"
                  className="mission-lola-img-round"
                  loading="lazy"
                />
                {landmarkSites.map((site) => {
                  const pos = projectPolarPercent(
                    site.center.latitude_deg,
                    site.center.longitude_east_deg,
                  );
                  const isActive = site.id === activeLandmark.id;
                  const shortLabelMap: Record<string, string> = {
                    shackleton_ridge: 'Ridge',
                    malapert_massif: 'Malapert',
                    mons_mouton_plateau: 'Mouton',
                    haworth_rim: 'Haworth',
                    shackleton_psr_floor: 'Shackleton PSR',
                  };
                  const tagText = shortLabelMap[site.id] ?? site.name.split(' ')[0];
                  const alignLeft = pos.leftPct < 50;
                  return (
                    <button
                      key={site.id}
                      type="button"
                      className={`polar-hotspot ${alignLeft ? 'align-left' : 'align-right'} ${isActive ? 'active' : ''}`}
                      style={{ left: `${pos.leftPct}%`, top: `${pos.topPct}%` }}
                      aria-pressed={isActive}
                      aria-label={`Inspect ${site.name}`}
                      onClick={() => setActiveLandmarkId(site.id)}
                    >
                      <span className="polar-hotspot-dot" aria-hidden="true" />
                      <span className="polar-hotspot-tag">{tagText}</span>
                    </button>
                  );
                })}
              </div>
              <figcaption className="visual-caption">
                Real NASA PDS LOLA 80 m/px South Pole relief (80°S–90°S, 0°E up). Click a landmark to preview.
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* Section 02: Real LOLA Horizon + Interactive Sun Scrubber (Pure Black) */}
      <section id="energy" className="editorial-section section-dark" aria-labelledby="energy-heading">
        <div className="section-container">
          <div className="section-grid">
            <div className="section-visual-frame">
              <div className="interactive-panel">
                <div className="panel-toolbar" role="group" aria-label="Compare horizon sunlight">
                  <button
                    type="button"
                    className={`panel-tab ${energyMode === 'ridge' ? 'active' : ''}`}
                    aria-pressed={energyMode === 'ridge'}
                    onClick={() => setEnergyMode('ridge')}
                  >
                    Connecting Ridge
                  </button>
                  <button
                    type="button"
                    className={`panel-tab ${energyMode === 'psr' ? 'active' : ''}`}
                    aria-pressed={energyMode === 'psr'}
                    onClick={() => setEnergyMode('psr')}
                  >
                    Shackleton Crater Floor
                  </button>
                </div>

                <svg
                  viewBox={`0 0 ${energySvgData.w} ${energySvgData.h}`}
                  className="editorial-diagram"
                  role="img"
                  aria-label={`Real 360 degree LOLA horizon profile and solar track for ${activeEnergySite.name}`}
                >
                  <rect x="0" y="0" width={energySvgData.w} height={energySvgData.h} fill="#08080a" />
                  <line
                    x1={energySvgData.padL}
                    y1={energySvgData.zeroY}
                    x2={energySvgData.padL + energySvgData.plotW}
                    y2={energySvgData.zeroY}
                    stroke="#27272a"
                    strokeDasharray="3 3"
                  />
                  {/* Real LOLA terrain skyline */}
                  <polygon points={energySvgData.horizonArea} fill="#18181b" />
                  <polyline
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="1.6"
                    points={energySvgData.horizonPts}
                  />
                  {/* 30-day Sun trajectory */}
                  {energySvgData.sunDots.map((dot, idx) => (
                    <circle
                      key={idx}
                      cx={dot.x}
                      cy={dot.y}
                      r={1.6}
                      fill="#71717a"
                    />
                  ))}
                  {/* Active Sun position */}
                  <circle
                    cx={energySvgData.curSunX}
                    cy={energySvgData.curSunY}
                    r={6.5}
                    fill={energyStats.fIllum > 0.05 ? '#ffffff' : '#27272a'}
                    stroke="#ffffff"
                    strokeWidth="1.6"
                  />
                  <text x={energySvgData.padL} y={energySvgData.h - 8} fill="#71717a" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                    0° N
                  </text>
                  <text x={energySvgData.padL + energySvgData.plotW * 0.5} y={energySvgData.h - 8} textAnchor="middle" fill="#71717a" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                    180° S
                  </text>
                  <text x={energySvgData.padL + energySvgData.plotW} y={energySvgData.h - 8} textAnchor="end" fill="#71717a" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                    360° N
                  </text>
                  <text x={4} y={energySvgData.zeroY + 3} fill="#71717a" fontSize="9" fontFamily="JetBrains Mono, monospace">
                    0°
                  </text>
                </svg>

                <label className="scrubber-row">
                  <span>
                    {energyStats.utcLabel} UTC · Sun {energyStats.sEl.toFixed(1)}° vs Rim {energyStats.hRim.toFixed(1)}° ·{' '}
                    <strong>{(energyStats.fIllum * 100).toFixed(0)}% lit</strong>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={maxEpoch}
                    value={safeEnergyEpoch}
                    aria-label="Scrub UTC hour across 30 days to move the Sun along the LOLA horizon"
                    onChange={(e) => setEnergyEpochIdx(Number(e.target.value))}
                  />
                </label>
              </div>
              <p className="visual-caption">
                Actual 360° LOLA horizon ray-march + SPICE DE421 solar trajectory. Monthly sunlight: {energyStats.meanPct.toFixed(1)}%.
              </p>
            </div>

            <div className="section-copy">
              <span className="section-index">SUNLIGHT & POWER</span>
              <h2 id="energy-heading" className="section-heading">
                Drag the slider to watch the Sun skim the mountains.
              </h2>
              <p className="section-lead">
                Because the Moon tilts only ~1.54°, the Sun never climbs high overhead at the poles—it circles all the way around the horizon every lunar day.
              </p>
              <p className="section-body">
                Switch between the Connecting Ridge and Shackleton Crater Floor on the left: the white jagged wall is real LOLA topography blocking or clearing the solar disk.
              </p>
              <dl className="spec-strip">
                <div>
                  <dt>Solar Constant</dt>
                  <dd>1,361 W/m²</dd>
                </div>
                <div>
                  <dt>Survival Load</dt>
                  <dd>100 W baseline</dd>
                </div>
                <div>
                  <dt>Local Grid</dt>
                  <dd>5×5 (±500 m)</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </section>

      {/* Section 03: Real 30-Day Earth Libration & ELFO Comms Explorer (Pure Black) */}
      <section id="comms" className="editorial-section section-dark" aria-labelledby="comms-heading">
        <div className="section-container">
          <div className="section-grid">
            <div className="section-copy">
              <span className="section-index">EARTH SIGNAL & RELAYS</span>
              <h2 id="comms-heading" className="section-heading">
                When Earth disappears behind a crater wall.
              </h2>
              <p className="section-lead">
                From the South Pole, Earth nods above and below the horizon every ~27.3 days. Toggle the orbital relay on the chart to see how blackout gaps vanish.
              </p>
              <p className="section-body">
                Direct-to-Earth (DTE) needs an unobstructed line of sight to the full Earth disk. A 3-satellite Elliptical Lunar Frozen Orbit (ELFO) constellation lingers high overhead to bridge multi-day outages.
              </p>
              <dl className="spec-strip">
                <div>
                  <dt>Direct Earth</dt>
                  <dd>{commsSvgData.dtePct.toFixed(0)}% window</dd>
                </div>
                <div>
                  <dt>With ELFO Relay</dt>
                  <dd>{commsSvgData.combinedPct.toFixed(0)}% window</dd>
                </div>
                <div>
                  <dt>Max Blackout</dt>
                  <dd>
                    {relayOn
                      ? `${commsSvgData.maxBlkCombined.toFixed(0)}h`
                      : `${commsSvgData.maxBlkDte.toFixed(0)}h`}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="section-visual-frame">
              <div className="interactive-panel">
                <div className="panel-toolbar panel-toolbar-between">
                  <div className="panel-toolbar-group" role="group" aria-label="Select site for Earth signal preview">
                    {commsCandidates.map((site) => {
                      const label = site.id === 'shackleton_ridge' ? 'Ridge' : site.name.split(' ')[0];
                      return (
                        <button
                          key={site.id}
                          type="button"
                          className={`panel-tab ${site.id === activeCommsSite.id ? 'active' : ''}`}
                          aria-pressed={site.id === activeCommsSite.id}
                          onClick={() => setCommsSiteId(site.id)}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className={`panel-tab ${relayOn ? 'active' : ''}`}
                    aria-pressed={relayOn}
                    onClick={() => setRelayOn((prev) => !prev)}
                  >
                    {relayOn ? '+ ELFO Relay On' : 'Direct Earth Only'}
                  </button>
                </div>

                <svg
                  viewBox={`0 0 ${commsSvgData.w} ${commsSvgData.h}`}
                  className="editorial-diagram"
                  role="img"
                  aria-label={`30 day Earth elevation versus terrain rim and blackouts for ${activeCommsSite.name}`}
                >
                  <rect x="0" y="0" width={commsSvgData.w} height={commsSvgData.h} fill="#08080a" />
                  <line
                    x1={commsSvgData.padL}
                    y1={commsSvgData.zeroY}
                    x2={commsSvgData.padL + commsSvgData.plotW}
                    y2={commsSvgData.zeroY}
                    stroke="#27272a"
                    strokeDasharray="3 3"
                  />
                  {/* Blackout shaded bands */}
                  {commsSvgData.blackoutSegs.map((seg, idx) => (
                    <rect
                      key={`blk-${idx}`}
                      x={seg.x}
                      y={18}
                      width={seg.w}
                      height={176}
                      fill="rgba(255, 255, 255, 0.08)"
                    />
                  ))}
                  {/* Local terrain rim along Earth's azimuth */}
                  <polyline
                    fill="none"
                    stroke="#71717a"
                    strokeWidth="1.3"
                    strokeDasharray="4 3"
                    points={commsSvgData.rimPts}
                  />
                  {/* Real Earth elevation curve */}
                  <polyline
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="2"
                    points={commsSvgData.earthPts}
                  />
                  {/* Coverage ribbon along bottom */}
                  {commsSvgData.dteSegs.map((seg, idx) => (
                    <rect
                      key={`dte-${idx}`}
                      x={seg.x}
                      y={196}
                      width={seg.w}
                      height={5}
                      fill="#ffffff"
                    />
                  ))}
                  <text x={commsSvgData.padL} y={220} fill="#71717a" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                    Nov 15 · White = Earth angle · Dashed = Mountain rim
                  </text>
                </svg>
              </div>
              <p className="visual-caption">
                SPICE DE421 Earth elevation over 30 days vs. local terrain rim at {activeCommsSite.name}. Shaded columns show radio blackouts.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 04: Launch Explorer + Custom Landing Spot Invitation */}
      <section id="explore" className="editorial-section section-dark section-launch" aria-labelledby="launch-heading">
        <div className="section-container launch-inner">
          <span className="section-index">EXPLORE ANYWHERE ON THE MOON</span>
          <h2 id="launch-heading" className="section-heading">
            Try an Artemis candidate—or land somewhere nobody has gone before.
          </h2>
          <p className="section-body launch-copy">
            Inside the 3D Explorer, click anywhere on the Moon or enter any coordinates to ray-march local LOLA terrain horizons, walk the ground in Astronaut view, and inspect solar and Earth geometry. Preliminary geometric study only—does not certify landing safety.
          </p>
          <div className="hero-actions">
            <button type="button" className="btn-bw-primary" onClick={() => onStart()}>
              <span>Launch 3D Explorer</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
