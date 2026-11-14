import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type {
  LocationSelection,
  SelectionMode,
  Selections,
  Slot,
  ViewCenter,
  ViewMode,
} from "./guide-types";
import {
  loadTerrainAssets,
  solarFrameAt,
  surfaceHeight,
  type TerrainAssets,
  type TerrainData,
  type SolarFrame,
} from "./terrain/terrain-data";
import {
  applyRotation,
  geoToStereo,
  geoToWorld,
  LUNAR_RADIUS_M,
  stereoToGeo,
  sunToWorld,
  worldToGeo,
} from "./terrain/surface-math";
import "./surface-terrain.css";

interface Props {
  view: ViewMode;
  center: ViewCenter;
  zoom: number;
  bearing: number;
  selections: Selections;
  selectionMode: SelectionMode;
  activeSlot: Slot;
  utc: string;
  shadows: boolean;
  onCenterChange: (center: ViewCenter) => void;
  onZoomChange: (zoom: number) => void;
  onBearingChange: (bearing: number) => void;
  onSelect: (location: LocationSelection) => void;
  onAimChange: (location: LocationSelection | null) => void;
  onStatus?: (status: TerrainViewStatus) => void;
}

export interface TerrainViewStatus {
  loaded: boolean;
  error?: string;
  solarAvailable: boolean;
  sunAbovePolarHorizon: boolean;
  renderStepM: number;
}

interface Marker {
  slot: Slot;
  x: number;
  y: number;
  outside: boolean;
  unavailable: boolean;
}

interface Runtime {
  update: () => void;
  pickCenter: () => LocationSelection | null;
  pan: (horizontalKm: number, verticalKm: number) => void;
  dispose: () => void;
}

const RAD = Math.PI / 180;
const clampZoom = (zoom: number) => Math.max(1, Math.min(12, zoom));
const frameName = (selection: LocationSelection) =>
  (selection as LocationSelection & { coordinateFrame?: string })
    .coordinateFrame ?? "IAU_MOON";

/** The marker retains the legacy observer's radial height zero; it is not moved onto the DEM. */
function selectionPosition(
  selection: LocationSelection,
  solar: SolarFrame | undefined,
  terrain: TerrainData,
): THREE.Vector3 | undefined {
  if (frameName(selection) === "MOON_ME_DE421") {
    if (selection.latitude === 90) return undefined;
    const [x, y] = geoToStereo(selection.latitude, selection.longitudeEast);
    const height = surfaceHeight(terrain, x, y);
    if (height === undefined) return undefined;
    return new THREE.Vector3(
      ...geoToWorld(selection.latitude, selection.longitudeEast, height),
    );
  }
  if (frameName(selection) !== "IAU_MOON" || !solar) return undefined;
  const phi = selection.latitude * RAD,
    lambda = selection.longitudeEast * RAD;
  const me = applyRotation(solar.iau_to_me, [
    LUNAR_RADIUS_M * Math.cos(phi) * Math.cos(lambda),
    LUNAR_RADIUS_M * Math.cos(phi) * Math.sin(lambda),
    LUNAR_RADIUS_M * Math.sin(phi),
  ]);
  return new THREE.Vector3(
    me[1] / 1000,
    (-me[2] - LUNAR_RADIUS_M) / 1000,
    -me[0] / 1000,
  );
}

/** Decimation is display-only. Missing vertices never become a zero-elevation surface. */
function buildGeometry(terrain: TerrainData) {
  const stride = 2;
  const columns: number[] = [],
    rows: number[] = [];
  for (let c = 0; c < terrain.width; c += stride) columns.push(c);
  for (let r = 0; r < terrain.height; r += stride) rows.push(r);
  if (columns.at(-1) !== terrain.width - 1) columns.push(terrain.width - 1);
  if (rows.at(-1) !== terrain.height - 1) rows.push(terrain.height - 1);
  const positions: number[] = [],
    colors: number[] = [],
    elevations: number[] = [],
    valid: boolean[] = [];
  const low = terrain.min_height_m,
    high = terrain.max_height_m;
  for (const row of rows)
    for (const column of columns) {
      const h = terrain.heights_m[row * terrain.width + column];
      valid.push(h !== null);
      if (h === null) {
        positions.push(0, 0, 0);
        colors.push(0, 0, 0);
        elevations.push(0);
        continue;
      }
      const coordinate = stereoToGeo(
        terrain.origin_x_m + column * terrain.step_m,
        terrain.origin_y_m - row * terrain.step_m,
      );
      positions.push(
        ...geoToWorld(coordinate.latitude, coordinate.longitudeEast, h),
      );
      const t = Math.max(0, Math.min(1, (h - low) / (high - low || 1)));
      // Mineral tones encode radial elevation; no procedural mountains or crater texture.
      const shade = 0.25 + t * 0.38;
      colors.push(shade * 0.96, shade, shade * 1.01);
      elevations.push(h / 1000);
    }
  const indices: number[] = [],
    width = columns.length;
  for (let r = 0; r < rows.length - 1; r++)
    for (let c = 0; c < width - 1; c++) {
      const a = r * width + c,
        b = a + 1,
        d = a + width,
        e = d + 1;
      if (valid[a] && valid[d] && valid[b]) indices.push(a, d, b);
      if (valid[b] && valid[d] && valid[e]) indices.push(b, d, e);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute(
    "radialElevation",
    new THREE.Float32BufferAttribute(elevations, 1),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return { geometry, renderStepM: terrain.step_m * stride };
}

function makeMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    side: THREE.FrontSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float radialElevation; varying float vRadialElevation;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvRadialElevation = radialElevation;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vRadialElevation;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      float contourCoordinate = vRadialElevation / 0.5;
      float contourDistance = abs(fract(contourCoordinate + 0.5) - 0.5);
      float contourWidth = max(fwidth(contourCoordinate) * 0.7, 0.004);
      float contour = 1.0 - smoothstep(0.0, contourWidth, contourDistance);
      diffuseColor.rgb *= 1.0 - contour * 0.18;
    `,
      );
  };
  material.customProgramCacheKey = () => "lola-radial-contours-v1";
  return material;
}

/** One surface, one geographic state: the 2D/3D switch changes camera pitch only. */
export function SurfaceTerrainView(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef(props);
  current.current = props;
  const runtime = useRef<Runtime | null>(null);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [status, setStatus] = useState<TerrainViewStatus>({
    loaded: false,
    solarAvailable: false,
    sunAbovePolarHorizon: false,
    renderStepM: 800,
  });
  const [notice, setNotice] = useState("");
  const [renderedUtc, setRenderedUtc] = useState("");
  const lastStatus = useRef("");
  const lastAim = useRef("");

  useEffect(() => {
    const abort = new AbortController();
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    const report = (value: TerrainViewStatus) => {
      if (cancelled) return;
      const key = JSON.stringify(value);
      if (key !== lastStatus.current) {
        lastStatus.current = key;
        setStatus(value);
        current.current.onStatus?.(value);
      }
    };
    const reportAim = (value: LocationSelection | null) => {
      const key = value
        ? `${value.latitude.toFixed(8)}/${value.longitudeEast.toFixed(8)}`
        : "missing";
      if (key !== lastAim.current) {
        lastAim.current = key;
        current.current.onAimChange(value);
      }
    };
    loadTerrainAssets(abort.signal)
      .then((assets: TerrainAssets) => {
        if (cancelled || !host.current) return;
        const element = host.current;
        const terrain = assets.terrain;
        let renderer: THREE.WebGLRenderer;
        try {
          renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
            powerPreference: "high-performance",
          });
        } catch {
          throw new Error(
            "Não foi possível iniciar WebGL. O relevo não será substituído por uma imagem fictícia; os dados e a lista de locais continuam disponíveis.",
          );
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;
        renderer.setClearColor(0x182024);
        renderer.domElement.setAttribute("aria-hidden", "true");
        renderer.domElement.className = "lg-terrain-canvas";
        element.prepend(renderer.domElement);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1500);
        const built = buildGeometry(assets.terrain),
          material = makeMaterial();
        const mesh = new THREE.Mesh(built.geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        const ambient = new THREE.AmbientLight(0xe5edf2, 0.45);
        scene.add(ambient);
        const sunlight = new THREE.DirectionalLight(0xfff4de, 4);
        sunlight.castShadow = true;
        sunlight.shadow.mapSize.set(2048, 2048);
        Object.assign(sunlight.shadow.camera, {
          left: -165,
          right: 165,
          top: 165,
          bottom: -165,
          near: 1,
          far: 1100,
        });
        sunlight.shadow.bias = -0.000015;
        sunlight.shadow.normalBias = 0.005;
        sunlight.shadow.camera.updateProjectionMatrix();
        scene.add(sunlight, sunlight.target);
        const raycaster = new THREE.Raycaster(),
          pointer = new THREE.Vector2();
        const target = new THREE.Vector3();
        let size = { width: 1, height: 1 },
          pending = 0,
          lost = false;
        let initializedTarget = false;
        const pointers = new Map<number, { x: number; y: number }>();
        let drag: {
          x: number;
          y: number;
          target: THREE.Vector3;
          bearing: number;
          zoom: number;
          mode: "pan" | "rotate";
          moved: boolean;
        } | null = null;
        let pinch: { distance: number; zoom: number } | null = null;

        function pick(
          clientX?: number,
          clientY?: number,
        ): LocationSelection | null {
          const rect = renderer.domElement.getBoundingClientRect();
          pointer.set(
            clientX === undefined
              ? 0
              : ((clientX - rect.left) / rect.width) * 2 - 1,
            clientY === undefined
              ? 0
              : (-(clientY - rect.top) / rect.height) * 2 + 1,
          );
          raycaster.setFromCamera(pointer, camera);
          const hit = raycaster.intersectObject(mesh, false)[0];
          if (!hit) return null;
          const geo = worldToGeo(hit.point.toArray());
          return {
            latitude: geo.latitude,
            longitudeEast: geo.longitudeEast,
            coordinateFrame: "MOON_ME_DE421",
          } as LocationSelection;
        }
        function update() {
          if (cancelled || lost) return;
          const p = current.current,
            terrain = assets.terrain;
          const projectedCenter =
            p.center.latitude === 90
              ? undefined
              : geoToStereo(p.center.latitude, p.center.longitudeEast);
          const centerHeight = projectedCenter
            ? surfaceHeight(terrain, projectedCenter[0], projectedCenter[1])
            : undefined;
          if (centerHeight === undefined) {
            setNotice(
              "Centro fora do recorte LOLA. Escolha um local na área coberta.",
            );
            if (!initializedTarget) {
              reportAim(null);
              return;
            }
          } else {
            target.set(
              ...geoToWorld(
                p.center.latitude,
                p.center.longitudeEast,
                centerHeight,
              ),
            );
            initializedTarget = true;
            setNotice("");
          }
          const aspect = size.width / size.height;
          const span = Math.max(60, 42 / aspect) / clampZoom(p.zoom);
          const distance = span / (2 * Math.tan(20 * RAD));
          const pitch =
              p.view === "2D" ? 0 : (size.width <= 500 ? 32 : 40) * RAD,
            bearing = p.bearing * RAD;
          camera.aspect = aspect;
          camera.up.set(-Math.sin(bearing), 0, -Math.cos(bearing));
          camera.position.set(
            target.x + Math.sin(bearing) * distance * Math.sin(pitch),
            target.y + distance * Math.cos(pitch),
            target.z + Math.cos(bearing) * distance * Math.sin(pitch),
          );
          camera.lookAt(target);
          camera.updateProjectionMatrix();
          camera.updateMatrixWorld();
          const solar = solarFrameAt(assets.solar, p.utc);
          const sun = solar ? sunToWorld(solar.sun_unit_me) : undefined;
          // A finite patch cannot model the full lunar body's occultation. Below the
          // polar tangent horizon direct light is deliberately disabled, not labelled
          // as a scientific night/visibility result for every point in the crop.
          const above = !!sun && sun[1] > 0;
          sunlight.visible = above;
          sunlight.castShadow = p.shadows;
          if (sun) {
            sunlight.target.position.copy(target);
            sunlight.position
              .copy(target)
              .addScaledVector(new THREE.Vector3(...sun), 450);
            sunlight.target.updateMatrixWorld();
            sunlight.updateMatrixWorld();
          }
          renderer.shadowMap.needsUpdate = true;
          renderer.render(scene, camera);
          setRenderedUtc(p.utc);
          const overlay = (["A", "B"] as const).flatMap((slot) => {
            const location = p.selections[slot];
            if (!location) return [];
            const point = selectionPosition(location, solar, terrain);
            if (!point)
              return [
                {
                  slot,
                  x: slot === "A" ? 65 : size.width - 65,
                  y: size.height * 0.44,
                  outside: true,
                  unavailable: true,
                },
              ];
            const projected = point.clone().project(camera);
            const x = ((projected.x + 1) * size.width) / 2,
              y = ((1 - projected.y) * size.height) / 2;
            const outside =
              projected.z < -1 ||
              projected.z > 1 ||
              x < 30 ||
              x > size.width - 30 ||
              y < 85 ||
              y > size.height - 120;
            return [
              {
                slot,
                x: Math.max(
                  outside ? 65 : 30,
                  Math.min(size.width - (outside ? 65 : 30), x),
                ),
                y: Math.max(95, Math.min(size.height - 155, y)),
                outside,
                unavailable: false,
              },
            ];
          });
          setMarkers((previous) =>
            JSON.stringify(previous) === JSON.stringify(overlay)
              ? previous
              : overlay,
          );
          reportAim(pick());
          report({
            loaded: true,
            solarAvailable: !!solar,
            sunAbovePolarHorizon: above,
            renderStepM: built.renderStepM,
          });
        }
        function schedule() {
          if (!pending && !cancelled && !lost)
            pending = requestAnimationFrame(() => {
              pending = 0;
              update();
            });
        }
        function resize() {
          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return;
          size = { width: rect.width, height: rect.height };
          renderer.setSize(size.width, size.height, false);
          schedule();
        }
        const observer =
          typeof ResizeObserver !== "undefined"
            ? new ResizeObserver(resize)
            : null;
        observer?.observe(element);
        window.addEventListener("resize", resize);
        function applyPan(next: THREE.Vector3) {
          const geo = worldToGeo(next.toArray());
          const [x, y] = geoToStereo(geo.latitude, geo.longitudeEast);
          const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -target.y);
          const offsets: THREE.Vector3[] = [];
          for (const cx of [-1, 1])
            for (const cy of [-1, 1]) {
              raycaster.setFromCamera(new THREE.Vector2(cx, cy), camera);
              const hit = raycaster.ray.intersectPlane(
                ground,
                new THREE.Vector3(),
              );
              if (hit) offsets.push(hit.sub(target));
            }
          // Reserve actual ground footprint, rather than clamping the map's center
          // alone. Extra space allows the measured relief to depart from the plane.
          const margin = 8_000;
          const dx = offsets.map((p) => p.x * 1000),
            dy = offsets.map((p) => -p.z * 1000);
          const minX = terrain.origin_x_m + margin - Math.min(0, ...dx),
            maxX =
              terrain.origin_x_m +
              (terrain.width - 1) * terrain.step_m -
              margin -
              Math.max(0, ...dx);
          const maxY = terrain.origin_y_m - margin - Math.max(0, ...dy),
            minY =
              terrain.origin_y_m -
              (terrain.height - 1) * terrain.step_m +
              margin -
              Math.min(0, ...dy);
          const covered = stereoToGeo(
            Math.max(minX, Math.min(maxX, x)),
            Math.max(minY, Math.min(maxY, y)),
          );
          current.current.onCenterChange(covered);
        }
        function pan(horizontalKm: number, verticalKm: number) {
          const angle = current.current.bearing * RAD;
          const right = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
          const north = new THREE.Vector3(
            -Math.sin(angle),
            0,
            -Math.cos(angle),
          );
          applyPan(
            target
              .clone()
              .addScaledVector(right, horizontalKm)
              .addScaledVector(north, verticalKm),
          );
        }
        function down(event: PointerEvent) {
          if (event.button !== 0 && event.button !== 2) return;
          event.preventDefault();
          element.focus({ preventScroll: true });
          pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
          renderer.domElement.setPointerCapture(event.pointerId);
          if (pointers.size === 2) {
            const values = [...pointers.values()];
            pinch = {
              distance: Math.hypot(
                values[0].x - values[1].x,
                values[0].y - values[1].y,
              ),
              zoom: current.current.zoom,
            };
            if (drag) drag.moved = true;
            return;
          }
          drag = {
            x: event.clientX,
            y: event.clientY,
            target: target.clone(),
            bearing: current.current.bearing,
            zoom: current.current.zoom,
            mode: event.button === 2 || event.altKey ? "rotate" : "pan",
            moved: false,
          };
        }
        function move(event: PointerEvent) {
          if (!pointers.has(event.pointerId)) return;
          pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (pinch && pointers.size === 2) {
            const values = [...pointers.values()];
            const distance = Math.hypot(
              values[0].x - values[1].x,
              values[0].y - values[1].y,
            );
            current.current.onZoomChange(
              clampZoom((pinch.zoom * distance) / Math.max(1, pinch.distance)),
            );
            return;
          }
          if (!drag) return;
          const dx = event.clientX - drag.x,
            dy = event.clientY - drag.y;
          if (Math.hypot(dx, dy) < 4 && !drag.moved) return;
          drag.moved = true;
          if (drag.mode === "rotate") {
            current.current.onBearingChange(
              (drag.bearing + dx * 0.3 + 360) % 360,
            );
            return;
          }
          const angle = drag.bearing * RAD,
            span =
              Math.max(60, 42 / (size.width / size.height)) /
              clampZoom(drag.zoom),
            unit = span / size.height;
          const right = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
          const north = new THREE.Vector3(
            -Math.sin(angle),
            0,
            -Math.cos(angle),
          );
          const next = drag.target
            .clone()
            .addScaledVector(right, -dx * unit)
            .addScaledVector(
              north,
              (dy * unit) /
                (current.current.view === "3D"
                  ? Math.cos((size.width <= 500 ? 32 : 40) * RAD)
                  : 1),
            );
          applyPan(next);
        }
        function up(event: PointerEvent) {
          const previous = drag;
          pointers.delete(event.pointerId);
          if (pointers.size < 2) pinch = null;
          if (!pointers.size) drag = null;
          if (
            !previous ||
            previous.moved ||
            current.current.selectionMode !== "cursor"
          )
            return;
          const selected = pick(event.clientX, event.clientY);
          if (selected) current.current.onSelect(selected);
        }
        function cancel(event: PointerEvent) {
          pointers.delete(event.pointerId);
          drag = null;
          pinch = null;
        }
        function wheel(event: WheelEvent) {
          event.preventDefault();
          current.current.onZoomChange(
            clampZoom(current.current.zoom * Math.exp(-event.deltaY * 0.0012)),
          );
        }
        function context(event: Event) {
          event.preventDefault();
        }
        function lostContext(event: Event) {
          event.preventDefault();
          lost = true;
          reportAim(null);
          report({
            loaded: false,
            error:
              "A visualização 3D foi interrompida. Recarregue a página para retomar o relevo.",
            solarAvailable: false,
            sunAbovePolarHorizon: false,
            renderStepM: built.renderStepM,
          });
        }
        const canvas = renderer.domElement;
        canvas.addEventListener("pointerdown", down);
        canvas.addEventListener("pointermove", move);
        canvas.addEventListener("pointerup", up);
        canvas.addEventListener("pointercancel", cancel);
        canvas.addEventListener("wheel", wheel, { passive: false });
        canvas.addEventListener("contextmenu", context);
        canvas.addEventListener("webglcontextlost", lostContext);
        runtime.current = {
          update: schedule,
          pickCenter: () => pick(),
          pan,
          dispose: () => {
            cancelAnimationFrame(pending);
            observer?.disconnect();
            window.removeEventListener("resize", resize);
            canvas.removeEventListener("pointerdown", down);
            canvas.removeEventListener("pointermove", move);
            canvas.removeEventListener("pointerup", up);
            canvas.removeEventListener("pointercancel", cancel);
            canvas.removeEventListener("wheel", wheel);
            canvas.removeEventListener("contextmenu", context);
            canvas.removeEventListener("webglcontextlost", lostContext);
            built.geometry.dispose();
            material.dispose();
            sunlight.shadow.map?.dispose();
            renderer.dispose();
            canvas.remove();
          },
        };
        cleanup = runtime.current.dispose;
        resize();
      })
      .catch((error) => {
        if (cancelled || abort.signal.aborted) return;
        reportAim(null);
        report({
          loaded: false,
          error:
            error instanceof Error
              ? error.message
              : "Não foi possível carregar o relevo.",
          solarAvailable: false,
          sunAbovePolarHorizon: false,
          renderStepM: 800,
        });
      });
    return () => {
      cancelled = true;
      abort.abort();
      cleanup?.();
      runtime.current = null;
    };
  }, []);

  useEffect(() => {
    runtime.current?.update();
  }, [
    props.view,
    props.center.latitude,
    props.center.longitudeEast,
    props.zoom,
    props.bearing,
    props.selections,
    props.utc,
    props.shadows,
    props.selectionMode,
  ]);

  return (
    <div
      ref={host}
      className={`lg-surface-terrain ${props.view === "3D" ? "is-tilted" : "is-top-down"}`}
      role="group"
      tabIndex={0}
      aria-label={`Lua em ${props.view}. Mapa topográfico de superfície. Local ativo ${props.activeSlot}.`}
      aria-describedby="surface-terrain-instructions"
      data-render-step-m={status.renderStepM}
      data-loaded={status.loaded}
      data-center-latitude={props.center.latitude}
      data-center-longitude={props.center.longitudeEast}
      data-zoom={props.zoom}
      data-bearing={props.bearing}
      data-solar-utc={status.solarAvailable ? props.utc : ""}
      data-shadows={props.shadows}
      data-rendered-utc={renderedUtc}
      onKeyDown={(event) => {
        if (
          event.target !== event.currentTarget &&
          (event.target as HTMLElement).tagName !== "CANVAS"
        )
          return;
        const step = (event.shiftKey ? 5 : 1) / clampZoom(props.zoom);
        const arrows: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, step],
          ArrowDown: [0, -step],
        };
        if (arrows[event.key]) {
          event.preventDefault();
          const [x, y] = arrows[event.key];
          runtime.current?.pan(x, y);
        } else if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          props.onZoomChange(clampZoom(props.zoom * 1.3));
        } else if (event.key === "-") {
          event.preventDefault();
          props.onZoomChange(clampZoom(props.zoom / 1.3));
        } else if (event.key === "[" || event.key === "]") {
          event.preventDefault();
          props.onBearingChange(
            (props.bearing + (event.key === "[" ? -15 : 15) + 360) % 360,
          );
        } else if (event.key === "Enter" && props.selectionMode === "center") {
          event.preventDefault();
          const selected = runtime.current?.pickCenter();
          if (selected) props.onSelect(selected);
        }
      }}
    >
      {!status.loaded && !status.error && (
        <div className="lg-terrain-loading" role="status">
          <span className="lg-terrain-loading-mark" aria-hidden="true" />
          <strong>Carregando relevo LOLA…</strong>
          <p>Terreno real do polo sul lunar.</p>
        </div>
      )}
      {status.error && (
        <div className="lg-terrain-failure" role="alert">
          <strong>Relevo indisponível</strong>
          <p>{status.error}</p>
          <p>Nenhum terreno fictício será apresentado.</p>
        </div>
      )}
      <div className="lg-surface-marker-layer">
        {markers.map((marker) => {
          const selection = props.selections[marker.slot];
          if (!selection) return null;
          return (
            <button
              type="button"
              key={marker.slot}
              className={`lg-surface-marker lg-surface-marker-${marker.slot} ${marker.outside ? "is-outside" : ""}`}
              style={{ left: marker.x, top: marker.y }}
              aria-label={`Usar local ${marker.slot} na seleção ${props.activeSlot}${marker.unavailable ? " (posição indisponível)" : marker.outside ? " (fora da vista)" : ""}`}
              onClick={() => props.onSelect({ ...selection })}
            >
              <span>{marker.slot}</span>
              {marker.unavailable ? (
                <small>sem posição</small>
              ) : marker.outside ? (
                <small>fora da vista</small>
              ) : null}
            </button>
          );
        })}
      </div>
      {props.selectionMode === "center" && status.loaded && (
        <div className="lg-surface-crosshair" aria-hidden="true">
          <i />
          <i />
          <span />
        </div>
      )}
      {notice && (
        <p className="lg-terrain-notice" role="status">
          {notice}
        </p>
      )}
      {status.loaded && !status.solarAvailable && (
        <p className="lg-terrain-solar-notice" role="status">
          Sem orientação solar para este instante. Apenas luz de leitura;
          nenhuma sombra temporal é apresentada.
        </p>
      )}
      {status.loaded &&
        status.solarAvailable &&
        !status.sunAbovePolarHorizon && (
          <p className="lg-terrain-solar-notice">
            Sol abaixo do horizonte polar de referência. Iluminação direta
            desativada nesta visualização; não é uma classificação de noite para
            todo o recorte.
          </p>
        )}
      <p id="surface-terrain-instructions" className="lg-sr-only">
        Mapa de relevo LOLA em MOON_ME_DE421. Arraste para deslocar; use a roda
        ou os botões de zoom. Teclado: setas deslocam, mais e menos ajustam o
        zoom, colchetes giram a vista. Em modo Centro, Enter confirma a
        interseção da mira com o terreno. A lista e os campos de coordenadas
        permitem selecionar sem apontar. Sombras são aproximações visuais sobre
        malha reduzida, sem resultados de visibilidade operacional.
      </p>
    </div>
  );
}
