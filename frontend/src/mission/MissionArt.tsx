import { useId } from "react";
import astronautUrl from "../assets/poly-astronaut.webp";
import type { MissionSite } from "./types";

interface GuidePortraitProps {
  mood?: "welcome" | "thinking" | "happy";
  className?: string;
}

/** A decorative guide; the CLPS payload itself is robotic. */
export function GuidePortrait({ className = "" }: GuidePortraitProps) {
  return (
    <img
      className={`guide-portrait ${className}`}
      src={astronautUrl}
      alt=""
      aria-hidden="true"
    />
  );
}

interface RocketIllustrationProps {
  phase: "idle" | "launch" | "landing" | "landed";
  className?: string;
}

export function RocketIllustration({
  phase,
  className = "",
}: RocketIllustrationProps) {
  const id = useId().replace(/:/g, "");
  const lunar = phase === "landing" || phase === "landed";
  return (
    <svg
      className={`rocket-illustration rocket-${phase} ${className}`}
      viewBox="0 0 560 490"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-metal`} x1="0" x2="1">
          <stop stopColor="#98b0a3" />
          <stop offset=".48" stopColor="#edf0e6" />
          <stop offset="1" stopColor="#a9beb1" />
        </linearGradient>
        <linearGradient id={`${id}-flame`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#f4dfaa" />
          <stop offset="1" stopColor="#d8a258" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="277" cy="232" r="201" fill="#142128" />
      <circle cx="277" cy="232" r="200" fill="none" stroke="#30413f" />
      <path
        d="M103 133h12m-6-6v12m317 37h12m-6-6v12M170 55h8m-4-4v8m234 240h10m-5-5v10"
        stroke="#a1b5a9"
        strokeWidth="1.5"
      />
      <circle cx="340" cy="67" r="2" fill="#edf0e6" />
      <circle cx="133" cy="258" r="2" fill="#edf0e6" />
      <circle cx="458" cy="229" r="2" fill="#edf0e6" />
      <circle cx="408" cy="100" r="27" fill="#c6d8c7" />
      <path d="M408 73a27 27 0 0 1 0 54c15-16 15-38 0-54" fill="#809e8f" />
      <path
        d="M39 437q240-91 482 0v53H39Z"
        fill={lunar ? "#45554e" : "#304f50"}
      />
      <path
        d="M39 437q240-91 482 0"
        fill="none"
        stroke={lunar ? "#8b9b8a" : "#6faaa0"}
        strokeWidth="2"
      />
      {lunar ? (
        <g fill="none" stroke="#2b3c36" strokeWidth="3">
          <ellipse cx="147" cy="438" rx="28" ry="7" />
          <ellipse cx="401" cy="448" rx="40" ry="9" />
          <ellipse cx="309" cy="414" rx="14" ry="4" />
        </g>
      ) : (
        <path
          d="M77 437q99-44 202-31m-134 30q152-38 306 10"
          fill="none"
          stroke="#6c9890"
          strokeWidth="2"
          opacity=".5"
        />
      )}
      <ellipse
        className="rocket-shadow"
        cx="279"
        cy="423"
        rx="79"
        ry="9"
        fill="#0b1518"
        opacity=".5"
      />
      <g className="rocket-craft">
        {(phase === "launch" || phase === "landing") && (
          <g className="rocket-plume">
            <path
              d="M258 322q-5 51 22 87 26-39 20-87"
              fill={`url(#${id}-flame)`}
            />
            <path d="M269 321l11 55 11-55" fill="#f0e4be" />
          </g>
        )}
        <path
          d="M237 282l-39 101m125-101 39 101"
          stroke="#acc3b3"
          strokeWidth="7"
        />
        <path
          d="M245 306l-47 77m117-77 47 77"
          stroke="#526d60"
          strokeWidth="4"
        />
        <path
          d="M184 384h29m134 0h29"
          stroke="#d4dfcc"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d="M262 301l-9 25h54l-9-25"
          fill="#53695d"
          stroke="#101e21"
          strokeWidth="3"
        />
        <path
          d="M224 209l-67 16v59l67-11m112-64 67 16v59l-67-11"
          fill="#344d4a"
          stroke="#93ac9a"
          strokeWidth="3"
        />
        <path
          d="M174 222v55m17-59v56m17-60v57m144-57v57m17-53v56m17-52v55M158 244l65-12m114 0 65 12m-244 18 65-10m114 0 65 10"
          stroke="#668a76"
          strokeWidth="1.5"
        />
        <path
          d="M233 195l19-43h56l19 43 12 104H221Z"
          fill={`url(#${id}-metal)`}
          stroke="#101e21"
          strokeWidth="4"
        />
        <path
          d="M254 153q2-26 26-37 24 11 26 37"
          fill="#d5e1cf"
          stroke="#101e21"
          strokeWidth="4"
        />
        <path
          d="M280 116V87m-18 7 18-7 18 7"
          fill="none"
          stroke="#b7c8b6"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path d="M228 202h104m-107 87h110" stroke="#536b5e" strokeWidth="3" />
        <rect
          x="248"
          y="218"
          width="64"
          height="54"
          rx="5"
          fill="#a5844f"
          stroke="#455a4e"
          strokeWidth="2"
        />
        <path
          d="M255 226h50m-50 8h50m-50 8h50m-50 8h50m-50 8h50"
          stroke="#d1ba83"
          strokeWidth="1"
        />
        <rect x="265" y="175" width="30" height="16" rx="4" fill="#263d37" />
        <circle cx="280" cy="183" r="5" fill="#8daf99" />
        <path
          d="M236 212v69m88-69v69"
          stroke="#f2f1de"
          strokeWidth="3"
          opacity=".5"
        />
        <path d="M274 278h12" stroke="#344f42" strokeWidth="3" />
      </g>
      <path d="M73 476h414" stroke="#647b6c" strokeWidth="1" />
    </svg>
  );
}

interface PolarMissionMapProps {
  sites: MissionSite[];
  selectedSiteId?: string;
  visitedSiteIds: string[];
  onSelect: (id: string) => void;
  onDiscover: () => void;
  discovered: boolean;
}

// South-polar azimuthal equidistant projection: pole at centre, 80° S at rim.
// Geographic positions are never moved to make room for a label.
function polarPosition(site: MissionSite) {
  const radius = ((90 + site.latitudeDeg) / 10) * 190;
  const longitude = (site.longitudeDeg * Math.PI) / 180;
  return {
    x: 240 + radius * Math.sin(longitude),
    y: 240 - radius * Math.cos(longitude),
  };
}

const craters = [
  [123, 135, 25],
  [340, 113, 37],
  [371, 301, 29],
  [152, 327, 46],
  [287, 382, 22],
  [93, 238, 18],
  [232, 110, 12],
  [267, 287, 14],
  [319, 204, 20],
  [211, 214, 9],
  [236, 349, 10],
  [350, 366, 9],
] as const;

export function PolarMissionMap({
  sites,
  selectedSiteId,
  visitedSiteIds,
  onSelect,
  onDiscover,
  discovered,
}: PolarMissionMapProps) {
  const id = useId().replace(/:/g, "");
  return (
    <div className="mission-map">
      <div className="mission-map-canvas">
        <svg
          className="mission-map-surface"
          viewBox="0 0 480 480"
          aria-hidden="true"
        >
          <defs>
            <radialGradient id={`${id}-surface`} cx="38%" cy="30%">
              <stop stopColor="#56645a" />
              <stop offset="1" stopColor="#263b35" />
            </radialGradient>
            <clipPath id={`${id}-clip`}>
              <circle cx="240" cy="240" r="190" />
            </clipPath>
          </defs>
          <circle
            cx="240"
            cy="240"
            r="203"
            fill="none"
            stroke="#3b5148"
            strokeDasharray="1 9"
          />
          <circle
            cx="240"
            cy="240"
            r="190"
            fill={`url(#${id}-surface)`}
            stroke="#7d9482"
          />
          <g clipPath={`url(#${id}-clip)`}>
            <path
              d="M58 166c59-34 100 21 148-11s106-31 159 7 71 37 88 9M25 335c96-9 100-49 164-27s106 13 153-19 91-25 138-10"
              fill="none"
              stroke="#7a8972"
              strokeWidth="28"
              opacity=".09"
            />
            {craters.map(([x, y, radius]) => (
              <g key={`${x}-${y}`}>
                <circle
                  cx={x}
                  cy={y}
                  r={radius}
                  fill="#24382f"
                  stroke="#687b65"
                  strokeWidth="1.5"
                />
                <path
                  d={`M${x - radius * 0.8} ${y + radius * 0.15}a${radius * 0.82} ${radius * 0.82} 0 0 1 ${radius * 1.55} ${-radius * 0.45}`}
                  fill="none"
                  stroke="#101f1b"
                  strokeWidth="5"
                  opacity=".4"
                />
                <circle
                  cx={x + radius * 0.12}
                  cy={y + radius * 0.18}
                  r={radius * 0.6}
                  fill="#364b3b"
                  opacity=".8"
                />
              </g>
            ))}
            <path
              d="M50 240h380M240 50v380M106 106l268 268m0-268L106 374"
              stroke="#a8bda4"
              strokeWidth=".7"
              opacity=".24"
            />
            <circle
              cx="240"
              cy="240"
              r="95"
              fill="none"
              stroke="#c2d5b5"
              strokeDasharray="3 6"
              opacity=".5"
            />
            <circle
              cx="240"
              cy="240"
              r="143"
              fill="none"
              stroke="#c2d5b5"
              strokeWidth=".7"
              opacity=".15"
            />
          </g>
          <path d="M233 240h14m-7-7v14" stroke="#d4e1cb" strokeWidth="1.5" />
          <g
            className="map-orientation-labels"
            fill="#bed0bd"
            fontSize="12"
            fontFamily="inherit"
            textAnchor="middle"
          >
            <text x="240" y="27">
              0°
            </text>
            <text x="456" y="245">
              90°
            </text>
            <text x="240" y="461">
              180°
            </text>
            <text x="25" y="245">
              270°
            </text>
          </g>
          <g
            className="map-latitude-labels"
            fill="#c8d8c1"
            fontSize="10"
            fontFamily="inherit"
          >
            <text x="251" y="259">
              90° S
            </text>
            <text x="307" y="168">
              85° S
            </text>
          </g>
        </svg>
        {sites.map((site, index) => {
          const point = polarPosition(site);
          const selected = site.id === selectedSiteId;
          const visited = visitedSiteIds.includes(site.id);
          return (
            <button
              key={site.id}
              className={`mission-map-site${selected ? " is-selected" : ""}${visited ? " is-visited" : ""}`}
              style={{
                left: `${(point.x / 480) * 100}%`,
                top: `${(point.y / 480) * 100}%`,
              }}
              aria-label={`${site.label}, ${Math.abs(site.latitudeDeg)}° ${site.latitudeDeg < 0 ? "sul" : "norte"}, ${site.longitudeDeg}° leste${visited ? ", já analisado" : ""}`}
              aria-pressed={selected}
              onClick={() => onSelect(site.id)}
            >
              <span>{String.fromCharCode(65 + index)}</span>
              {visited && (
                <span className="mission-map-visited" aria-hidden="true">
                  ✓
                </span>
              )}
            </button>
          );
        })}
        <button
          className={`mission-map-bonus${discovered ? " is-discovered" : ""}`}
          aria-label={
            discovered
              ? "Reabrir bônus educativo"
              : "Sinal desconhecido, bônus educativo"
          }
          onClick={onDiscover}
        >
          <span aria-hidden="true">{discovered ? "✧" : "?"}</span>
          <span>Bônus</span>
        </button>
      </div>
      <div className="mission-map-footer">
        <p className="mission-map-note">
          Polo sul · projeção de 80° S a 90° S<br />
          <span>
            Mapa esquemático. Crateras ilustrativas, sem relevo medido.
          </span>
        </p>
      </div>
    </div>
  );
}
