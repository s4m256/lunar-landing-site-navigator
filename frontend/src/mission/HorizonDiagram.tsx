import { useId } from "react";
import type { MissionAnalysis, TargetName } from "./types";

interface Props {
  analysis: MissionAnalysis;
  target: TargetName;
  replayToken?: number;
}

const movement = `
.mission-horizon .horizon-ray-reveal { animation: horizon-reveal 850ms cubic-bezier(.22,.68,0,1) both; }
.mission-horizon .horizon-target-reveal { animation: horizon-appear 350ms ease-out 400ms both; }
@keyframes horizon-reveal { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes horizon-appear { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .mission-horizon .horizon-ray-reveal, .mission-horizon .horizon-target-reveal { animation: none; }
}`;

/** Local section along the selected azimuth. Same scale on both axes; no terrain model. */
export function HorizonDiagram({ analysis, target, replayToken = 0 }: Props) {
  const id = useId().replace(/:/g, "");
  const direction = analysis[target];
  const name = target === "sun" ? "Sol" : "Terra";
  if (
    !Number.isFinite(direction.elevationDeg) ||
    !Number.isFinite(direction.azimuthDeg)
  ) {
    return (
      <p className="mission-diagram-error" role="status">
        Direção indisponível para este ponto.
      </p>
    );
  }
  const below = direction.elevationDeg < 0;
  const onHorizon = direction.elevationDeg === 0;
  const color = target === "sun" ? "#efc77d" : "#9ed6dd";
  const radians = (direction.elevationDeg * Math.PI) / 180;
  const length = Math.min(
    248,
    65 / Math.max(Math.abs(Math.sin(radians)), 0.001),
  );
  const origin = { x: 58, y: 100 };
  const end = {
    x: origin.x + Math.cos(radians) * length,
    y: origin.y - Math.sin(radians) * length,
  };
  const format = (value: number) =>
    `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}°`;
  const state = below
    ? "abaixo do horizonte idealizado"
    : onHorizon
      ? "no horizonte idealizado"
      : "acima do horizonte idealizado";
  const label = `${name}: ${format(direction.elevationDeg)}, ${state}. Corte na direção de azimute ${format(direction.azimuthDeg)}.`;

  return (
    <figure className="mission-horizon" style={{ margin: 0 }}>
      <style>{movement}</style>
      <p style={{ color: "#b2c0b8", fontSize: "0.875rem", margin: "0 0 8px" }}>
        Vista na direção do {name}
      </p>
      <svg
        viewBox="0 0 380 210"
        role="img"
        aria-labelledby={`${id}-title ${id}-description`}
        style={{
          width: "100%",
          maxHeight: 210,
          display: "block",
          overflow: "visible",
        }}
      >
        <title id={`${id}-title`}>{label}</title>
        <desc id={`${id}-description`}>
          O marcador branco é o observador. A linha mostra a direção calculada
          do centro do astro.
          {below
            ? " O trecho tracejado entra no lado abaixo do horizonte; o centro não satisfaz o critério deste exercício."
            : onHorizon
              ? " O centro está sobre a linha de zero graus."
              : " O centro está acima da linha de zero graus."}
          Este corte usa horizonte tangente idealizado, sem montanhas ou cálculo
          de sombras. Distâncias e tamanhos dos ícones são ilustrativos.
        </desc>
        <defs>
          <linearGradient id={`${id}-ground`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#a5b3b0" stopOpacity=".12" />
            <stop offset="1" stopColor="#a5b3b0" stopOpacity=".025" />
          </linearGradient>
          <pattern
            id={`${id}-grain`}
            width="18"
            height="18"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M2 12h4M13 4h2"
              stroke="#9baba7"
              strokeWidth=".7"
              opacity=".16"
            />
          </pattern>
        </defs>
        <path
          d={`M10 ${origin.y} H370 V188 Q370 200 358 200 H22 Q10 200 10 188 Z`}
          fill={`url(#${id}-ground)`}
        />
        <path
          d={`M10 ${origin.y} H370 V200 H10 Z`}
          fill={`url(#${id}-grain)`}
        />
        <path
          d={`M10 ${origin.y} H370`}
          stroke="#788d88"
          strokeWidth="1"
          strokeDasharray="4 6"
        />
        <text
          x="367"
          y={origin.y - 9}
          textAnchor="end"
          fill="#c0cbc5"
          fontSize="20"
          fontFamily="inherit"
        >
          0°
        </text>
        <text x="24" y="179" fill="#b2c0b8" fontSize="16" fontFamily="inherit">
          Horizonte idealizado
        </text>
        <path
          d={`M${origin.x} ${origin.y - 29}v15`}
          stroke="#c7e5d3"
          strokeWidth="1"
        />
        <text
          x={origin.x}
          y={origin.y - 42}
          textAnchor="middle"
          fill="#e6eee7"
          fontSize="20"
          fontFamily="inherit"
        >
          Seu ponto
        </text>
        <g key={`${analysis.site.id}-${analysis.utc}-${target}-${replayToken}`}>
          <g className="horizon-ray-reveal">
            <path
              d={`M${origin.x} ${origin.y} L${end.x} ${end.y}`}
              stroke={color}
              strokeWidth="2"
              strokeDasharray={below ? "6 6" : undefined}
              opacity={below ? ".72" : "1"}
              fill="none"
            />
          </g>
          <g
            className="horizon-target-reveal"
            transform={`translate(${end.x} ${end.y})`}
          >
            {target === "sun" ? (
              <g fill="none" stroke={color}>
                <circle
                  r="10"
                  fill={color}
                  fillOpacity={below ? ".15" : ".2"}
                  strokeWidth="1.5"
                />
                {Array.from({ length: 8 }, (_, index) => (
                  <path
                    key={index}
                    d="M0 -15v-5"
                    transform={`rotate(${index * 45})`}
                    strokeWidth="1.3"
                  />
                ))}
              </g>
            ) : (
              <g fill="none" stroke={color} strokeWidth="1.3">
                <circle r="12" fill={color} fillOpacity=".1" />
                <ellipse rx="5" ry="12" />
                <path d="M-11 -4q11 5 22 0M-11 4q11 -5 22 0" />
              </g>
            )}
            <text
              y="-29"
              textAnchor="middle"
              fill={color}
              fontSize="20"
              fontWeight="600"
              fontFamily="inherit"
            >
              {name}
            </text>
            <text
              y="45"
              textAnchor="middle"
              fill="#e6eee7"
              fontSize="20"
              fontFamily="inherit"
            >
              {format(direction.elevationDeg)}
            </text>
          </g>
        </g>
        <circle
          cx={origin.x}
          cy={origin.y}
          r="11"
          fill="#0b1318"
          stroke={below ? "#efc77d" : "#c7e5d3"}
          strokeWidth="1"
        />
        <circle
          cx={origin.x}
          cy={origin.y}
          r="4"
          fill={below ? "#efc77d" : "#c7e5d3"}
        />
      </svg>
      <figcaption
        style={{ color: "#b2c0b8", fontSize: "0.875rem", lineHeight: 1.6 }}
      >
        {below
          ? "A linha tracejada indica o centro abaixo do horizonte."
          : onHorizon
            ? "O centro está na linha do horizonte."
            : "A linha indica o centro acima do horizonte."}{" "}
        Azimute {format(direction.azimuthDeg)}. Não inclui bloqueio por
        montanhas.
      </figcaption>
    </figure>
  );
}
