import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { MissionSite } from "../types";
import lunarMosaic from "./lroc_color_2k.jpg";
import polarDem from "./ldem_south_pole_1k.png";
import { POLAR_STEREO_SPAN, shadePolarDem } from "./polar-relief";
import "./globe.css";

interface Props {
  sites: MissionSite[];
  selectedSiteId?: string;
  visitedSiteIds: string[];
  onSelect: (id: string) => void;
  onDiscover: () => void;
  discovered: boolean;
}

type Pin = { id: string; x: number; y: number; visible: boolean };

// Coordinate convention from 343d31f lunarTerrainEngine.ts:85–96.
export function lunarUnitVector(latitudeDeg: number, longitudeDeg: number) {
  const lat = THREE.MathUtils.degToRad(latitudeDeg);
  const lon = THREE.MathUtils.degToRad(longitudeDeg);
  return new THREE.Vector3(
    -Math.cos(lat) * Math.cos(lon),
    Math.sin(lat),
    Math.cos(lat) * Math.sin(lon),
  );
}

export function MissionGlobe({
  sites,
  selectedSiteId,
  visitedSiteIds,
  onSelect,
  onDiscover,
  discovered,
}: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const reset = useRef<(() => void) | null>(null);
  const wholeMoon = useRef<(() => void) | null>(null);
  const sitesRef = useRef(sites);
  sitesRef.current = sites;
  const [pins, setPins] = useState<Pin[]>([]);
  const [available, setAvailable] = useState(true);
  const [ready, setReady] = useState(false);
  const [overview, setOverview] = useState(false);
  const crowded = pins.some(
    (pin, index) =>
      pin.visible &&
      pins
        .slice(index + 1)
        .some(
          (other) =>
            other.visible &&
            Math.abs(pin.x - other.x) < 44 &&
            Math.abs(pin.y - other.y) < 44,
        ),
  );

  useEffect(() => {
    const container = mount.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setAvailable(false);
      return;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x090d13);
    container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-hidden", "true");
    const onContextLost = (event: Event) => {
      event.preventDefault();
      setAvailable(false);
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
    camera.up.set(0, 0, -1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 1.35;
    controls.maxDistance = 5;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.85;
    const group = new THREE.Group();
    // The original viewport rotates its Moon by π around X, placing south at +Y.
    group.rotation.x = Math.PI;
    scene.add(group);
    const geometry = new THREE.SphereGeometry(1, 128, 64);
    let active = true;
    let mosaicLoaded = false;
    let polarLoaded = false;
    const updateReady = () => {
      if (active && mosaicLoaded && polarLoaded) setReady(true);
    };
    const texture = new THREE.TextureLoader().load(
      lunarMosaic,
      () => {
        mosaicLoaded = true;
        render();
        updateReady();
      },
      undefined,
      () => {
        if (active) setAvailable(false);
      },
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    // Three sphere longitude zero is at u=0; the original NASA atlas places it at u=0.5.
    texture.offset.x = 0.5;
    let polarTexture = new THREE.DataTexture(
      new Uint8Array([128, 128, 128, 255]),
      1,
      1,
      THREE.RGBAFormat,
    );
    polarTexture.colorSpace = THREE.SRGBColorSpace;
    polarTexture.needsUpdate = true;
    const polarMapUniform = { value: polarTexture };
    const polarUniform = { value: 0 };
    const material = new THREE.MeshBasicMaterial({ map: texture });
    // Adapted from the original viewport's southStereoUv / polar cap shader.
    material.onBeforeCompile = (shader) => {
      shader.uniforms.polarMap = polarMapUniform;
      shader.uniforms.polarReady = polarUniform;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 lunarDirection;",
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nlunarDirection = normalize(position);",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          varying vec3 lunarDirection;
          uniform sampler2D polarMap;
          uniform float polarReady;`,
        )
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
          vec3 p = normalize(lunarDirection);
          vec2 stereo = vec2(p.z, p.x) / max(0.05, 1.0 - p.y);
          vec2 polarUv = vec2(0.5) + stereo / ${POLAR_STEREO_SPAN.toFixed(10)};
          float polarWeight = (1.0 - smoothstep(0.078, 0.087, length(stereo))) * polarReady;
          polarWeight *= step(p.y, 0.0);
          vec3 relief = texture2D(polarMap, clamp(polarUv, 0.0, 1.0)).rgb;
          diffuseColor.rgb = mix(diffuseColor.rgb, relief, polarWeight);`,
        );
    };
    const polarImage = new Image();
    polarImage.onload = () => {
      if (!active) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = polarImage.naturalWidth;
        canvas.height = polarImage.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) {
          setAvailable(false);
          return;
        }
        context.drawImage(polarImage, 0, 0);
        const pixels = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        ).data;
        const shaded = new THREE.DataTexture(
          shadePolarDem(pixels, canvas.width, canvas.height),
          canvas.width,
          canvas.height,
          THREE.RGBAFormat,
        );
        shaded.colorSpace = THREE.SRGBColorSpace;
        shaded.needsUpdate = true;
        polarTexture.dispose();
        polarTexture = shaded;
        polarMapUniform.value = shaded;
        polarUniform.value = 1;
        polarLoaded = true;
        render();
        updateReady();
      } catch {
        setAvailable(false);
      }
    };
    polarImage.onerror = () => {
      if (active) setAvailable(false);
    };
    polarImage.src = polarDem;
    group.add(new THREE.Mesh(geometry, material));
    let width = 1;
    let height = 1;
    function render() {
      if (!active) return;
      group.updateMatrixWorld();
      camera.updateMatrixWorld();
      renderer.render(scene, camera);
      setPins(
        sitesRef.current.map((site) => {
          const point = lunarUnitVector(
            site.latitudeDeg,
            site.longitudeDeg,
          ).applyMatrix4(group.matrixWorld);
          const facing =
            point
              .clone()
              .normalize()
              .dot(camera.position.clone().sub(point).normalize()) > 0;
          point.project(camera);
          return {
            id: site.id,
            x: ((point.x + 1) * width) / 2,
            y: ((1 - point.y) * height) / 2,
            visible:
              facing &&
              point.z < 1 &&
              Math.abs(point.x) <= 1 &&
              Math.abs(point.y) <= 1,
          };
        }),
      );
    }
    function resize() {
      width = container!.clientWidth || 480;
      height = container!.clientHeight || 480;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      render();
    }
    reset.current = () => {
      camera.position.set(0, 1.45, 0.001);
      setOverview(false);
      controls.target.set(0, 0, 0);
      controls.update();
      render();
    };
    wholeMoon.current = () => {
      camera.position.set(-1.15, 3.5, 2);
      setOverview(true);
      controls.target.set(0, 0, 0);
      controls.update();
      render();
    };
    const onOrbitStart = () => setOverview(true);
    controls.addEventListener("start", onOrbitStart);
    controls.addEventListener("change", render);
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    reset.current();
    resize();
    return () => {
      active = false;
      reset.current = null;
      wholeMoon.current = null;
      observer.disconnect();
      controls.removeEventListener("change", render);
      controls.removeEventListener("start", onOrbitStart);
      renderer.domElement.removeEventListener(
        "webglcontextlost",
        onContextLost,
      );
      controls.dispose();
      geometry.dispose();
      material.dispose();
      texture.dispose();
      polarTexture.dispose();
      polarImage.onload = null;
      polarImage.onerror = null;
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      className="mission-globe"
      data-status={!available ? "unavailable" : ready ? "ready" : "loading"}
    >
      <div
        className="mission-globe-stage"
        ref={mount}
        role="group"
        aria-label="Lua: arraste para girar e use a roda do mouse para aproximar"
      >
        {available &&
          ready &&
          !crowded &&
          pins.map((pin) => {
            const site = sites.find((entry) => entry.id === pin.id);
            if (!site || !pin.visible) return null;
            return (
              <button
                key={pin.id}
                type="button"
                className="mission-globe-pin"
                style={{ left: pin.x, top: pin.y }}
                onClick={() => onSelect(pin.id)}
                aria-label={`${site.label}, ${site.latitudeDeg} graus de latitude, ${site.longitudeDeg} graus leste`}
                aria-pressed={selectedSiteId === pin.id}
              >
                <span>{site.label.replace("Local ", "")}</span>
              </button>
            );
          })}
        {!available && (
          <p className="mission-globe-unavailable" role="status">
            A visualização da Lua está indisponível neste navegador. Você pode
            escolher pelas coordenadas na lista.
          </p>
        )}
        {available && !ready && (
          <p className="mission-globe-loading" role="status">
            Carregando a superfície lunar…
          </p>
        )}
      </div>
      {available && ready && crowded && (
        <p className="mission-globe-hint">
          Aproxime o polo sul para escolher um ponto.
        </p>
      )}
      <div className="mission-globe-controls">
        {available && (
          <button
            type="button"
            onClick={() =>
              overview ? reset.current?.() : wholeMoon.current?.()
            }
          >
            {overview ? "Polo sul" : "Ver Lua inteira"}
          </button>
        )}
        <details className="mission-globe-list" open={!available || undefined}>
          <summary>Lista de locais</summary>
          <div className="mission-globe-list-items">
            {sites.map((site) => (
              <button
                type="button"
                key={site.id}
                onClick={() => onSelect(site.id)}
                aria-pressed={selectedSiteId === site.id}
              >
                {site.label} · {site.latitudeDeg}°, {site.longitudeDeg}° L
                {visitedSiteIds.includes(site.id) ? " ✓" : ""}
              </button>
            ))}
          </div>
        </details>
        <button
          className="mission-globe-bonus"
          type="button"
          onClick={onDiscover}
          aria-label={
            discovered
              ? "Reabrir bônus educativo"
              : "Sinal desconhecido, bônus educativo"
          }
        >
          ?
        </button>
      </div>
      <p className="mission-globe-credit">
        LROC / LOLA · Locais hipotéticos. Sombreamento apenas para mostrar o
        relevo.
      </p>
    </div>
  );
}
