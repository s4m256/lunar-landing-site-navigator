import { LiveSiteAnalysis } from '../navigator/math';
import { LandingSiteEntry, MissionWindow } from '../navigator/types';

export type ScreenMode = 'home' | 'explore';
export type ViewMode = '3d' | '2d';
export type SelectionMode = 'center' | 'cursor';
export type CursorTarget = 'A' | 'B';
export type ActivePanel = 'charts' | 'selection' | 'data' | 'time' | null;

export interface SiteSlot {
  siteId: string;
  xNorm: number;
  yNorm: number;
}

export interface WindowSlice {
  startIdx: number;
  endIdx: number;
  durationDays: number;
  timestamps: string[];
}

export interface WindowSummary {
  durationHours: number;
  meanIllumPct: number;
  sunlitHours: number;
  maxShadowHours: number;
  energyWh: number;
  peakPowerW: number;
  dteDutyPct: number;
  elfoDutyPct: number;
  combinedDutyPct: number;
  maxBlackoutDteHours: number;
  maxBlackoutCombinedHours: number;
}

export interface GlossaryEntry {
  id: string;
  term: string;
  shortExplain: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    id: 'horizon',
    term: 'Horizonte geométrico',
    shortExplain:
      'É a linha mais alta formada por montanhas e bordas de crateras vista do solo lunar em cada direção (0° a 360°). Se o Sol ou a Terra estiverem abaixo dessa linha, ficam bloqueados pelo relevo.',
  },
  {
    id: 'psr',
    term: 'Região Permanentemente Sombreada (PSR)',
    shortExplain:
      'Fundo de crateras polares onde a luz direta do Sol não alcança devido à baixa inclinação solar na Lua. Pode preservar gelo de água, mas exige baterias ou geração externa.',
  },
  {
    id: 'dte',
    term: 'Visibilidade Direta da Terra (DTE)',
    shortExplain:
      'Momentos em que o disco da Terra aparece acima das montanhas locais, permitindo comunicação direta sem satélite intermediário.',
  },
  {
    id: 'blackout',
    term: 'Intervalo de blackout',
    shortExplain:
      'Período contínuo em horas sem linha de vista para a Terra (ou para a rede de satélites relay, quando ativada).',
  },
];

export const R_MOON_KM = 1737.4;

export function formatUtcReadable(isoUtc: string): { date: string; time: string; full: string } {
  const safe = isoUtc.includes('T') ? isoUtc : '2026-11-15T00:00:00Z';
  const [datePart, timePart] = safe.split('T');
  const hhmm = timePart.slice(0, 5);
  return {
    date: datePart,
    time: `${hhmm} UTC`,
    full: `${datePart} ${hhmm} UTC`,
  };
}

export function formatCoordLatLon(latDeg: number, lonEastDeg: number): string {
  const ns = latDeg >= 0 ? 'N' : 'S';
  const lonNorm = ((lonEastDeg % 360) + 360) % 360;
  const lonStr =
    lonNorm > 180 ? `${(360 - lonNorm).toFixed(2)}° O` : `${lonNorm.toFixed(2)}° L`;
  return `${Math.abs(latDeg).toFixed(2)}° ${ns}, ${lonStr} (${lonEastDeg.toFixed(2)}° L)`;
}

/**
 * Resolve uma data/hora inicial UTC + duração em dias sobre o vetor real de épocas
 * do dataset pré-computado, sem fabricar dados fora da janela SPICE validada.
 */
export function computeWindowSlice(
  missionWindow: MissionWindow,
  startDateStr: string,
  startHourUtc: number,
  durationDays: number,
): { slice: WindowSlice; error: string | null } {
  const timestamps = missionWindow.timestamps_utc;
  const totalEpochs = timestamps.length;
  const stepHours = Math.max(1, Math.round(missionWindow.step_seconds / 3600));

  const minIso = timestamps[0] ?? '2026-11-15T00:00:00Z';
  const maxIso = timestamps[totalEpochs - 1] ?? '2026-12-15T00:00:00Z';
  const minMs = Date.parse(minIso);
  const maxMs = Date.parse(maxIso);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDateStr) || Number.isNaN(startHourUtc)) {
    return {
      slice: {
        startIdx: 0,
        endIdx: Math.min(totalEpochs - 1, Math.round((durationDays * 24) / stepHours)),
        durationDays,
        timestamps: timestamps.slice(
          0,
          Math.min(totalEpochs, Math.round((durationDays * 24) / stepHours) + 1),
        ),
      },
      error: 'Formato de data ou hora inválido. Use data no formato AAAA-MM-DD e hora entre 0 e 23 UTC.',
    };
  }

  const clampedHour = Math.max(0, Math.min(23, Math.floor(startHourUtc)));
  const hh = String(clampedHour).padStart(2, '0');
  const candidateMs = Date.parse(`${startDateStr}T${hh}:00:00Z`);

  if (Number.isNaN(candidateMs)) {
    return {
      slice: {
        startIdx: 0,
        endIdx: totalEpochs - 1,
        durationDays: 30,
        timestamps,
      },
      error: 'A data digitada não existe no calendário. Tente outra data entre 15/11/2026 e 14/12/2026.',
    };
  }

  if (candidateMs < minMs || candidateMs >= maxMs) {
    const startMin = minIso.slice(0, 10);
    const endMax = maxIso.slice(0, 10);
    return {
      slice: {
        startIdx: 0,
        endIdx: Math.min(totalEpochs - 1, Math.round((durationDays * 24) / stepHours)),
        durationDays,
        timestamps: timestamps.slice(
          0,
          Math.min(totalEpochs, Math.round((durationDays * 24) / stepHours) + 1),
        ),
      },
      error: `Neste protótipo offline, as efemérides NASA validadas vão de ${startMin} a ${endMax} UTC. Use "Usar período de exemplo" para voltar ao intervalo válido.`,
    };
  }

  const diffHours = Math.round((candidateMs - minMs) / 3_600_000);
  const startIdx = Math.max(0, Math.min(totalEpochs - 2, Math.floor(diffHours / stepHours)));
  const spanSteps = Math.max(1, Math.round((durationDays * 24) / stepHours));
  const endIdx = Math.min(totalEpochs - 1, startIdx + spanSteps);

  return {
    slice: {
      startIdx,
      endIdx,
      durationDays: Number((((endIdx - startIdx) * stepHours) / 24).toFixed(1)),
      timestamps: timestamps.slice(startIdx, endIdx + 1),
    },
    error: null,
  };
}

export function summarizeAnalysisWindow(
  analysis: LiveSiteAnalysis,
  missionWindow: MissionWindow,
  startIdx: number,
  endIdx: number,
): WindowSummary {
  const states = analysis.epochStates;
  const lo = Math.max(0, Math.min(states.length - 1, startIdx));
  const hi = Math.max(lo, Math.min(states.length - 1, endIdx));
  const count = hi - lo + 1;
  const stepHours = missionWindow.step_seconds / 3600;

  let illumSum = 0;
  let sunlitHours = 0;
  let powerTrapz = 0;
  let peakPowerW = 0;
  let curShadow = 0;
  let maxShadow = 0;

  let dteCount = 0;
  let elfoCount = 0;
  let combCount = 0;
  let curDteBlack = 0;
  let maxDteBlack = 0;
  let curCombBlack = 0;
  let maxCombBlack = 0;

  for (let i = lo; i <= hi; i++) {
    const st = states[i];
    illumSum += st.fIllum;
    if (st.fIllum > 1e-6) {
      sunlitHours += stepHours;
      curShadow = 0;
    } else {
      curShadow += stepHours;
      if (curShadow > maxShadow) maxShadow = curShadow;
    }

    const w = i === lo || i === hi ? 0.5 : 1.0;
    powerTrapz += w * st.powerW;
    if (st.powerW > peakPowerW) peakPowerW = st.powerW;

    if (st.dteVisible) {
      dteCount++;
      curDteBlack = 0;
    } else {
      curDteBlack += stepHours;
      if (curDteBlack > maxDteBlack) maxDteBlack = curDteBlack;
    }

    if (st.elfoConstellationVisible) elfoCount++;

    if (st.combinedLinkVisible) {
      combCount++;
      curCombBlack = 0;
    } else {
      curCombBlack += stepHours;
      if (curCombBlack > maxCombBlack) maxCombBlack = curCombBlack;
    }
  }

  return {
    durationHours: Math.max(stepHours, (hi - lo) * stepHours),
    meanIllumPct: (illumSum / count) * 100,
    sunlitHours,
    maxShadowHours: maxShadow,
    energyWh: powerTrapz * stepHours,
    peakPowerW,
    dteDutyPct: (dteCount / count) * 100,
    elfoDutyPct: (elfoCount / count) * 100,
    combinedDutyPct: (combCount / count) * 100,
    maxBlackoutDteHours: maxDteBlack,
    maxBlackoutCombinedHours: maxCombBlack,
  };
}

/**
 * Converte latitude e longitude selenográfica em coordenadas cartesianas 3D unitárias
 * (mesmo referencial em que Polo Sul = (0, 0, -1) e 0° Leste aponta para +X).
 */
export function latLonToUnitVec(latDeg: number, lonEastDeg: number): [number, number, number] {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonEastDeg * Math.PI) / 180;
  return [
    Math.cos(lat) * Math.cos(lon),
    Math.cos(lat) * Math.sin(lon),
    Math.sin(lat),
  ];
}

/**
 * Dado qualquer ponto (lat, lon) escolhido no globo 3D ou mapa 2D, encontra a região
 * LOLA pré-computada mais próxima e informa se o ponto está dentro da faixa polar sul real (80°S-90°S).
 */
export function findNearestPrecomputedSite(
  latDeg: number,
  lonEastDeg: number,
  sites: LandingSiteEntry[],
): {
  site: LandingSiteEntry;
  xNorm: number;
  yNorm: number;
  distanceKm: number;
  isSouthPoleCovered: boolean;
} {
  const [tx, ty, tz] = latLonToUnitVec(latDeg, lonEastDeg);
  let bestSite = sites[0];
  let bestDot = -2;

  for (const s of sites) {
    const [sx, sy, sz] = latLonToUnitVec(s.center.latitude_deg, s.center.longitude_east_deg);
    const dot = Math.max(-1, Math.min(1, tx * sx + ty * sy + tz * sz));
    if (dot > bestDot) {
      bestDot = dot;
      bestSite = s;
    }
  }

  const angularRad = Math.acos(Math.max(-1, Math.min(1, bestDot)));
  const distanceKm = angularRad * R_MOON_KM;

  // Se estiver bem próximo ao centro do sítio (<= 1.2 km), mapeia deslocamento fino no grid 5x5 (500 m)
  let xNorm = 0;
  let yNorm = 0;
  if (distanceKm <= 1.2) {
    const dLatM = (latDeg - bestSite.center.latitude_deg) * (Math.PI / 180) * R_MOON_KM * 1000;
    const cosLat = Math.max(0.05, Math.cos((bestSite.center.latitude_deg * Math.PI) / 180));
    const dLonM =
      (lonEastDeg - bestSite.center.longitude_east_deg) *
      (Math.PI / 180) *
      R_MOON_KM *
      1000 *
      cosLat;
    const halfSpanM = bestSite.local_grid.spacing_m * ((bestSite.local_grid.grid_size - 1) / 2);
    if (halfSpanM > 0) {
      xNorm = Math.max(-1, Math.min(1, dLonM / halfSpanM));
      yNorm = Math.max(-1, Math.min(1, dLatM / halfSpanM));
    }
  }

  return {
    site: bestSite,
    xNorm,
    yNorm,
    distanceKm,
    isSouthPoleCovered: latDeg <= -79.0,
  };
}

export function describePlainCondition(
  siteName: string,
  analysis: LiveSiteAnalysis,
  epochIdx: number,
  windowSummary: WindowSummary,
  relayEnabled: boolean,
): {
  skyNow: string;
  commsNow: string;
  cautionNote: string;
} {
  const epoch = analysis.epochStates[epochIdx] ?? analysis.epochStates[0];

  let skyNow = 'Sombra total neste horário: o relevo local bloqueia o Sol.';
  if (epoch.fIllum >= 0.99) {
    skyNow = 'Sol pleno acima do horizonte local neste horário.';
  } else if (epoch.fIllum > 0.01) {
    skyNow = `Iluminação solar parcial (${(epoch.fIllum * 100).toFixed(0)}% do disco visível sobre as montanhas).`;
  }

  let commsNow = 'Sem linha de vista ativa para Terra ou satélite relay neste horário.';
  if (epoch.dteVisible) {
    commsNow = 'Terra visível acima do horizonte (comunicação direta disponível).';
  } else if (relayEnabled && epoch.elfoConstellationVisible) {
    commsNow = 'Terra encoberta pelo relevo, porém coberta por satélite relay em órbita lunar (ELFO).';
  }

  const slopeOk = analysis.terrain.slopeDeg <= 15;
  const cautionNote = slopeOk
    ? `Estimativa geométrica preliminar em ${siteName}: declive local de ${analysis.terrain.slopeDeg.toFixed(1)}° (< 15°) e ${windowSummary.meanIllumPct.toFixed(0)}% de luz solar no período. Não substitui certificação térmica, geotécnica ou análise de missão.`
    : `Atenção neste ponto de ${siteName}: declive local elevado (${analysis.terrain.slopeDeg.toFixed(1)}° ≥ 15°) e sombra prolongada exigem cautela. Dados representam apenas geometria topográfica e orbital.`;

  return { skyNow, commsNow, cautionNote };
}
