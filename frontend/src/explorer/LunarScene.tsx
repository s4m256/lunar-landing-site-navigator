import { useEffect, useId, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Sample } from "../scientific-data";
import {
  directionFromAngles,
  hasUsableDirection,
  panoramaPosition,
  terrainPositions,
} from "./scene-geometry";
import { loadTerrainContext } from "./terrain-data";

export type TerrainStatus = "loading" | "ready" | "unavailable";

export interface LunarSceneProps {
  sun?: Sample;
  earth?: Sample;
  resetToken: number;
  onTerrainStatus?: (status: TerrainStatus) => void;
}

type SceneApi = {
  reset: () => void;
  updateTargets: (sun: Sample | undefined, earth: Sample | undefined) => void;
};

const SUN_COLOR = "#f0cd83";
const EARTH_COLOR = "#8ad7e8";
const INITIAL_POSITION = new THREE.Vector3(14, 9, 19);
const INITIAL_TARGET = new THREE.Vector3(0, 1, 0);
const RAY_LENGTH = 16;

function disposeObjects(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  object.traverse((item) => {
    const mesh = item as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) {
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]) {
        materials.add(material);
      }
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

/** A symbolic observer, not a measured instrument or astronaut height. */
function createObserver() {
  const observer = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({
    color: "#dde1de",
    roughness: 0.88,
  });
  const seam = new THREE.MeshStandardMaterial({
    color: "#627078",
    roughness: 0.9,
  });
  const visor = new THREE.MeshStandardMaterial({
    color: "#a88c54",
    roughness: 0.28,
    metalness: 0.6,
  });
  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    observer.add(mesh);
    return mesh;
  };
  const torso = add(new THREE.SphereGeometry(0.48, 16, 12), suit, 0, 1.12, 0);
  torso.scale.set(0.88, 1.25, 0.65);
  add(new THREE.BoxGeometry(0.55, 0.7, 0.26), seam, 0, 1.18, -0.33);
  add(new THREE.SphereGeometry(0.41, 20, 16), suit, 0, 1.91, 0);
  const glass = add(
    new THREE.SphereGeometry(0.32, 20, 16),
    visor,
    0,
    1.94,
    0.22,
  );
  glass.scale.set(1, 0.78, 0.5);
  for (const side of [-1, 1]) {
    const arm = add(
      new THREE.CapsuleGeometry(0.13, 0.45, 4, 10),
      suit,
      side * 0.5,
      1.12,
      0.03,
    );
    arm.rotation.z = side * 0.18;
    add(new THREE.SphereGeometry(0.13, 12, 8), seam, side * 0.55, 0.77, 0.03);
    add(
      new THREE.CapsuleGeometry(0.16, 0.46, 4, 10),
      suit,
      side * 0.21,
      0.47,
      0,
    );
    add(new THREE.BoxGeometry(0.32, 0.2, 0.48), seam, side * 0.21, 0.1, 0.09);
  }
  return observer;
}

function FallbackPanorama({
  sun,
  earth,
}: Pick<LunarSceneProps, "sun" | "earth">) {
  const entries = [
    { name: "Sol", sample: sun, color: SUN_COLOR },
    { name: "Terra", sample: earth, color: EARTH_COLOR },
  ];
  return (
    <div
      className="scene-fallback"
      style={{
        width: "100%",
        height: "100%",
        display: "grid",
        alignContent: "center",
      }}
    >
      <svg
        viewBox="0 0 960 480"
        role="img"
        aria-label="Panorama alternativo: azimute e elevação em relação ao horizonte idealizado de zero graus"
        style={{ width: "100%", maxHeight: "100%" }}
      >
        <path d="M60 240H900V410H60Z" fill="#182127" />
        {[0, 90, 180, 270, 360].map((azimuth, i) => (
          <g key={azimuth}>
            <line
              x1={60 + i * 210}
              x2={60 + i * 210}
              y1="80"
              y2="410"
              stroke="#354249"
              strokeDasharray="3 8"
            />
            <text
              x={60 + i * 210}
              y="440"
              fill="#bec9cd"
              textAnchor="middle"
              fontSize="16"
            >
              {["N · 0°", "L · 90°", "S · 180°", "O · 270°", "N · 360°"][i]}
            </text>
          </g>
        ))}
        <line x1="60" x2="900" y1="240" y2="240" stroke="#8a9ba3" />
        <text x="60" y="224" fill="#bec9cd" fontSize="16">
          Horizonte idealizado · 0°
        </text>
        {entries.map(({ name, sample, color }) => {
          if (!hasUsableDirection(sample)) return null;
          const { x, y } = panoramaPosition(sample);
          return (
            <g key={name}>
              <circle cx={x} cy={y} r="7" fill={color} />
              <text
                x={Math.max(100, Math.min(860, x))}
                y={y + (name === "Sol" ? -28 : 34)}
                fill={color}
                textAnchor="middle"
                fontSize="18"
              >
                {name} · {sample.elevation_deg.toFixed(2)}°
              </text>
            </g>
          );
        })}
      </svg>
      <p
        style={{
          textAlign: "center",
          color: "#bec9cd",
          fontSize: "0.85rem",
          padding: "0 1rem",
        }}
      >
        Vista 2D disponível. A visualização 3D não está disponível neste
        navegador.
      </p>
    </div>
  );
}

export default function LunarScene({
  sun,
  earth,
  resetToken,
  onTerrainStatus,
}: LunarSceneProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const sunLabelRef = useRef<HTMLDivElement>(null);
  const earthLabelRef = useRef<HTMLDivElement>(null);
  const compassRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<SceneApi | null>(null);
  const latestSamples = useRef({ sun, earth });
  latestSamples.current = { sun, earth };
  const [fallback, setFallback] = useState(false);
  const [terrainStatus, setTerrainStatus] = useState<TerrainStatus>("loading");
  const onTerrainStatusRef = useRef(onTerrainStatus);
  onTerrainStatusRef.current = onTerrainStatus;
  const helpId = useId();

  useEffect(() => {
    const viewport = viewportRef.current;
    const host = canvasHostRef.current;
    if (!viewport || !host) return;
    function reportTerrainStatus(status: TerrainStatus) {
      setTerrainStatus(status);
      onTerrainStatusRef.current?.(status);
    }
    // Avoid invoking an unimplemented canvas context in non-graphical environments.
    if (
      typeof window.WebGLRenderingContext === "undefined" &&
      typeof window.WebGL2RenderingContext === "undefined"
    ) {
      setFallback(true);
      reportTerrainStatus("unavailable");
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFallback(true);
      reportTerrainStatus("unavailable");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor("#080e13", 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog("#080e13", 38, 110);
    const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 500);
    camera.position.copy(INITIAL_POSITION);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(INITIAL_TARGET);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.minDistance = 8;
    controls.maxDistance = 46;
    controls.minPolarAngle = 0.14;
    controls.maxPolarAngle = Math.PI / 2 - 0.025;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.7;
    controls.update();

    // Studio lighting makes the symbolic scene readable; it is not solar illumination.
    scene.add(new THREE.HemisphereLight("#e1e9ed", "#1c2327", 2.25));
    const keyLight = new THREE.DirectionalLight("#ffffff", 2.5);
    keyLight.position.set(-16, 22, 12);
    scene.add(keyLight);
    const groundLayer = new THREE.Group();
    scene.add(groundLayer);
    const ground = new THREE.Mesh(
      new THREE.SphereGeometry(180, 96, 64),
      new THREE.MeshStandardMaterial({ color: "#41494c", roughness: 1 }),
    );
    ground.position.y = -180;
    groundLayer.add(ground);

    // Tangent reference rings are visual angle/orientation guides, not measured terrain.
    for (const radius of [3, 6, 10, 16]) {
      const points = Array.from({ length: 129 }, (_, i) => {
        const angle = (i / 128) * Math.PI * 2;
        const y = Math.sqrt(180 * 180 - radius * radius) - 180 + 0.015;
        return new THREE.Vector3(
          Math.cos(angle) * radius,
          y,
          Math.sin(angle) * radius,
        );
      });
      const ring = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({
          color: "#b5c3c8",
          transparent: true,
          opacity: radius === 3 ? 0.28 : 0.12,
        }),
      );
      groundLayer.add(ring);
    }
    const originMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.68, 0.73, 48),
      new THREE.MeshBasicMaterial({
        color: "#c9d9d7",
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
      }),
    );
    originMarker.rotation.x = -Math.PI / 2;
    originMarker.position.y = 0.025;
    scene.add(originMarker);
    scene.add(createObserver());

    const targets = new THREE.Group();
    scene.add(targets);
    const labels = [sunLabelRef.current, earthLabelRef.current];
    const endpoints: (THREE.Vector3 | null)[] = [null, null];
    const projected = new THREE.Vector3();
    const northPoint = new THREE.Vector3(0, 0.1, -6);
    let disposed = false;
    const terrainRequest = new AbortController();

    function placeLabel(
      element: HTMLElement | null,
      position: THREE.Vector3 | null,
    ) {
      if (!element) return;
      if (!position || disposed) {
        element.hidden = true;
        return;
      }
      projected.copy(position).project(camera);
      if (projected.z > 1 || projected.z < -1) {
        element.hidden = true;
        return;
      }
      const width = host!.clientWidth;
      const height = host!.clientHeight;
      const x = ((projected.x + 1) / 2) * width;
      const y = ((1 - projected.y) / 2) * height;
      const outside = x < 70 || x > width - 70 || y < 60 || y > height - 60;
      // A narrow viewport must not stack clipped celestial labels on the same edge.
      // Their exact values remain in the adjacent accessible readouts.
      const targetLabel =
        element === sunLabelRef.current || element === earthLabelRef.current;
      if (width < 620 && outside && targetLabel) {
        element.hidden = true;
        return;
      }
      element.hidden = false;
      element.dataset.outside = String(outside);
      element.style.left = `${Math.max(70, Math.min(width - 70, x))}px`;
      element.style.top = `${Math.max(60, Math.min(height - 60, y))}px`;
    }

    function render() {
      if (disposed) return;
      renderer.render(scene, camera);
      labels.forEach((label, i) => placeLabel(label, endpoints[i]));
      const [sunLabel, earthLabel] = labels;
      if (sunLabel && earthLabel && !sunLabel.hidden && !earthLabel.hidden) {
        const sunBox = sunLabel.getBoundingClientRect();
        const earthBox = earthLabel.getBoundingClientRect();
        if (
          sunBox.left < earthBox.right + 8 &&
          sunBox.right > earthBox.left - 8 &&
          sunBox.top < earthBox.bottom + 8 &&
          sunBox.bottom > earthBox.top - 8
        ) {
          const top = Number.parseFloat(sunLabel.style.top);
          earthLabel.style.top = `${top + 50 < host!.clientHeight - 60 ? top + 50 : top - 50}px`;
        }
      }
      placeLabel(compassRef.current, northPoint);
    }

    function updateTargets(
      nextSun: Sample | undefined,
      nextEarth: Sample | undefined,
    ) {
      disposeObjects(targets);
      targets.clear();
      [nextSun, nextEarth].forEach((sample, i) => {
        endpoints[i] = null;
        if (!hasUsableDirection(sample)) return;
        const direction = new THREE.Vector3(
          ...directionFromAngles(sample.azimuth_deg, sample.elevation_deg),
        );
        const endpoint = direction.multiplyScalar(RAY_LENGTH);
        const color = i === 0 ? SUN_COLOR : EARTH_COLOR;
        const below = sample.elevation_deg < 0;
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            endpoint,
          ]),
          below
            ? new THREE.LineDashedMaterial({
                color,
                dashSize: 0.26,
                gapSize: 0.2,
                transparent: true,
                opacity: 0.7,
                depthTest: false,
              })
            : new THREE.LineBasicMaterial({
                color,
                transparent: true,
                opacity: 0.9,
                depthTest: false,
              }),
        );
        if (below) line.computeLineDistances();
        // Contextual DEM uses a different frame. Its visual occlusion is not a visibility result.
        line.renderOrder = 2;
        targets.add(line);
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(i === 0 ? 0.24 : 0.2, 16, 12),
          new THREE.MeshBasicMaterial({
            color,
            depthTest: false,
            transparent: below,
            opacity: below ? 0.7 : 1,
          }),
        );
        marker.position.copy(endpoint);
        marker.renderOrder = 2;
        targets.add(marker);
        endpoints[i] = endpoint;
      });
      render();
    }

    function reset() {
      camera.position.copy(INITIAL_POSITION);
      controls.target.copy(INITIAL_TARGET);
      controls.update();
      render();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (
        event.target !== viewport ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      const keys = [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "+",
        "=",
        "-",
        "_",
        "Home",
      ];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Home") {
        reset();
        return;
      }
      const spherical = new THREE.Spherical().setFromVector3(
        camera.position.clone().sub(controls.target),
      );
      if (event.key === "ArrowLeft") spherical.theta -= 0.1;
      if (event.key === "ArrowRight") spherical.theta += 0.1;
      if (event.key === "ArrowUp") spherical.phi -= 0.08;
      if (event.key === "ArrowDown") spherical.phi += 0.08;
      if (event.key === "+" || event.key === "=") spherical.radius *= 0.9;
      if (event.key === "-" || event.key === "_") spherical.radius *= 1.1;
      spherical.phi = THREE.MathUtils.clamp(
        spherical.phi,
        controls.minPolarAngle,
        controls.maxPolarAngle,
      );
      spherical.radius = THREE.MathUtils.clamp(
        spherical.radius,
        controls.minDistance,
        controls.maxDistance,
      );
      camera.position.setFromSpherical(spherical).add(controls.target);
      controls.update();
      render();
    }

    function resize() {
      const width = Math.max(1, host!.clientWidth);
      const height = Math.max(1, host!.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      render();
    }

    controls.addEventListener("change", render);
    viewport.addEventListener("keydown", onKeyDown);
    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(host);
    window.addEventListener("resize", resize);

    function cleanup() {
      if (disposed) return;
      disposed = true;
      apiRef.current = null;
      terrainRequest.abort();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", resize);
      viewport!.removeEventListener("keydown", onKeyDown);
      renderer.domElement.removeEventListener(
        "webglcontextlost",
        onContextLost,
      );
      controls.removeEventListener("change", render);
      controls.dispose();
      disposeObjects(scene);
      renderer.dispose();
      renderer.domElement.remove();
    }

    function onContextLost(event: Event) {
      event.preventDefault();
      cleanup();
      setFallback(true);
      reportTerrainStatus("unavailable");
    }
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    apiRef.current = { reset, updateTargets };
    resize();
    updateTargets(latestSamples.current.sun, latestSamples.current.earth);
    reportTerrainStatus("loading");
    loadTerrainContext(terrainRequest.signal)
      .then((terrain) => {
        if (disposed) return;
        const positions = terrainPositions(
          terrain.size,
          terrain.extentM,
          terrain.heightsM,
        );
        const geometry = new THREE.PlaneGeometry(
          80,
          80,
          terrain.size - 1,
          terrain.size - 1,
        );
        geometry.setAttribute(
          "position",
          new THREE.BufferAttribute(positions, 3),
        );
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({
            color: "#606567",
            roughness: 1,
            side: THREE.FrontSide,
          }),
        );
        disposeObjects(groundLayer);
        groundLayer.clear();
        groundLayer.add(mesh);
        reportTerrainStatus("ready");
        render();
      })
      .catch(() => {
        if (disposed) return;
        reportTerrainStatus("unavailable");
      });
    return cleanup;
  }, []);

  useEffect(() => {
    apiRef.current?.updateTargets(sun, earth);
  }, [sun, earth]);

  useEffect(() => {
    apiRef.current?.reset();
  }, [resetToken]);

  return (
    <div
      ref={viewportRef}
      className="scene-viewport"
      role="region"
      aria-label={
        fallback
          ? "Panorama alternativo do horizonte lunar"
          : "Exploração tridimensional do local lunar"
      }
      aria-describedby={helpId}
      tabIndex={fallback ? -1 : 0}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <p
        id={helpId}
        className="scene-instructions"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          overflow: "hidden",
          clipPath: "inset(50%)",
          whiteSpace: "nowrap",
        }}
      >
        {terrainStatus === "ready"
          ? "Relevo contextual derivado de LOLA, sem cálculo de obstrução. As direções astronômicas continuam referidas ao horizonte idealizado. "
          : "Vista ilustrativa de uma superfície idealizada. O relevo contextual não está disponível. "}
        O astronauta é um marcador simbólico. As direções partem do ponto de
        referência. As linhas são sobrepostas ao terreno e não testam
        intersecções com montanhas. Linhas tracejadas indicam alvos abaixo do
        horizonte idealizado. Arraste para orbitar ou use as setas do teclado
        nesta região. Use mais e menos para aproximar e afastar, e Home para
        recentrar. Não há animação automática.
      </p>
      {fallback ? (
        <FallbackPanorama sun={sun} earth={earth} />
      ) : (
        <>
          <div
            ref={canvasHostRef}
            className="scene-canvas"
            style={{ width: "100%", height: "100%" }}
          />
          {[
            {
              name: "Sol",
              target: "SUN",
              sample: sun,
              ref: sunLabelRef,
              color: SUN_COLOR,
            },
            {
              name: "Terra",
              target: "EARTH",
              sample: earth,
              ref: earthLabelRef,
              color: EARTH_COLOR,
            },
          ].map(({ name, target, sample, ref, color }) => (
            <div
              key={target}
              ref={ref}
              className="scene-label"
              data-target={target}
              aria-hidden="true"
              hidden={!hasUsableDirection(sample)}
              style={{
                position: "absolute",
                pointerEvents: "none",
                transform: "translate(-50%, -145%)",
                color,
              }}
            >
              <strong>{name}</strong>
              <span className="scene-label-angle">
                {hasUsableDirection(sample)
                  ? `${sample.elevation_deg.toFixed(2)}°`
                  : ""}
              </span>
              <span className="scene-label-outside"> · fora da vista</span>
            </div>
          ))}
          <div
            ref={compassRef}
            className="scene-compass"
            aria-hidden="true"
            style={{
              position: "absolute",
              pointerEvents: "none",
              transform: "translate(-50%, -50%)",
              color: "#aabbbf",
              fontSize: "12px",
            }}
          >
            N
          </div>
        </>
      )}
    </div>
  );
}
