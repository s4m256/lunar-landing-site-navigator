import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EngineeringConfig } from '../navigator/types';
import {
  clamp,
  elevationToTopoRgb,
  loadRealNasaLunarAtlas,
  normalizeLon,
  sampleAtlasElevationKmBilinear,
  smoothstep,
  SurfaceMode,
} from './lunarTerrainEngine';
import { EvaluatedSlotEntry } from './state';

interface AstronautViewportProps {
  entries: EvaluatedSlotEntry[];
  activeSlotIdx: number;
  onSelectActiveSlot: (index: number) => void;
  surfaceMode: SurfaceMode;
  epochIdx: number;
  config: EngineeringConfig;
  chartsOpen?: boolean;
}

const DEG = Math.PI / 180;
const EYE_Y = 1.75;
const R_MAX = 320;
const R_CREST = 275;
const LUNAR_RADIUS_M = 1_737_400;

function detectSoftwareWebGL(): { supported: boolean; isSoftwareGl: boolean } {
  if (typeof document === 'undefined') return { supported: false, isSoftwareGl: true };
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return { supported: false, isSoftwareGl: true };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return {
      supported: true,
      isSoftwareGl: /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu),
    };
  } catch {
    return { supported: false, isSoftwareGl: true };
  }
}

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hash2(ix: number, iz: number, seed: number): number {
  let n = (ix * 374761393 + iz * 668265263 + seed * 1442695041) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = n ^ (n >>> 16);
  return (n >>> 0) / 4294967295;
}

function noise2(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return ((a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uz) * 2 - 1;
}

function fbm2(x: number, z: number, seed: number, octaves = 3): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * freq, z * freq, seed + i * 17);
    freq *= 2.08;
    amp *= 0.5;
  }
  return sum;
}

function sampleHorizonElev(horizonElevDeg: number[], azDeg: number): number {
  const n = horizonElevDeg.length || 360;
  const normAz = normalizeLon(azDeg);
  const exact = (normAz / 360) * n;
  const i0 = Math.floor(exact) % n;
  const i1 = (i0 + 1) % n;
  const frac = exact - Math.floor(exact);
  return horizonElevDeg[i0] * (1 - frac) + horizonElevDeg[i1] * frac;
}

function sampleSurfaceHeight(
  x: number,
  z: number,
  horizonElevDeg: number[],
  siteLatDeg: number,
  siteLonDeg: number,
  siteElevationM: number,
  slopeDeg: number,
  seed: number,
  realAtlas: Awaited<ReturnType<typeof loadRealNasaLunarAtlas>> | null,
): number {
  const r = Math.hypot(x, z);
  if (r < 0.01) return 0;

  const azDeg = normalizeLon(Math.atan2(x, -z) / DEG);
  const hDeg = sampleHorizonElev(horizonElevDeg, azDeg);

  // Foreground micro-regolith ripples & subtle local slope apron
  const nearFade = smoothstep(2.0, 12.0, r);
  const midNoise =
    fbm2(x * 0.08, z * 0.08, seed, 3) * 0.65 +
    fbm2(x * 0.3, z * 0.3, seed + 53, 2) * 0.16;

  const localTiltedApron =
    Math.sin(azDeg * DEG) * Math.min(r, 28) * Math.tan(clamp(slopeDeg, 0, 18) * DEG) * 0.25;

  // Regional LOLA DEM variation mapped outward along local North/East tangent plane
  let lolaRegionalOffset = 0;
  if (realAtlas && r > 18) {
    const northMeters = -z * 14.0;
    const eastMeters = x * 14.0;
    const dLat = (northMeters / LUNAR_RADIUS_M) / DEG;
    const cosLat = Math.max(0.08, Math.cos(siteLatDeg * DEG));
    const dLon = (eastMeters / (LUNAR_RADIUS_M * cosLat)) / DEG;
    const hCenterKm = sampleAtlasElevationKmBilinear(realAtlas, siteLatDeg, siteLonDeg);
    const hSampleKm = sampleAtlasElevationKmBilinear(
      realAtlas,
      clamp(siteLatDeg + dLat, -90, -79.5),
      normalizeLon(siteLonDeg + dLon),
    );
    lolaRegionalOffset = clamp((hSampleKm - hCenterKm) * 18.0, -14, 18) * smoothstep(18, 120, r) * (1 - smoothstep(190, 270, r));
  }

  const localY = (midNoise + localTiltedApron) * nearFade + lolaRegionalOffset;

  // Anchor skyline at R_CREST = 275m strictly to the exact LOLA 360° horizon elevation
  const yCrest = EYE_Y + Math.tan(clamp(hDeg, -14, 32) * DEG) * R_CREST;
  const crestWeight = smoothstep(24, R_CREST, r);
  const outerSkirt = r > R_CREST ? -((r - R_CREST) * 0.06) : 0;

  const ridgeDetail =
    smoothstep(35, 160, r) *
    (1 - smoothstep(260, R_MAX, r)) *
    fbm2(x * 0.025, z * 0.025, seed + 91, 3) *
    3.0;

  const craterBowl = siteElevationM < -1500 ? smoothstep(10, 140, r) * 1.4 : 0;

  return localY * (1 - crestWeight * 0.65) + yCrest * crestWeight + ridgeDetail + craterBowl + outerSkirt;
}

function azElToVec3(azDeg: number, elDeg: number, radius: number, out: THREE.Vector3): THREE.Vector3 {
  const az = azDeg * DEG;
  const el = elDeg * DEG;
  const cosEl = Math.cos(el);
  out.set(
    radius * cosEl * Math.sin(az),
    EYE_Y + radius * Math.sin(el),
    -radius * cosEl * Math.cos(az),
  );
  return out;
}

function buildRegolithTextures(): {
  albedoTex: THREE.CanvasTexture;
  bumpTex: THREE.CanvasTexture;
} {
  const size = 256;
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const aCtx = albedoCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d');

  if (aCtx && bCtx) {
    const aImg = aCtx.createImageData(size, size);
    const bImg = bCtx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const n1 = noise2(x * 0.09, y * 0.09, 101);
        const n2 = noise2(x * 0.34, y * 0.34, 211);
        const grit = (hash2(x, y, 73) - 0.5) * 28;
        const microPit = Math.hypot((x % 64) - 24, (y % 64) - 28) < 9 ? -18 : 0;
        const lum = clamp(Math.round(134 + n1 * 18 + n2 * 11 + grit + microPit * 0.5), 40, 225);
        aImg.data[idx] = lum;
        aImg.data[idx + 1] = lum;
        aImg.data[idx + 2] = lum + 1;
        aImg.data[idx + 3] = 255;

        const bumpVal = clamp(Math.round(128 + n1 * 34 + n2 * 24 + grit * 1.4 + microPit), 0, 255);
        bImg.data[idx] = bumpVal;
        bImg.data[idx + 1] = bumpVal;
        bImg.data[idx + 2] = bumpVal;
        bImg.data[idx + 3] = 255;
      }
    }
    aCtx.putImageData(aImg, 0, 0);
    bCtx.putImageData(bImg, 0, 0);
  }

  const albedoTex = new THREE.CanvasTexture(albedoCanvas);
  albedoTex.wrapS = THREE.RepeatWrapping;
  albedoTex.wrapT = THREE.RepeatWrapping;
  albedoTex.repeat.set(22, 22);
  albedoTex.colorSpace = THREE.SRGBColorSpace;
  albedoTex.needsUpdate = true;

  const bumpTex = new THREE.CanvasTexture(bumpCanvas);
  bumpTex.wrapS = THREE.RepeatWrapping;
  bumpTex.wrapT = THREE.RepeatWrapping;
  bumpTex.repeat.set(22, 22);
  bumpTex.colorSpace = THREE.NoColorSpace;
  bumpTex.needsUpdate = true;

  return { albedoTex, bumpTex };
}

function buildEarthTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const lat = (y / (h - 1)) * 2 - 1;
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const cont = fbm2(x * 0.045, y * 0.055, 881, 3);
        const cloud = fbm2(x * 0.07 + 12, y * 0.08 - 4, 419, 3);
        const ice = Math.abs(lat) > 0.78;

        let r = 24;
        let g = 88;
        let b = 178;
        if (ice) {
          r = 228;
          g = 238;
          b = 248;
        } else if (cont > 0.14) {
          r = 76;
          g = 122;
          b = 74;
        }
        if (cloud > 0.12) {
          const cw = clamp((cloud - 0.12) * 1.9, 0, 0.88);
          r = Math.round(r * (1 - cw) + 244 * cw);
          g = Math.round(g * (1 - cw) + 248 * cw);
          b = Math.round(b * (1 - cw) + 255 * cw);
        }
        img.data[idx] = r;
        img.data[idx + 1] = g;
        img.data[idx + 2] = b;
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function buildSkyStarfield(): THREE.Points {
  const count = 820;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  let s = 48271;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  for (let i = 0; i < count; i++) {
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(clamp(rand() * 1.12 - 0.08, -1, 1));
    const r = 420;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = EYE_Y + r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

    const b = 0.35 + Math.pow(rand(), 2.2) * 0.65;
    colors[i * 3] = b;
    colors[i * 3 + 1] = b;
    colors[i * 3 + 2] = b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 1.4,
    vertexColors: true,
    transparent: true,
    opacity: 0.84,
    sizeAttenuation: false,
    depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

function buildLunarHorizonTerrainGeometry(
  horizonElevDeg: number[],
  siteLatDeg: number,
  siteLonDeg: number,
  siteElevationM: number,
  slopeDeg: number,
  isPsr: boolean,
  seed: number,
  surfaceMode: SurfaceMode,
  realAtlas: Awaited<ReturnType<typeof loadRealNasaLunarAtlas>> | null,
): THREE.BufferGeometry {
  const rings = 44;
  const sectors = 180;
  const vertCount = 1 + rings * sectors;
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const colors = new Float32Array(vertCount * 3);

  const setColorAt = (vi: number, y: number, r: number) => {
    if (surfaceMode === 'topography') {
      const approxElevKm = clamp(siteElevationM / 1000 + y * 0.22, -9, 8.5);
      const [tr, tg, tb] = elevationToTopoRgb(approxElevKm);
      colors[vi * 3] = tr / 255;
      colors[vi * 3 + 1] = tg / 255;
      colors[vi * 3 + 2] = tb / 255;
    } else {
      const baseLum = isPsr ? 0.54 : 0.78;
      const distShade = clamp(baseLum + (y > 4 ? 0.08 : -0.02) - (r / R_MAX) * 0.08, 0.42, 0.94);
      colors[vi * 3] = distShade;
      colors[vi * 3 + 1] = distShade;
      colors[vi * 3 + 2] = distShade;
    }
  };

  positions[0] = 0;
  positions[1] = 0;
  positions[2] = 0;
  uvs[0] = 0.5;
  uvs[1] = 0.5;
  setColorAt(0, 0, 0);

  let vi = 1;
  for (let ri = 1; ri <= rings; ri++) {
    const t = ri / rings;
    const r = R_MAX * Math.pow(t, 1.55);
    for (let si = 0; si < sectors; si++) {
      const az = (si / sectors) * Math.PI * 2;
      const x = r * Math.sin(az);
      const z = -r * Math.cos(az);
      const y = sampleSurfaceHeight(
        x,
        z,
        horizonElevDeg,
        siteLatDeg,
        siteLonDeg,
        siteElevationM,
        slopeDeg,
        seed,
        realAtlas,
      );
      positions[vi * 3] = x;
      positions[vi * 3 + 1] = y;
      positions[vi * 3 + 2] = z;
      uvs[vi * 2] = x * 0.06 + 0.5;
      uvs[vi * 2 + 1] = z * 0.06 + 0.5;
      setColorAt(vi, y, r);
      vi++;
    }
  }

  const indices: number[] = [];
  for (let si = 0; si < sectors; si++) {
    const nextSi = (si + 1) % sectors;
    indices.push(0, 1 + nextSi, 1 + si);
  }
  for (let ri = 1; ri < rings; ri++) {
    const row0 = 1 + (ri - 1) * sectors;
    const row1 = 1 + ri * sectors;
    for (let si = 0; si < sectors; si++) {
      const nextSi = (si + 1) % sectors;
      const a = row0 + si;
      const b = row0 + nextSi;
      const c = row1 + si;
      const d = row1 + nextSi;
      indices.push(a, b, d);
      indices.push(a, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildBoulderGeometry(): THREE.BufferGeometry {
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = 0.84 + hash2(Math.round(x * 13), Math.round(z * 13), 55) * 0.34;
    pos.setXYZ(i, x * k, y * (0.72 + k * 0.16), z * k);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function cardinalShort(azDeg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(normalizeLon(azDeg) / 45) % 8;
  return dirs[idx];
}

function angularDeltaDeg(targetAz: number, currentYaw: number): number {
  let d = normalizeLon(targetAz) - normalizeLon(currentYaw);
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

export const AstronautViewport: React.FC<AstronautViewportProps> = ({
  entries,
  activeSlotIdx,
  onSelectActiveSlot,
  surfaceMode,
  epochIdx,
  config,
  chartsOpen = false,
}) => {
  const activeEntry = entries[activeSlotIdx] ?? entries[0];
  const { site, analysis, label } = activeEntry;
  const ep = analysis.epochStates[epochIdx];

  const mountRef = useRef<HTMLDivElement | null>(null);
  const yawTextRef = useRef<HTMLSpanElement | null>(null);
  const pitchTextRef = useRef<HTMLSpanElement | null>(null);
  const sunGuideRef = useRef<HTMLSpanElement | null>(null);
  const earthGuideRef = useRef<HTMLSpanElement | null>(null);

  const sunAz = site.sky_series.sun_az_deg[epochIdx] ?? 0;
  const sunEl = site.sky_series.sun_el_deg[epochIdx] ?? 0;
  const earthAz = site.sky_series.earth_az_deg[epochIdx] ?? 0;
  const earthEl = site.sky_series.earth_el_deg[epochIdx] ?? 0;
  const elfoAz = site.sky_series.elfo_primary_az_deg[epochIdx] ?? 0;
  const elfoEl = site.sky_series.elfo_primary_el_deg[epochIdx] ?? 0;

  const propsRef = useRef({
    activeEntry,
    surfaceMode,
    epochIdx,
    config,
    sunAz,
    sunEl,
    earthAz,
    earthEl,
    elfoAz,
    elfoEl,
  });
  propsRef.current = {
    activeEntry,
    surfaceMode,
    epochIdx,
    config,
    sunAz,
    sunEl,
    earthAz,
    earthEl,
    elfoAz,
    elfoEl,
  };

  const ctrlRef = useRef<{
    aimTo: (azDeg: number, elDeg: number) => void;
    nudgeLook: (dYawDeg: number, dPitchDeg: number) => void;
    rebuildTerrain: () => void;
    updateSkyAndLighting: () => void;
    requestRender: () => void;
  } | null>(null);

  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) return undefined;

    const { supported, isSoftwareGl } = detectSoftwareWebGL();
    if (!supported) return undefined;

    const initW = mountEl.clientWidth || window.innerWidth || 1280;
    const initH = mountEl.clientHeight || window.innerHeight || 720;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(initW, initH);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 1);

    mountEl.innerHTML = '';
    mountEl.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.0014);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.08;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(58, initW / Math.max(1, initH), 0.15, 650);
    camera.position.set(0, EYE_Y, 0);

    const { albedoTex, bumpTex } = buildRegolithTextures();
    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: albedoTex,
      bumpMap: bumpTex,
      bumpScale: 0.22,
      roughness: 0.94,
      metalness: 0.02,
      envMapIntensity: 0.08,
    });
    const terrainMesh = new THREE.Mesh(new THREE.BufferGeometry(), terrainMat);
    terrainMesh.receiveShadow = !isSoftwareGl;
    scene.add(terrainMesh);

    const BOULDER_COUNT = 64;
    const boulderGeo = buildBoulderGeometry();
    const boulderMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: albedoTex,
      bumpMap: bumpTex,
      bumpScale: 0.15,
      roughness: 0.9,
      metalness: 0.04,
      envMapIntensity: 0.1,
    });
    const boulderInst = new THREE.InstancedMesh(boulderGeo, boulderMat, BOULDER_COUNT);
    boulderInst.castShadow = !isSoftwareGl;
    boulderInst.receiveShadow = !isSoftwareGl;
    scene.add(boulderInst);

    const stars = buildSkyStarfield();
    scene.add(stars);

    const sunGroup = new THREE.Group();
    const sunCore = new THREE.Mesh(
      new THREE.SphereGeometry(5.2, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    );
    const sunHalo = new THREE.Mesh(
      new THREE.SphereGeometry(11.0, 24, 16),
      new THREE.MeshBasicMaterial({
        color: 0xe4e4e7,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    sunGroup.add(sunCore);
    sunGroup.add(sunHalo);
    scene.add(sunGroup);

    const earthTex = buildEarthTexture();
    const earthMat = new THREE.MeshStandardMaterial({
      map: earthTex,
      roughness: 0.65,
      metalness: 0.02,
      emissive: new THREE.Color(0x133863),
      emissiveIntensity: 0.45,
    });
    const earthMesh = new THREE.Mesh(new THREE.SphereGeometry(10.5, 24, 18), earthMat);
    scene.add(earthMesh);

    const elfoMat = new THREE.MeshBasicMaterial({ color: 0xd4d4d8 });
    const elfoMesh = new THREE.Mesh(new THREE.OctahedronGeometry(3.0, 0), elfoMat);
    scene.add(elfoMesh);

    const hemiLight = new THREE.HemisphereLight(0xd4d4d8, 0x18181b, 0.24);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 3.3);
    sunLight.castShadow = !isSoftwareGl;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 20;
    sunLight.shadow.camera.far = 280;
    sunLight.shadow.camera.left = -68;
    sunLight.shadow.camera.right = 68;
    sunLight.shadow.camera.top = 68;
    sunLight.shadow.camera.bottom = -68;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.04;
    scene.add(sunLight);
    scene.add(sunLight.target);

    const initSunAz = propsRef.current.sunAz;
    let yawDeg = normalizeLon(initSunAz);
    let pitchDeg = clamp(Math.max(4, propsRef.current.sunEl * 0.8), -15, 58);
    let targetYawDeg = yawDeg;
    let targetPitchDeg = pitchDeg;
    let aimAnimActive = false;

    const dummy = new THREE.Object3D();
    const colorScratch = new THREE.Color();
    const lookTargetScratch = new THREE.Vector3();
    const sunVecScratch = new THREE.Vector3();
    const earthVecScratch = new THREE.Vector3();
    const elfoVecScratch = new THREE.Vector3();

    let realAtlasRef: Awaited<ReturnType<typeof loadRealNasaLunarAtlas>> | null = null;
    let disposed = false;

    const rebuildTerrain = () => {
      const { activeEntry: cur, surfaceMode: sm } = propsRef.current;
      const seed = hashString(`${cur.site.id}:${cur.slot.offsetXNorm.toFixed(1)}:${cur.slot.offsetYNorm.toFixed(1)}`);

      const nextGeo = buildLunarHorizonTerrainGeometry(
        cur.analysis.terrain.horizonElevDeg,
        cur.analysis.terrain.latitudeDeg,
        cur.analysis.terrain.longitudeEastDeg,
        cur.analysis.terrain.elevationM,
        cur.analysis.terrain.slopeDeg,
        cur.analysis.terrain.isPsr,
        seed,
        sm,
        realAtlasRef,
      );
      terrainMesh.geometry.dispose();
      terrainMesh.geometry = nextGeo;

      terrainMat.map = sm === 'topography' ? null : albedoTex;
      terrainMat.needsUpdate = true;

      for (let i = 0; i < BOULDER_COUNT; i++) {
        const u1 = hash2(i, 1, seed);
        const u2 = hash2(i, 2, seed + 7);
        const u3 = hash2(i, 3, seed + 13);
        const dist = 7.5 + Math.pow(u1, 1.35) * 92;
        const az = u2 * Math.PI * 2;
        const bx = dist * Math.sin(az);
        const bz = -dist * Math.cos(az);
        const by = sampleSurfaceHeight(
          bx,
          bz,
          cur.analysis.terrain.horizonElevDeg,
          cur.analysis.terrain.latitudeDeg,
          cur.analysis.terrain.longitudeEastDeg,
          cur.analysis.terrain.elevationM,
          cur.analysis.terrain.slopeDeg,
          seed,
          realAtlasRef,
        );
        const distFactor = smoothstep(7.5, 26.0, dist);
        const sx = (0.14 + Math.pow(u3, 2.2) * 0.42) + distFactor * (0.12 + Math.pow(u3, 2.0) * 0.72);
        const sy = sx * (0.58 + hash2(i, 4, seed) * 0.4);
        const sz = sx * (0.72 + hash2(i, 5, seed) * 0.44);

        dummy.position.set(bx, by + sy * 0.34, bz);
        dummy.rotation.set(u1 * 3.1, u2 * 6.2, u3 * 2.4);
        dummy.scale.set(sx, sy, sz);
        dummy.updateMatrix();
        boulderInst.setMatrixAt(i, dummy.matrix);

        if (sm === 'topography') {
          const elevKm = clamp(cur.analysis.terrain.elevationM / 1000 + by * 0.22, -9, 8.5);
          const [tr, tg, tb] = elevationToTopoRgb(elevKm);
          colorScratch.setRGB(tr / 255, tg / 255, tb / 255);
        } else {
          const rockLum = 0.54 + hash2(i, 6, seed) * 0.28;
          colorScratch.setRGB(rockLum, rockLum, rockLum);
        }
        boulderInst.setColorAt(i, colorScratch);
      }
      boulderInst.instanceMatrix.needsUpdate = true;
      if (boulderInst.instanceColor) boulderInst.instanceColor.needsUpdate = true;
      boulderInst.computeBoundingSphere();
    };

    const syncHudRefs = () => {
      if (yawTextRef.current) {
        yawTextRef.current.textContent = `${Math.round(normalizeLon(yawDeg))}° ${cardinalShort(yawDeg)}`;
      }
      if (pitchTextRef.current) {
        const sign = pitchDeg >= 0 ? '+' : '';
        pitchTextRef.current.textContent = `Pitch ${sign}${pitchDeg.toFixed(0)}°`;
      }
      const p = propsRef.current;
      if (sunGuideRef.current) {
        const ds = angularDeltaDeg(p.sunAz, yawDeg);
        const arrow = Math.abs(ds) < 12 ? '• ahead' : ds > 0 ? `${Math.round(ds)}° →` : `← ${Math.round(Math.abs(ds))}°`;
        sunGuideRef.current.textContent = `Sun ${arrow}`;
      }
      if (earthGuideRef.current) {
        const de = angularDeltaDeg(p.earthAz, yawDeg);
        const arrow = Math.abs(de) < 12 ? '• ahead' : de > 0 ? `${Math.round(de)}° →` : `← ${Math.round(Math.abs(de))}°`;
        earthGuideRef.current.textContent = `Earth ${arrow}`;
      }
    };

    const updateSkyAndLighting = () => {
      const p = propsRef.current;
      const curEp = p.activeEntry.analysis.epochStates[p.epochIdx];

      azElToVec3(p.sunAz, p.sunEl, 390, sunVecScratch);
      sunGroup.position.copy(sunVecScratch);

      azElToVec3(p.earthAz, p.earthEl, 355, earthVecScratch);
      earthMesh.position.copy(earthVecScratch);
      earthMesh.lookAt(0, EYE_Y, 0);

      azElToVec3(p.elfoAz, p.elfoEl, 335, elfoVecScratch);
      elfoMesh.position.copy(elfoVecScratch);
      elfoMesh.visible = p.config.relayEnabled && p.elfoEl > -6;

      azElToVec3(p.sunAz, Math.max(p.sunEl, 3.5), 140, sunLight.position);
      sunLight.target.position.set(0, 0, 0);
      sunLight.target.updateMatrixWorld();

      if (p.surfaceMode === 'topography') {
        sunLight.intensity = 1.65;
        hemiLight.intensity = 1.05;
        scene.environmentIntensity = 0.22;
      } else {
        const vis = clamp(curEp.fIllum, 0, 1);
        sunLight.intensity = 0.14 + vis * 3.45;
        hemiLight.intensity = vis > 0.05 ? 0.26 : 0.44;
        scene.environmentIntensity = vis > 0.05 ? 0.08 : 0.14;
      }
    };

    rebuildTerrain();
    updateSkyAndLighting();

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let lastTime = performance.now();

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 40);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 55);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const requestRender = () => {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        const now = performance.now();
        const dt = Math.min(0.08, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;

        if (aimAnimActive) {
          const deltaYaw = angularDeltaDeg(targetYawDeg, yawDeg);
          const deltaPitch = targetPitchDeg - pitchDeg;
          yawDeg = normalizeLon(yawDeg + deltaYaw * (1 - Math.exp(-8 * dt)));
          pitchDeg = clamp(pitchDeg + deltaPitch * (1 - Math.exp(-8 * dt)), -22, 68);
          if (Math.abs(deltaYaw) < 0.25 && Math.abs(deltaPitch) < 0.25) {
            yawDeg = normalizeLon(targetYawDeg);
            pitchDeg = clamp(targetPitchDeg, -22, 68);
            aimAnimActive = false;
          } else {
            renderDirty = true;
          }
        }

        const yawRad = yawDeg * DEG;
        const pitchRad = pitchDeg * DEG;
        const cosP = Math.cos(pitchRad);
        lookTargetScratch.set(
          Math.sin(yawRad) * cosP * 10,
          EYE_Y + Math.sin(pitchRad) * 10,
          -Math.cos(yawRad) * cosP * 10,
        );
        camera.lookAt(lookTargetScratch);

        updateSkyAndLighting();
        syncHudRefs();
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (renderDirty && !disposed) requestRender();
        };
        if (isSoftwareGl) {
          afterDraw(done);
        } else {
          done();
        }
      });
    };

    loadRealNasaLunarAtlas()
      .then((atlas) => {
        if (disposed) return;
        realAtlasRef = atlas;
        rebuildTerrain();
        requestRender();
      })
      .catch(() => {
        // Ignore in headless JSDOM test environments without image decoding
      });

    let dragging = false;
    let lastPtrX = 0;
    let lastPtrY = 0;
    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      aimAnimActive = false;
      lastPtrX = e.clientX;
      lastPtrY = e.clientY;
      renderer.domElement.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastPtrX;
      const dy = e.clientY - lastPtrY;
      lastPtrX = e.clientX;
      lastPtrY = e.clientY;
      yawDeg = normalizeLon(yawDeg - dx * 0.24);
      pitchDeg = clamp(pitchDeg + dy * 0.2, -22, 68);
      requestRender();
    };
    const onPointerUp = (e: PointerEvent) => {
      dragging = false;
      renderer.domElement.releasePointerCapture?.(e.pointerId);
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);

    const onResize = () => {
      const w = mountEl.clientWidth || window.innerWidth || 1280;
      const h = mountEl.clientHeight || window.innerHeight || 720;
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    window.addEventListener('resize', onResize);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    ctrlRef.current = {
      rebuildTerrain,
      updateSkyAndLighting,
      requestRender,
      aimTo: (azDeg: number, elDeg: number) => {
        targetYawDeg = normalizeLon(azDeg);
        targetPitchDeg = clamp(elDeg, -18, 66);
        if (isSoftwareGl) {
          yawDeg = targetYawDeg;
          pitchDeg = targetPitchDeg;
          aimAnimActive = false;
        } else {
          aimAnimActive = true;
        }
        requestRender();
      },
      nudgeLook: (dYawDeg: number, dPitchDeg: number) => {
        aimAnimActive = false;
        yawDeg = normalizeLon(yawDeg + dYawDeg);
        pitchDeg = clamp(pitchDeg + dPitchDeg, -22, 68);
        requestRender();
      },
    };

    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      terrainMesh.geometry.dispose();
      terrainMat.dispose();
      albedoTex.dispose();
      bumpTex.dispose();
      boulderGeo.dispose();
      boulderMat.dispose();
      stars.geometry.dispose();
      (stars.material as THREE.Material).dispose();
      sunCore.geometry.dispose();
      (sunCore.material as THREE.Material).dispose();
      sunHalo.geometry.dispose();
      (sunHalo.material as THREE.Material).dispose();
      earthMesh.geometry.dispose();
      earthMat.dispose();
      earthTex.dispose();
      elfoMesh.geometry.dispose();
      elfoMat.dispose();
      envTarget.dispose();
      renderer.dispose();
      ctrlRef.current = null;
    };
  }, []);

  useEffect(() => {
    ctrlRef.current?.rebuildTerrain();
    ctrlRef.current?.requestRender();
  }, [
    site.id,
    activeEntry.slot.offsetXNorm,
    activeEntry.slot.offsetYNorm,
    surfaceMode,
  ]);

  useEffect(() => {
    ctrlRef.current?.updateSkyAndLighting();
    ctrlRef.current?.requestRender();
  }, [epochIdx, config.relayEnabled, site.id, surfaceMode]);

  const horizonAtSun = ep.horizonAtSunDeg;
  const horizonAtEarth = ep.horizonAtEarthDeg;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 14 : 6;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      ctrlRef.current?.nudgeLook(-step, 0);
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      ctrlRef.current?.nudgeLook(step, 0);
    } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      ctrlRef.current?.nudgeLook(0, step * 0.7);
    } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      e.preventDefault();
      ctrlRef.current?.nudgeLook(0, -step * 0.7);
    }
  };

  const lookPreset = useMemo(
    () => ({
      sunElSafe: Math.max(sunEl, horizonAtSun - 2, 2),
      earthElSafe: Math.max(earthEl, horizonAtEarth - 2, 4),
    }),
    [sunEl, horizonAtSun, earthEl, horizonAtEarth],
  );

  return (
    <div
      className="astronaut-stage"
      data-testid="astronaut-stage"
      data-site-id={site.id}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="region"
      aria-label={`First-person astronaut view at ${site.name}. Drag or use arrow keys / WASD to look around 360 degrees.`}
    >
      <div
        ref={mountRef}
        data-testid="astronaut-webgl-canvas"
        className="astronaut-webgl-mount cursor-grab"
      />

      <div
        className={`astro-hud-banner ${surfaceMode === 'topography' ? 'with-topo-legend' : ''}`}
        aria-label="Local sky compass and quick look controls"
      >
        <div className="astro-compass-row">
          <span className="astro-site-pill">
            {activeEntry.meta.glyph} Site {label} · {site.name}
          </span>
          <span className="astro-az-readout" ref={yawTextRef}>
            {Math.round(normalizeLon(sunAz))}° {cardinalShort(sunAz)}
          </span>
          <span className="astro-pitch-readout" ref={pitchTextRef}>
            Pitch +{Math.round(clamp(Math.max(4, sunEl * 0.8), -15, 58))}°
          </span>
          <span className="astro-sky-guide" ref={sunGuideRef}>
            Sun
          </span>
          <span className="astro-sky-guide" ref={earthGuideRef}>
            Earth
          </span>
        </div>

        <div className="astro-aim-row">
          <button
            type="button"
            className="astro-aim-btn"
            onClick={() => ctrlRef.current?.aimTo(sunAz, lookPreset.sunElSafe)}
          >
            Look Sun ({sunEl.toFixed(1)}°)
          </button>
          <button
            type="button"
            className="astro-aim-btn"
            onClick={() => ctrlRef.current?.aimTo(earthAz, lookPreset.earthElSafe)}
          >
            Look Earth ({earthEl.toFixed(1)}°)
          </button>
          <button
            type="button"
            className="astro-aim-btn"
            onClick={() => ctrlRef.current?.aimTo(normalizeLon(sunAz + 180), 4)}
          >
            Opposite
          </button>
          {entries.length > 1 && (
            <div className="astro-site-tabs" role="group" aria-label="Switch astronaut surface site">
              {entries.map((item, idx) => (
                <button
                  key={`${item.label}-${item.site.id}`}
                  type="button"
                  className={`astro-site-tab ${idx === activeSlotIdx ? 'active' : ''}`}
                  aria-pressed={idx === activeSlotIdx}
                  onClick={() => onSelectActiveSlot(idx)}
                >
                  {item.meta.glyph} {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={`astro-surface-status ${chartsOpen ? 'shifted-right' : ''}`} aria-live="polite">
        <div>
          <strong>Solar:</strong>{' '}
          {ep.fIllum >= 0.99
            ? `Visible (${sunEl.toFixed(1)}° above ${horizonAtSun.toFixed(1)}° rim)`
            : ep.fIllum > 0.01
              ? `Partial ${(ep.fIllum * 100).toFixed(0)}%`
              : `Blocked by terrain (${sunEl.toFixed(1)}° vs ${horizonAtSun.toFixed(1)}° rim)`}
        </div>
        <div>
          <strong>Comms:</strong>{' '}
          {ep.dteVisible
            ? `Earth DTE visible (${earthEl.toFixed(1)}°)`
            : config.relayEnabled && ep.elfoConstellationVisible
              ? 'Earth blocked · ELFO relay active'
              : 'Blackout (no DTE or relay)'}
        </div>
        <div className="astro-status-sub">
          Elev {analysis.terrain.elevationM.toFixed(0)} m · Slope {analysis.terrain.slopeDeg.toFixed(1)}° · Drag to look 360°
        </div>
      </div>
    </div>
  );
};
