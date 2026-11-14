import React, { useMemo, useRef, useState } from 'react';
import { LiveEpochState, LiveSiteAnalysis } from '../navigator/math';
import { LandingSiteEntry } from '../navigator/types';
import {
  CursorTarget,
  findNearestPrecomputedSite,
  formatCoordLatLon,
  latLonToUnitVec,
  ScreenMode,
  SelectionMode,
  SiteSlot,
  ViewMode,
} from './state';

interface LunarViewportProps {
  screen: ScreenMode;
  viewMode: ViewMode;
  selectionMode: SelectionMode;
  cursorTarget: CursorTarget;
  sites: LandingSiteEntry[];
  slotA: SiteSlot;
  slotB: SiteSlot | null;
  analysisA: LiveSiteAnalysis;
  sunAzDeg: number;
  sunElDeg: number;
  earthAzDeg: number;
  earthElDeg: number;
  epochA: LiveEpochState;
  onAssignSlot: (
    target: CursorTarget,
    siteId: string,
    xNorm: number,
    yNorm: number,
    outsideCoverageWarning: string | null,
  ) => void;
}

interface ProjectedLandmark {
  name: string;
  lat: number;
  lon: number;
  radiusDeg: number;
  kind: 'mare' | 'crater';
}

const LUNAR_LANDMARKS: ProjectedLandmark[] = [
  { name: 'Mare Imbrium', lat: 33, lon: 344, radiusDeg: 18, kind: 'mare' },
  { name: 'Oceanus Procellarum', lat: 18, lon: 303, radiusDeg: 24, kind: 'mare' },
  { name: 'Mare Serenitatis', lat: 28, lon: 18, radiusDeg: 14, kind: 'mare' },
  { name: 'Mare Tranquillitatis', lat: 8, lon: 31, radiusDeg: 13, kind: 'mare' },
  { name: 'Mare Crisium', lat: 17, lon: 59, radiusDeg: 9, kind: 'mare' },
  { name: 'Mare Orientale', lat: -19, lon: 267, radiusDeg: 12, kind: 'mare' },
  { name: 'Bacia Polo Sul-Aitken', lat: -56, lon: 180, radiusDeg: 28, kind: 'mare' },
  { name: 'Cratera Tycho', lat: -43.3, lon: 348.8, radiusDeg: 5, kind: 'crater' },
  { name: 'Cratera Clavius', lat: -58.4, lon: 345.6, radiusDeg: 6.5, kind: 'crater' },
  { name: 'Cratera Bailly', lat: -66.8, lon: 291, radiusDeg: 6, kind: 'crater' },
  { name: 'Cratera Schrödinger', lat: -75, lon: 132.4, radiusDeg: 7, kind: 'crater' },
  { name: 'Cratera Shackleton', lat: -89.67, lon: 129.78, radiusDeg: 1.8, kind: 'crater' },
];

const SVG_W = 900;
const SVG_H = 700;
const CX = 450;
const CY = 350;
const GLOBE_R = 250;

function project3D(
  latDeg: number,
  lonEastDeg: number,
  camLatDeg: number,
  camLonDeg: number,
  radiusPx = GLOBE_R,
): { x: number; y: number; z: number; visible: boolean } {
  const [vx, vy, vz] = latLonToUnitVec(latDeg, lonEastDeg);
  const cLon = (camLonDeg * Math.PI) / 180;
  const cLat = (camLatDeg * Math.PI) / 180;

  const x1 = vx * Math.cos(cLon) + vy * Math.sin(cLon);
  const y1 = -vx * Math.sin(cLon) + vy * Math.cos(cLon);
  const z1 = vz;

  const xCam = y1;
  const yCam = -x1 * Math.sin(cLat) + z1 * Math.cos(cLat);
  const zCam = x1 * Math.cos(cLat) + z1 * Math.sin(cLat);

  return {
    x: CX + xCam * radiusPx,
    y: CY - yCam * radiusPx,
    z: zCam,
    visible: zCam >= -0.02,
  };
}

function inverse3D(
  svgX: number,
  svgY: number,
  camLatDeg: number,
  camLonDeg: number,
  radiusPx = GLOBE_R,
): { latDeg: number; lonEastDeg: number } | null {
  const xCam = (svgX - CX) / radiusPx;
  const yCam = -(svgY - CY) / radiusPx;
  const r2 = xCam * xCam + yCam * yCam;
  if (r2 > 1.0) return null;
  const zCam = Math.sqrt(Math.max(0, 1 - r2));

  const cLat = (camLatDeg * Math.PI) / 180;
  const cLon = (camLonDeg * Math.PI) / 180;

  const y1 = xCam;
  const x1 = zCam * Math.cos(cLat) - yCam * Math.sin(cLat);
  const z1 = zCam * Math.sin(cLat) + yCam * Math.cos(cLat);

  const vx = x1 * Math.cos(cLon) - y1 * Math.sin(cLon);
  const vy = x1 * Math.sin(cLon) + y1 * Math.cos(cLon);
  const vz = z1;

  const latDeg = (Math.asin(Math.max(-1, Math.min(1, vz))) * 180) / Math.PI;
  const lonEastDeg = ((Math.atan2(vy, vx) * 180) / Math.PI + 360) % 360;
  return { latDeg, lonEastDeg };
}

function project2DPolar(
  latDeg: number,
  lonEastDeg: number,
  panX: number,
  panY: number,
  scalePxPerDeg: number,
): { x: number; y: number } {
  const colat = Math.max(0, 90 + latDeg);
  const r = colat * scalePxPerDeg;
  const rad = (lonEastDeg * Math.PI) / 180;
  return {
    x: CX + panX + r * Math.sin(rad),
    y: CY + panY - r * Math.cos(rad),
  };
}

function inverse2DPolar(
  svgX: number,
  svgY: number,
  panX: number,
  panY: number,
  scalePxPerDeg: number,
): { latDeg: number; lonEastDeg: number } {
  const dx = svgX - (CX + panX);
  const dy = -(svgY - (CY + panY));
  const r = Math.hypot(dx, dy);
  const colatDeg = Math.min(89.9, r / scalePxPerDeg);
  const latDeg = -90 + colatDeg;
  const lonEastDeg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  return { latDeg, lonEastDeg };
}

export const LunarViewport: React.FC<LunarViewportProps> = ({
  screen,
  viewMode,
  selectionMode,
  cursorTarget,
  sites,
  slotA,
  slotB,
  sunAzDeg,
  sunElDeg,
  earthAzDeg,
  onAssignSlot,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Estado da câmera compartilhado (independente dos pinos A/B que vivem no componente pai)
  const [camLat, setCamLat] = useState<number>(-72);
  const [camLon, setCamLon] = useState<number>(350);
  const [zoom3d, setZoom3d] = useState<number>(1.0);
  const [pan2d, setPan2d] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom2d, setZoom2d] = useState<number>(1.0);
  const [coverageNotice, setCoverageNotice] = useState<string | null>(null);

  const dragRef = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    origLat: number;
    origLon: number;
    origPanX: number;
    origPanY: number;
  } | null>(null);

  const radiusPx = GLOBE_R * zoom3d;
  const scale2d = 21 * zoom2d;

  const pickPointAtSvg = (svgX: number, svgY: number): { latDeg: number; lonEastDeg: number } | null => {
    if (viewMode === '3d') {
      return inverse3D(svgX, svgY, camLat, camLon, radiusPx);
    }
    return inverse2DPolar(svgX, svgY, pan2d.x, pan2d.y, scale2d);
  };

  // Coordenada selenográfica atualmente sob a mira central
  const centerAimCoords = useMemo(() => {
    return pickPointAtSvg(CX, CY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, camLat, camLon, zoom3d, pan2d.x, pan2d.y, zoom2d]);

  const centerNearestSite = useMemo(() => {
    if (!centerAimCoords) return null;
    return findNearestPrecomputedSite(centerAimCoords.latDeg, centerAimCoords.lonEastDeg, sites);
  }, [centerAimCoords, sites]);

  // Posição de luz solar em coordenadas de câmera 3D para sombreamento indicativo
  const sunLightOffset = useMemo(() => {
    // Subsolar está próximo do equador lunar na longitude aproximada do azimute solar visto do polo sul
    const subSolarLat = Math.max(-5, Math.min(5, sunElDeg));
    const subSolarLon = ((-sunAzDeg % 360) + 360) % 360;
    const p = project3D(subSolarLat, subSolarLon, camLat, camLon, 1);
    return {
      cxPct: `${50 + p.x * 0.08 - 50 * 0.08}`,
      gradX: 50 + (p.x - CX) * 0.14,
      gradY: 50 + (p.y - CY) * 0.14,
    };
  }, [sunAzDeg, sunElDeg, camLat, camLon]);

  const toSvgCoords = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: CX, y: CY };
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / Math.max(1, rect.width)) * SVG_W;
    const y = ((clientY - rect.top) / Math.max(1, rect.height)) * SVG_H;
    return { x, y };
  };

  const commitPick = (coords: { latDeg: number; lonEastDeg: number }, target: CursorTarget) => {
    const nearest = findNearestPrecomputedSite(coords.latDeg, coords.lonEastDeg, sites);
    const msg = nearest.isSouthPoleCovered
      ? null
      : `Fora da faixa LOLA de alta resolução (80°S–90°S). Associado à região polar mais próxima (${nearest.site.name}).`;
    setCoverageNotice(msg);
    onAssignSlot(target, nearest.site.id, nearest.xNorm, nearest.yNorm, msg);
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    // Evita iniciar drag quando usuário clicou diretamente em um pino de sítio
    if ((e.target as HTMLElement).closest?.('[data-site-pin="true"]')) return;
    dragRef.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      origLat: camLat,
      origLon: camLon,
      origPanX: pan2d.x,
      origPanY: pan2d.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || !drag.active) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    if (!drag.moved) return;

    if (viewMode === '3d') {
      const nextLon = (((drag.origLon - dx * 0.35) % 360) + 360) % 360;
      const nextLat = Math.max(-89.9, Math.min(89.9, drag.origLat - dy * 0.35));
      setCamLon(nextLon);
      setCamLat(nextLat);
    } else {
      setPan2d({
        x: Math.max(-240, Math.min(240, drag.origPanX + dx * 0.9)),
        y: Math.max(-200, Math.min(200, drag.origPanY + dy * 0.9)),
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (!drag.moved && screen === 'explore' && selectionMode === 'cursor') {
      const { x, y } = toSvgCoords(e.clientX, e.clientY);
      const picked = pickPointAtSvg(x, y);
      if (picked) {
        commitPick(picked, cursorTarget);
      }
    }
  };

  const handleKeyDownStage = (e: React.KeyboardEvent<SVGSVGElement>) => {
    const stepDeg = 6;
    const stepPan = 18;
    if (viewMode === '3d') {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCamLon((v) => (v - stepDeg + 360) % 360);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCamLon((v) => (v + stepDeg) % 360);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCamLat((v) => Math.min(89.9, v + stepDeg));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCamLat((v) => Math.max(-89.9, v - stepDeg));
      }
    } else {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setPan2d((p) => ({ ...p, x: Math.min(240, p.x + stepPan) }));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setPan2d((p) => ({ ...p, x: Math.max(-240, p.x - stepPan) }));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setPan2d((p) => ({ ...p, y: Math.min(200, p.y + stepPan) }));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setPan2d((p) => ({ ...p, y: Math.max(-200, p.y - stepPan) }));
      }
    }
  };

  const recenterSouthPole = () => {
    if (viewMode === '3d') {
      setCamLat(-85);
      setCamLon(0);
      setZoom3d(1.1);
    } else {
      setPan2d({ x: 0, y: 0 });
      setZoom2d(1.0);
    }
    setCoverageNotice(null);
  };

  // Projetar anel 80°S e paralelos/meridianos no globo 3D
  const southPoleRingPoints = useMemo(() => {
    if (viewMode !== '3d') return [];
    const pts: string[] = [];
    for (let lon = 0; lon <= 360; lon += 10) {
      const p = project3D(-80, lon, camLat, camLon, radiusPx);
      if (p.visible) {
        pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
      }
    }
    return pts;
  }, [viewMode, camLat, camLon, radiusPx]);

  // Projetar todos os 10 sítios conforme 2D ou 3D
  const projectedSites = useMemo(() => {
    return sites.map((site) => {
      const isA = slotA.siteId === site.id;
      const isB = slotB?.siteId === site.id;
      const pos =
        viewMode === '3d'
          ? project3D(site.center.latitude_deg, site.center.longitude_east_deg, camLat, camLon, radiusPx)
          : {
              ...project2DPolar(
                site.center.latitude_deg,
                site.center.longitude_east_deg,
                pan2d.x,
                pan2d.y,
                scale2d,
              ),
              z: 1,
              visible: true,
            };
      return { site, pos, isA, isB };
    });
  }, [sites, slotA.siteId, slotB?.siteId, viewMode, camLat, camLon, radiusPx, pan2d.x, pan2d.y, scale2d]);

  const sunRad2d = (sunAzDeg * Math.PI) / 180;
  const earthRad2d = (earthAzDeg * Math.PI) / 180;

  return (
    <div className="lunar-stage-wrap">
      <svg
        ref={svgRef}
        className="lunar-stage-svg"
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="xMidYMid slice"
        tabIndex={screen === 'explore' ? 0 : -1}
        role="img"
        aria-label={
          viewMode === '3d'
            ? 'Globo lunar 3D interativo com iluminação solar e marcadores A e B no Polo Sul. Use as setas do teclado para girar.'
            : 'Mapa polar sul lunar 2D em projeção estereográfica com marcadores A e B. Use as setas do teclado para mover.'
        }
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onKeyDown={handleKeyDownStage}
      >
        <defs>
          <radialGradient id="lgSpaceGlow" cx="50%" cy="50%" r="72%">
            <stop offset="0%" stopColor="#0f1d36" />
            <stop offset="55%" stopColor="#070d1b" />
            <stop offset="100%" stopColor="#03060d" />
          </radialGradient>

          <radialGradient
            id="lgMoonBody"
            cx={`${Math.max(20, Math.min(80, sunLightOffset.gradX))}%`}
            cy={`${Math.max(20, Math.min(80, sunLightOffset.gradY))}%`}
            r="68%"
          >
            <stop offset="0%" stopColor="#d9dfea" />
            <stop offset="48%" stopColor="#8b96aa" />
            <stop offset="82%" stopColor="#353f52" />
            <stop offset="100%" stopColor="#121824" />
          </radialGradient>

          <radialGradient id="lgPolarMapBg" cx="50%" cy="50%" r="58%">
            <stop offset="0%" stopColor="#263144" />
            <stop offset="65%" stopColor="#172030" />
            <stop offset="100%" stopColor="#0b111c" />
          </radialGradient>

          <clipPath id="lgGlobeClip">
            <circle cx={CX} cy={CY} r={radiusPx} />
          </clipPath>
        </defs>

        {/* Fundo espacial com campo discreto de estrelas */}
        <rect x="0" y="0" width={SVG_W} height={SVG_H} fill="url(#lgSpaceGlow)" />
        {[
          [82, 95, 1.3],
          [148, 210, 0.9],
          [220, 68, 1.5],
          [735, 112, 1.4],
          [812, 240, 1.1],
          [110, 560, 1.2],
          [785, 585, 1.5],
          [670, 640, 1.0],
          [265, 625, 1.1],
          [845, 420, 0.9],
          [48, 390, 1.2],
        ].map(([sx, sy, sr], i) => (
          <circle key={i} cx={sx} cy={sy} r={sr} fill="#dce8ff" opacity={0.45} />
        ))}

        {viewMode === '3d' ? (
          <g>
            {/* Halo atmosférico/óptico sutil ao redor do limbo */}
            <circle
              cx={CX}
              cy={CY}
              r={radiusPx + 14}
              fill="none"
              stroke="rgba(125, 211, 252, 0.14)"
              strokeWidth="12"
            />

            {/* Esfera Lunar */}
            <circle cx={CX} cy={CY} r={radiusPx} fill="url(#lgMoonBody)" />

            <g clipPath="url(#lgGlobeClip)">
              {/* Mares e crateras projetados em 3D */}
              {LUNAR_LANDMARKS.map((lm) => {
                const p = project3D(lm.lat, lm.lon, camLat, camLon, radiusPx);
                if (!p.visible) return null;
                const rPx = Math.max(4, (lm.radiusDeg * Math.PI) / 180 * radiusPx * Math.max(0.35, p.z));
                return lm.kind === 'mare' ? (
                  <ellipse
                    key={lm.name}
                    cx={p.x}
                    cy={p.y}
                    rx={rPx}
                    ry={rPx * Math.max(0.3, p.z)}
                    fill="rgba(22, 30, 44, 0.36)"
                  />
                ) : (
                  <g key={lm.name}>
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={rPx}
                      fill="rgba(18, 25, 38, 0.34)"
                      stroke="rgba(240, 246, 255, 0.34)"
                      strokeWidth="1.2"
                    />
                  </g>
                );
              })}

              {/* Grade sutil de paralelos/meridianos para orientação */}
              {[-60, -30, 0, 30, 60].map((lat) => {
                const segs: string[] = [];
                for (let lon = 0; lon <= 360; lon += 15) {
                  const p = project3D(lat, lon, camLat, camLon, radiusPx);
                  if (p.visible) segs.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
                }
                return segs.length > 2 ? (
                  <polyline
                    key={`lat-${lat}`}
                    points={segs.join(' ')}
                    fill="none"
                    stroke="rgba(180, 205, 240, 0.12)"
                    strokeWidth="0.9"
                  />
                ) : null;
              })}

              {/* Faixa LOLA de alta resolução (80°S - 90°S) */}
              {southPoleRingPoints.length > 3 && (
                <polygon
                  points={southPoleRingPoints.join(' ')}
                  fill="rgba(56, 189, 248, 0.1)"
                  stroke="#38bdf8"
                  strokeWidth="1.4"
                  strokeDasharray="5 4"
                />
              )}
            </g>

            {/* Borda do limbo */}
            <circle
              cx={CX}
              cy={CY}
              r={radiusPx}
              fill="none"
              stroke="rgba(185, 210, 245, 0.35)"
              strokeWidth="1.5"
            />

            {/* Indicador de direção Solar e Terra no espaço ao redor do globo */}
            {screen === 'explore' && (
              <g aria-hidden="true">
                <line
                  x1={CX + Math.sin(sunRad2d) * (radiusPx + 18)}
                  y1={CY - Math.cos(sunRad2d) * (radiusPx + 18)}
                  x2={CX + Math.sin(sunRad2d) * (radiusPx + 42)}
                  y2={CY - Math.cos(sunRad2d) * (radiusPx + 42)}
                  stroke="#ffd166"
                  strokeWidth="2.5"
                />
                <circle
                  cx={CX + Math.sin(sunRad2d) * (radiusPx + 50)}
                  cy={CY - Math.cos(sunRad2d) * (radiusPx + 50)}
                  r="8"
                  fill="#ffd166"
                />
                <text
                  x={CX + Math.sin(sunRad2d) * (radiusPx + 68)}
                  y={CY - Math.cos(sunRad2d) * (radiusPx + 68) + 4}
                  textAnchor="middle"
                  fill="#ffd166"
                  fontSize="11"
                  fontWeight="700"
                >
                  Sol
                </text>

                <circle
                  cx={CX + Math.sin(earthRad2d) * (radiusPx + 46)}
                  cy={CY - Math.cos(earthRad2d) * (radiusPx + 46)}
                  r="6"
                  fill="#74a9ff"
                />
                <text
                  x={CX + Math.sin(earthRad2d) * (radiusPx + 66)}
                  y={CY - Math.cos(earthRad2d) * (radiusPx + 66) + 4}
                  textAnchor="middle"
                  fill="#9cc2ff"
                  fontSize="11"
                  fontWeight="700"
                >
                  Terra
                </text>
              </g>
            )}
          </g>
        ) : (
          /* Projeção Polar 2D (80°S - 90°S) */
          <g>
            {[
              { lat: -80, label: '80° S (Limite DEM LOLA 80 m/px)' },
              { lat: -84, label: '84° S' },
              { lat: -88, label: '88° S' },
            ].map((ring, idx) => {
              const r = (90 + ring.lat) * scale2d;
              return (
                <g key={ring.lat}>
                  <circle
                    cx={CX + pan2d.x}
                    cy={CY + pan2d.y}
                    r={r}
                    fill={idx === 0 ? 'url(#lgPolarMapBg)' : 'none'}
                    stroke={idx === 0 ? '#38bdf8' : 'rgba(180, 205, 240, 0.25)'}
                    strokeWidth={idx === 0 ? '1.8' : '1'}
                    strokeDasharray={idx === 0 ? undefined : '4 4'}
                  />
                  <text
                    x={CX + pan2d.x + 6}
                    y={CY + pan2d.y - r + 15}
                    fill="#9db4d2"
                    fontSize="11"
                  >
                    {ring.label}
                  </text>
                </g>
              );
            })}

            {/* Cruz do Polo Sul geográfico */}
            <circle cx={CX + pan2d.x} cy={CY + pan2d.y} r="3" fill="#7dd3fc" />
            <text
              x={CX + pan2d.x + 10}
              y={CY + pan2d.y + 4}
              fill="#7dd3fc"
              fontSize="11"
              fontWeight="600"
            >
              90° S
            </text>

            {/* Direções cardeais do mapa polar */}
            <text
              x={CX + pan2d.x}
              y={CY + pan2d.y - 10 * scale2d - 12}
              textAnchor="middle"
              fill="#9cc2ff"
              fontSize="12"
              fontWeight="700"
            >
              0° L (Direção média da Terra)
            </text>
            <text
              x={CX + pan2d.x + 10 * scale2d + 20}
              y={CY + pan2d.y + 4}
              textAnchor="start"
              fill="#9db4d2"
              fontSize="11"
            >
              90° L
            </text>

            {/* Vetores Sol e Terra na época atual */}
            <line
              x1={CX + pan2d.x}
              y1={CY + pan2d.y}
              x2={CX + pan2d.x + Math.sin(sunRad2d) * 9.8 * scale2d}
              y2={CY + pan2d.y - Math.cos(sunRad2d) * 9.8 * scale2d}
              stroke="#ffd166"
              strokeWidth="2"
              strokeDasharray="6 4"
            />
            <circle
              cx={CX + pan2d.x + Math.sin(sunRad2d) * 10.6 * scale2d}
              cy={CY + pan2d.y - Math.cos(sunRad2d) * 10.6 * scale2d}
              r="7"
              fill="#ffd166"
            />
            <text
              x={CX + pan2d.x + Math.sin(sunRad2d) * 11.4 * scale2d}
              y={CY + pan2d.y - Math.cos(sunRad2d) * 11.4 * scale2d + 4}
              textAnchor="middle"
              fill="#ffd166"
              fontSize="11"
              fontWeight="700"
            >
              Sol
            </text>

            <line
              x1={CX + pan2d.x}
              y1={CY + pan2d.y}
              x2={CX + pan2d.x + Math.sin(earthRad2d) * 9.2 * scale2d}
              y2={CY + pan2d.y - Math.cos(earthRad2d) * 9.2 * scale2d}
              stroke="#74a9ff"
              strokeWidth="1.8"
              strokeDasharray="3 4"
            />
          </g>
        )}

        {/* Pinos das 10 regiões e marcadores destacados A e B (idênticos em 2D e 3D) */}
        {screen === 'explore' &&
          projectedSites.map(({ site, pos, isA, isB }) => {
            if (!pos.visible) return null;
            return (
              <g
                key={site.id}
                data-site-pin="true"
                transform={`translate(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})`}
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  const targetToUpdate: CursorTarget =
                    selectionMode === 'cursor'
                      ? cursorTarget
                      : isB
                        ? 'B'
                        : isA
                          ? 'A'
                          : slotB === null
                            ? 'B'
                            : cursorTarget;
                  onAssignSlot(targetToUpdate, site.id, 0, 0, null);
                  setCoverageNotice(null);
                }}
              >
                {isA ? (
                  <>
                    <circle r="13" fill="rgba(245, 183, 73, 0.24)" stroke="#f5b749" strokeWidth="2.5" />
                    <circle r="8" fill="#f5b749" />
                    <text y="4" textAnchor="middle" fill="#060b14" fontSize="10" fontWeight="800">
                      A
                    </text>
                  </>
                ) : isB ? (
                  <>
                    <polygon
                      points="0,-13 13,0 0,13 -13,0"
                      fill="rgba(87, 214, 255, 0.25)"
                      stroke="#57d6ff"
                      strokeWidth="2.2"
                    />
                    <circle r="7" fill="#57d6ff" />
                    <text y="3.5" textAnchor="middle" fill="#060b14" fontSize="10" fontWeight="800">
                      B
                    </text>
                  </>
                ) : (
                  <circle
                    r="4.5"
                    fill="#94a3b8"
                    stroke="#060b14"
                    strokeWidth="1.4"
                    opacity={viewMode === '2d' ? 0.9 : 0.72}
                  />
                )}
                {(isA || isB || viewMode === '2d') && (
                  <text
                    x="14"
                    y={isB && isA ? -10 : 4}
                    fill={isA ? '#fde68a' : isB ? '#bae6fd' : '#cbd5e1'}
                    fontSize={isA || isB ? '12' : '10.5'}
                    fontWeight={isA || isB ? '700' : '500'}
                  >
                    {site.name}
                  </text>
                )}
              </g>
            );
          })}

        {/* Mira central quando Modo = Centro */}
        {screen === 'explore' && selectionMode === 'center' && (
          <g aria-hidden="true">
            <circle
              cx={CX}
              cy={CY}
              r="22"
              fill="none"
              stroke="#7dd3fc"
              strokeWidth="2"
              strokeDasharray="6 4"
            />
            <line x1={CX - 32} y1={CY} x2={CX - 10} y2={CY} stroke="#7dd3fc" strokeWidth="2.2" />
            <line x1={CX + 10} y1={CY} x2={CX + 32} y2={CY} stroke="#7dd3fc" strokeWidth="2.2" />
            <line x1={CX} y1={CY - 32} x2={CX} y2={CY - 10} stroke="#7dd3fc" strokeWidth="2.2" />
            <line x1={CX} y1={CY + 10} x2={CX} y2={CY + 32} stroke="#7dd3fc" strokeWidth="2.2" />
            <circle cx={CX} cy={CY} r="3" fill="#ffffff" />
          </g>
        )}
      </svg>

      {/* Ação direta da mira no modo Centro + controles sutis de câmera/zoom acessíveis */}
      {screen === 'explore' && (
        <div className="stage-bottom-center-bar">
          {selectionMode === 'center' && (
            <div className="reticle-action-pill" role="region" aria-label="Ações da mira central">
              {centerAimCoords && centerNearestSite ? (
                <>
                  <span className="reticle-readout">
                    Mira: {formatCoordLatLon(centerAimCoords.latDeg, centerAimCoords.lonEastDeg)} →{' '}
                    <strong>{centerNearestSite.site.name}</strong>
                    {!centerNearestSite.isSouthPoleCovered && ' (fora de 80°S–90°S)'}
                  </span>
                  <div className="reticle-buttons">
                    <button
                      type="button"
                      className="btn-compact-amber"
                      onClick={() => commitPick(centerAimCoords, 'A')}
                    >
                      Fixar Local A
                    </button>
                    <button
                      type="button"
                      className="btn-compact-cyan"
                      onClick={() => commitPick(centerAimCoords, 'B')}
                    >
                      Fixar Local B
                    </button>
                  </div>
                </>
              ) : (
                <span className="reticle-readout">
                  Aponte a mira central sobre a superfície lunar para marcar A ou B.
                </span>
              )}
            </div>
          )}

          <div className="camera-utility-row" role="group" aria-label="Controle de visão da Lua">
            <button
              type="button"
              className="btn-utility"
              onClick={() =>
                viewMode === '3d'
                  ? setZoom3d((z) => Math.min(1.6, Number((z + 0.15).toFixed(2))))
                  : setZoom2d((z) => Math.min(2.0, Number((z + 0.2).toFixed(2))))
              }
              aria-label="Aproximar visualização da Lua"
            >
              + Zoom
            </button>
            <button
              type="button"
              className="btn-utility"
              onClick={() =>
                viewMode === '3d'
                  ? setZoom3d((z) => Math.max(0.75, Number((z - 0.15).toFixed(2))))
                  : setZoom2d((z) => Math.max(0.7, Number((z - 0.2).toFixed(2))))
              }
              aria-label="Afastar visualização da Lua"
            >
              - Zoom
            </button>
            <button
              type="button"
              className="btn-utility"
              onClick={recenterSouthPole}
            >
              Polo Sul
            </button>
          </div>
        </div>
      )}

      {coverageNotice && screen === 'explore' && (
        <div className="coverage-toast" role="status">
          <span>{coverageNotice}</span>
          <button
            type="button"
            className="btn-toast-close"
            onClick={() => setCoverageNotice(null)}
            aria-label="Fechar aviso de cobertura"
          >
            Fechar
          </button>
        </div>
      )}
    </div>
  );
};
