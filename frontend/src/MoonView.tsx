import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type {
  LocationSelection,
  SelectionMode,
  Selections,
  Slot,
  ViewCenter,
  ViewMode,
} from "./guide-types";
import {
  normalizeLongitude,
  projectGlobe,
  projectMap,
  unprojectGlobe,
  unprojectMap,
  type ProjectedPoint,
} from "./lunar-projection";
import "./moon-view.css";

interface Props {
  view: ViewMode;
  center: ViewCenter;
  selections: Selections;
  selectionMode: SelectionMode;
  activeSlot: Slot;
  onCenterChange: (center: ViewCenter) => void;
  onSelect: (location: LocationSelection) => void;
  decorative?: boolean;
}

const SIZE = 1000,
  ORIGIN = 500,
  RADIUS = 365;
const MAP_X = 90,
  MAP_Y = 230,
  MAP_WIDTH = 820,
  MAP_HEIGHT = 470;
const pointPath = (points: ProjectedPoint[], globe: boolean) => {
  let drawing = false;
  return points
    .map((point) => {
      if (!point.visible) {
        drawing = false;
        return "";
      }
      const x = globe
        ? ORIGIN + point.x * RADIUS
        : MAP_X + ((point.x + 1) / 2) * MAP_WIDTH;
      const y = globe
        ? ORIGIN + point.y * RADIUS
        : MAP_Y + ((point.y + 1) / 2) * MAP_HEIGHT;
      const command = `${drawing ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
      drawing = true;
      return command;
    })
    .join(" ");
};

/** Interactive coordinate display. Mineral texture and shading are original illustration, never terrain data. */
export function MoonView({
  view,
  center,
  selections,
  selectionMode,
  activeSlot,
  onCenterChange,
  onSelect,
  decorative = false,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const globe = view === "3D";
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState({ width: 1000, height: 1000 });
  const pointer = useRef<{
    x: number;
    y: number;
    center: ViewCenter;
    dragged: boolean;
    id: number;
  } | null>(null);
  useEffect(() => {
    if (!svgRef.current) return;
    const element = svgRef.current;
    const update = () => {
      const r = element.getBoundingClientRect();
      if (r.width && r.height)
        setViewport({ width: r.width, height: r.height });
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const projector = globe ? projectGlobe : projectMap;
  const grid = useMemo(() => {
    const lines: string[] = [];
    for (let latitude = -75; latitude <= 75; latitude += 15) {
      lines.push(
        pointPath(
          Array.from({ length: 181 }, (_, i) =>
            projector({ latitude, longitudeEast: i * 2 }, center),
          ),
          globe,
        ),
      );
    }
    for (let longitude = 0; longitude < 360; longitude += 30) {
      lines.push(
        pointPath(
          Array.from({ length: 91 }, (_, i) =>
            projector(
              { latitude: i * 2 - 90, longitudeEast: longitude },
              center,
            ),
          ),
          globe,
        ),
      );
    }
    return lines;
  }, [center.latitude, center.longitudeEast, globe]);

  function viewPoint(location: LocationSelection) {
    const p = projector(location, center);
    return {
      visible: p.visible,
      x: globe ? ORIGIN + p.x * RADIUS : MAP_X + ((p.x + 1) * MAP_WIDTH) / 2,
      y: globe ? ORIGIN + p.y * RADIUS : MAP_Y + ((p.y + 1) * MAP_HEIGHT) / 2,
    };
  }
  function coordinateAt(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const scale = Math.min(rect.width / SIZE, rect.height / SIZE);
    const left = rect.left + (rect.width - SIZE * scale) / 2,
      top = rect.top + (rect.height - SIZE * scale) / 2;
    const x = (event.clientX - left) / scale,
      y = (event.clientY - top) / scale;
    return globe
      ? unprojectGlobe((x - ORIGIN) / RADIUS, (y - ORIGIN) / RADIUS, center)
      : unprojectMap(
          ((x - MAP_X) * 2) / MAP_WIDTH - 1,
          ((y - MAP_Y) * 2) / MAP_HEIGHT - 1,
          center,
        );
  }
  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (decorative || event.button !== 0 || !coordinateAt(event)) return;
    pointer.current = {
      x: event.clientX,
      y: event.clientY,
      center: { ...center },
      dragged: false,
      id: event.pointerId,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const p = pointer.current;
    if (!p || p.id !== event.pointerId) return;
    const dx = event.clientX - p.x,
      dy = event.clientY - p.y;
    if (Math.hypot(dx, dy) < 5 && !p.dragged) return;
    p.dragged = true;
    const rect = event.currentTarget.getBoundingClientRect();
    const scale = 180 / Math.max(240, Math.min(rect.width, rect.height));
    onCenterChange({
      latitude: Math.max(-90, Math.min(90, p.center.latitude + dy * scale)),
      longitudeEast: normalizeLongitude(p.center.longitudeEast - dx * scale),
    });
  }
  function onPointerUp(event: PointerEvent<SVGSVGElement>) {
    const p = pointer.current;
    pointer.current = null;
    if (!p || p.dragged || selectionMode !== "cursor") return;
    const coordinate = coordinateAt(event);
    if (coordinate) onSelect(coordinate);
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 15 : 5;
    const vectors: Record<string, [number, number]> = {
      ArrowLeft: [0, -step],
      ArrowRight: [0, step],
      ArrowUp: [step, 0],
      ArrowDown: [-step, 0],
    };
    if (vectors[event.key]) {
      event.preventDefault();
      const [lat, lon] = vectors[event.key];
      onCenterChange({
        latitude: Math.max(-90, Math.min(90, center.latitude + lat)),
        longitudeEast: normalizeLongitude(center.longitudeEast + lon),
      });
    } else if (event.key === "Enter" && selectionMode === "center") {
      event.preventDefault();
      onSelect({
        latitude: center.latitude,
        longitudeEast: normalizeLongitude(center.longitudeEast),
      });
    }
  }
  const marker = (slot: Slot) => {
    const location = selections[slot];
    if (!location) return null;
    const p = viewPoint(location);
    if (!p.visible) return null;
    const tx = Math.max(80, Math.min(920, p.x + (slot === "A" ? -72 : 72)));
    const ty = Math.max(85, Math.min(860, p.y + (slot === "A" ? -48 : 48)));
    return (
      <g key={slot} className={`lg-marker lg-marker-${slot.toLowerCase()}`}>
        <path d={`M${p.x},${p.y} L${tx},${ty}`} className="lg-marker-leader" />
        {slot === "A" ? (
          <circle cx={p.x} cy={p.y} r="7" className="lg-marker-point" />
        ) : (
          <path
            d={`M${p.x},${p.y - 8}l8,8 -8,8 -8,-8Z`}
            className="lg-marker-point"
          />
        )}
      </g>
    );
  };
  const markerButton = (slot: Slot) => {
    const location = selections[slot];
    if (!location) return null;
    const p = viewPoint(location);
    const x = p.visible
      ? Math.max(80, Math.min(920, p.x + (slot === "A" ? -72 : 72)))
      : slot === "A"
        ? 180
        : 820;
    const y = p.visible
      ? Math.max(85, Math.min(860, p.y + (slot === "A" ? -48 : 48)))
      : 865;
    const scale = Math.min(viewport.width / SIZE, viewport.height / SIZE);
    const left = (viewport.width - SIZE * scale) / 2 + x * scale,
      top = (viewport.height - SIZE * scale) / 2 + y * scale;
    return (
      <button
        type="button"
        key={slot}
        className={`lg-moon-marker-button lg-moon-marker-${slot.toLowerCase()}${p.visible ? "" : " lg-marker-outside"}`}
        style={{ left, top }}
        onClick={() => onSelect({ ...location })}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ")
            event.stopPropagation();
        }}
        aria-label={`Usar local ${slot} na seleção ${activeSlot}${p.visible ? "" : globe ? " (no verso)" : " (fora da vista)"}`}
      >
        <span>{slot}</span>
        {!p.visible && <small>{globe ? "no verso" : "fora da vista"}</small>}
      </button>
    );
  };
  const surfaceTop = Math.max(
    MAP_Y,
    MAP_Y + (((center.latitude - 90) / 60 + 1) * MAP_HEIGHT) / 2,
  );
  const surfaceBottom = Math.min(
    MAP_Y + MAP_HEIGHT,
    MAP_Y + (((center.latitude + 90) / 60 + 1) * MAP_HEIGHT) / 2,
  );
  return (
    <div
      className={`lg-moon-view ${globe ? "lg-globe" : "lg-flat-map"} ${decorative ? "lg-decorative-moon" : ""}`}
      tabIndex={decorative ? undefined : 0}
      role={decorative ? undefined : "group"}
      aria-label={
        decorative
          ? undefined
          : `Lua em ${view}. ${selectionMode === "center" ? "Seleção pela mira" : "Seleção por cursor"}. Local ativo ${activeSlot}.`
      }
      aria-describedby={decorative ? undefined : `${uid}-help`}
      aria-hidden={decorative ? true : undefined}
      onKeyDown={decorative ? undefined : onKeyDown}
    >
      <svg
        ref={svgRef}
        viewBox="0 0 1000 1000"
        className="lg-moon-svg"
        role="img"
        aria-label={
          globe
            ? "Esfera lunar ilustrativa, com coordenadas e locais selecionados"
            : "Mapa equiretangular lunar ilustrativo, centrado na mira"
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          pointer.current = null;
        }}
      >
        <defs>
          <radialGradient id={`${uid}-mineral`} cx="30%" cy="26%" r="77%">
            <stop stopColor="#e0dfd8" />
            <stop offset=".43" stopColor="#b2b2aa" />
            <stop offset=".78" stopColor="#7b7e79" />
            <stop offset="1" stopColor="#343b3b" />
          </radialGradient>
          <radialGradient id={`${uid}-shade`} cx="32%" cy="30%" r="70%">
            <stop offset=".5" stopColor="#060b0e" stopOpacity="0" />
            <stop offset="1" stopColor="#050a0d" stopOpacity=".68" />
          </radialGradient>
          <radialGradient id={`${uid}-halo`}>
            <stop offset=".5" stopColor="#a4b4b5" stopOpacity=".13" />
            <stop offset="1" stopColor="#a4b4b5" stopOpacity="0" />
          </radialGradient>
          <filter id={`${uid}-grain`} x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency=".023"
              numOctaves="4"
              seed="14"
            />
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncR type="gamma" amplitude="1.2" exponent="1.6" />
              <feFuncG type="gamma" amplitude="1.2" exponent="1.6" />
              <feFuncB type="gamma" amplitude="1.2" exponent="1.6" />
            </feComponentTransfer>
            <feBlend in="SourceGraphic" mode="multiply" />
          </filter>
          <filter id={`${uid}-soft`}>
            <feGaussianBlur stdDeviation="8" />
          </filter>
          <clipPath id={`${uid}-surface`}>
            {globe ? (
              <circle cx={ORIGIN} cy={ORIGIN} r={RADIUS} />
            ) : (
              <rect
                x={MAP_X}
                y={surfaceTop}
                width={MAP_WIDTH}
                height={Math.max(0, surfaceBottom - surfaceTop)}
                rx="2"
              />
            )}
          </clipPath>
        </defs>
        {globe && (
          <circle cx="500" cy="500" r="470" fill={`url(#${uid}-halo)`} />
        )}
        {!globe && (
          <rect
            x={MAP_X}
            y={MAP_Y}
            width={MAP_WIDTH}
            height={MAP_HEIGHT}
            className="lg-map-edge"
          />
        )}
        <g clipPath={`url(#${uid}-surface)`}>
          <rect
            x="0"
            y="0"
            width="1000"
            height="1000"
            fill={`url(#${uid}-mineral)`}
          />
          <rect
            x="0"
            y="0"
            width="1000"
            height="1000"
            fill="#bcbdb5"
            filter={`url(#${uid}-grain)`}
            opacity=".42"
          />
          <g className="lg-illustrated-minerals" filter={`url(#${uid}-soft)`}>
            <path d="M220 330C285 225 415 270 459 345S407 493 314 466S174 419 220 330Z" />
            <path d="M576 290C667 263 765 338 758 441S685 481 651 416S525 356 576 290Z" />
            <path d="M344 581C421 538 494 607 513 676S415 756 360 704S289 611 344 581Z" />
          </g>
          <g className="lg-illustrated-craters" aria-hidden="true">
            {Array.from({ length: 56 }, (_, i) => {
              // Original, purely decorative texture. These are not measured/named lunar features.
              const angle = i * 2.399963,
                distance = 45 + (Math.sqrt((i * 71) % 997) / 31.6) * 300;
              const cx = 500 + Math.cos(angle) * distance,
                cy = 500 + Math.sin(angle) * distance;
              const radius = 3 + ((i * 13) % 23);
              return (
                <g key={i}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={radius}
                    fill="#515854"
                    fillOpacity=".1"
                    stroke="#e3e4dc"
                    strokeOpacity=".13"
                    strokeWidth="2"
                  />
                  <path
                    d={`M${cx - radius * 0.7},${cy + radius * 0.65}q${radius * 0.8},${radius * 0.8} ${radius * 1.5},${-radius * 0.15}`}
                    fill="none"
                    stroke="#3d4542"
                    strokeOpacity=".21"
                    strokeWidth="2"
                  />
                </g>
              );
            })}
          </g>
          {!decorative && (
            <g className="lg-graticule">
              {grid.map((d, i) => (
                <path d={d} key={i} />
              ))}
            </g>
          )}
          {globe && (
            <circle
              cx={ORIGIN}
              cy={ORIGIN}
              r={RADIUS}
              fill={`url(#${uid}-shade)`}
            />
          )}
        </g>
        {globe && (
          <circle cx={ORIGIN} cy={ORIGIN} r={RADIUS} className="lg-limb" />
        )}
        {!decorative && (
          <>
            {marker("A")}
            {marker("B")}
            {selectionMode === "center" && (
              <g
                className="lg-crosshair"
                transform={`translate(500 ${globe ? 500 : MAP_Y + MAP_HEIGHT / 2})`}
              >
                <circle r="13" />
                <path d="M-25 0h11M14 0h11M0-25v11M0 14v11" />
              </g>
            )}
            {!globe && (
              <text x="500" y="735" textAnchor="middle" className="lg-map-note">
                Projeção equiretangular · distorção polar · sem terreno
              </text>
            )}
          </>
        )}
      </svg>
      {!decorative && (
        <div className="lg-moon-marker-layer">
          {markerButton("A")}
          {markerButton("B")}
        </div>
      )}
      {!decorative && (
        <div className="lg-view-access">
          <p id={`${uid}-help`}>
            Arraste para orientar. Teclado: setas movem a vista
            {selectionMode === "center"
              ? `; Enter confirma a mira como ${activeSlot}`
              : ". Selecione também pela lista de locais"}
            .
          </p>
          <span>
            Centro: {center.latitude.toFixed(1)}° ·{" "}
            {center.longitudeEast.toFixed(1)}° E
          </span>
          <p className="lg-art-caption">
            Textura artística, sem correspondência com relevo real.
          </p>
        </div>
      )}
    </div>
  );
}
