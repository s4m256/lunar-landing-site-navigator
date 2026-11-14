import { useId } from "react";
import type { MissionSite } from "./types";

interface GuidePortraitProps {
  mood?: "welcome" | "thinking" | "happy";
  className?: string;
}

/** An original, fictional guide. The CLPS payload itself is robotic. */
export function GuidePortrait({
  mood = "welcome",
  className = "",
}: GuidePortraitProps) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className={`guide-portrait ${className}`}
      viewBox="0 0 440 470"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-suit`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#f0f0e3" />
          <stop offset="1" stopColor="#aebfb8" />
        </linearGradient>
        <linearGradient id={`${id}-visor`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#314a50" />
          <stop offset="1" stopColor="#101e26" />
        </linearGradient>
      </defs>
      <circle cx="220" cy="221" r="174" fill="#142128" />
      <circle
        cx="220"
        cy="221"
        r="199"
        fill="none"
        stroke="#374745"
        strokeDasharray="2 10"
      />
      <path
        d="M23 260C50 357 339 361 415 181"
        fill="none"
        stroke="#788f84"
        strokeWidth="1"
      />
      <circle cx="392" cy="218" r="6" fill="#c7e5d3" />
      <path
        d="M79 109h12m-6-6v12m271 234h10m-5-5v10M333 69h14m-7-7v14"
        stroke="#b5c6b9"
        strokeWidth="1.5"
      />
      <circle cx="113" cy="62" r="2" fill="#e7ede3" />
      <circle cx="378" cy="126" r="2" fill="#e7ede3" />
      <path
        d="M151 287c-32 6-61 43-67 88l-4 57h277l-8-67c-5-37-30-69-60-77"
        fill="#879e95"
        stroke="#101c21"
        strokeWidth="4"
      />
      <rect
        x="137"
        y="269"
        width="164"
        height="177"
        rx="47"
        fill={`url(#${id}-suit)`}
        stroke="#101c21"
        strokeWidth="4"
      />
      <path
        d="M164 302c-20 11-30 38-30 68v66m143-135c23 13 33 33 34 69v66"
        fill="none"
        stroke="#788e86"
        strokeWidth="3"
      />
      <path
        d="M152 315l137 100M288 314L150 415"
        stroke="#4a625a"
        strokeWidth="13"
      />
      <path
        d="M152 315l137 100M288 314L150 415"
        stroke="#d8e3d4"
        strokeWidth="7"
      />
      <rect
        x="176"
        y="342"
        width="88"
        height="61"
        rx="10"
        fill="#253c3b"
        stroke="#849f91"
        strokeWidth="2"
      />
      <rect x="189" y="355" width="37" height="7" rx="3" fill="#c7e5d3" />
      <circle cx="244" cy="359" r="4" fill="#e6bb75" />
      <path d="M190 380h55m-55 8h31" stroke="#809d8f" strokeWidth="2" />
      <path
        d="M115 323c-18 17-31 42-30 62 2 25 20 31 37 15l35-39"
        fill={`url(#${id}-suit)`}
        stroke="#101c21"
        strokeWidth="4"
      />
      <path
        d="M305 322l27 31 28-26c13-11 32 4 22 19l-39 45c-12 14-27 13-39-2l-23-29"
        fill={`url(#${id}-suit)`}
        stroke="#101c21"
        strokeWidth="4"
      />
      <path
        d="M356 329l-2-24c-1-11 12-14 16-3l5 21 12-10c9-6 18 4 11 12l-20 21"
        fill="#dde5d9"
        stroke="#101c21"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path d="M105 373l20 14m186-13l20-19" stroke="#4c6961" strokeWidth="9" />
      <ellipse
        cx="220"
        cy="281"
        rx="71"
        ry="23"
        fill="#526d66"
        stroke="#101c21"
        strokeWidth="4"
      />
      <ellipse cx="220" cy="273" rx="59" ry="15" fill="#c5d3c7" />
      <rect
        x="115"
        y="166"
        width="28"
        height="66"
        rx="11"
        fill="#9bac9f"
        stroke="#101c21"
        strokeWidth="4"
      />
      <rect
        x="297"
        y="166"
        width="28"
        height="66"
        rx="11"
        fill="#9bac9f"
        stroke="#101c21"
        strokeWidth="4"
      />
      <path
        d="M220 77c63 0 99 45 99 109v28c0 53-43 80-99 80s-99-27-99-80v-28c0-64 36-109 99-109Z"
        fill={`url(#${id}-suit)`}
        stroke="#101c21"
        strokeWidth="4"
      />
      <path
        d="M220 97c51 0 80 34 80 90v25c0 41-34 63-80 63s-80-22-80-63v-25c0-56 29-90 80-90Z"
        fill={`url(#${id}-visor)`}
        stroke="#738d82"
        strokeWidth="3"
      />
      <path
        d="M163 181c0-44 21-65 57-65s57 21 57 65v36c0 31-24 50-57 50s-57-19-57-50Z"
        fill="#bd8c6a"
      />
      <path
        d="M161 184c-1-51 23-75 62-73 39 2 57 30 55 73-13-8-18-26-19-43-21 20-51 28-88 26l-4 21Z"
        fill="#25332f"
      />
      <path
        d="M185 190q11-7 21-1m29-1q10-5 19 1"
        fill="none"
        stroke="#3b342c"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {mood === "happy" ? (
        <path
          d="M186 207q8-9 16 0m35 0q8-9 16 0"
          fill="none"
          stroke="#28352f"
          strokeWidth="4"
          strokeLinecap="round"
        />
      ) : (
        <>
          <ellipse cx="195" cy="205" rx="3.5" ry="5" fill="#26342e" />
          <ellipse cx="245" cy="205" rx="3.5" ry="5" fill="#26342e" />
        </>
      )}
      <path
        d="M220 208l-4 15h8"
        fill="none"
        stroke="#95674f"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d={
          mood === "thinking"
            ? "M209 241q12-5 22-1"
            : mood === "happy"
              ? "M203 235q17 22 35 0Z"
              : "M205 237q15 13 30-1"
        }
        fill={mood === "happy" ? "#f0dfc4" : "none"}
        stroke="#654b3e"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M151 170c3-24 13-43 31-54"
        fill="none"
        stroke="#d7ede3"
        strokeWidth="5"
        strokeLinecap="round"
        opacity=".55"
      />
      <path
        d="M286 226l-23 12"
        stroke="#acbfb4"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="260" cy="239" r="6" fill="#293e38" />
      <path
        d="M177 93c25-13 60-13 86 0"
        fill="none"
        stroke="#6f877b"
        strokeWidth="2"
      />
      <circle cx="220" cy="86" r="4" fill="#355048" />
      <path d="M154 422h130" stroke="#738f80" strokeWidth="3" />
    </svg>
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
