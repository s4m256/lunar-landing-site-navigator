import type { PlanningSite } from "./planning";

interface Props {
  sites: PlanningSite[];
  selectedIds: number[];
  onToggle: (id: number) => void;
}

export function LunarMap({ sites, selectedIds, onToggle }: Props) {
  return (
    <div className="map-frame">
      <svg
        viewBox="0 0 720 360"
        role="img"
        aria-label="Mapa lunar esquemático em projeção equiretangular"
      >
        <defs>
          <radialGradient id="surface">
            <stop stopColor="#243739" />
            <stop offset="1" stopColor="#101c21" />
          </radialGradient>
          <pattern
            id="grid"
            width="60"
            height="60"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 60 0 L 0 0 0 60"
              fill="none"
              stroke="#8aa8ad"
              strokeOpacity=".16"
            />
          </pattern>
        </defs>
        <rect width="720" height="360" fill="url(#surface)" />
        <rect width="720" height="360" fill="url(#grid)" />
        <path
          d="M0 180H720 M360 0V360"
          stroke="#9cb2b9"
          strokeOpacity=".4"
          strokeDasharray="4 6"
        />
        <g fill="#9cb2b9" fontSize="11" fontFamily="monospace">
          <text x="12" y="20">
            90° N
          </text>
          <text x="12" y="174">
            0°
          </text>
          <text x="12" y="346">
            90° S
          </text>
          <text x="12" y="200">
            180° O
          </text>
          <text x="368" y="200">
            0°
          </text>
          <text x="660" y="200">
            180° L
          </text>
        </g>
        {sites.map((site) => {
          const x = (site.longitude + 180) * 2;
          const y = (90 - site.latitude) * 2;
          const selected = selectedIds.includes(site.id);
          return (
            <g key={site.id}>
              <circle
                cx={x}
                cy={y}
                r="13"
                fill={selected ? "#a8ead1" : "#91a8b3"}
                fillOpacity=".15"
              />
              <circle
                cx={x}
                cy={y}
                r="5"
                fill={selected ? "#a8ead1" : "#91a8b3"}
              />
            </g>
          );
        })}
      </svg>
      <div className="map-caption">
        <span>PROJEÇÃO EQUIRETANGULAR</span>
        <span>SEM CAMADA DE TERRENO</span>
      </div>
      {sites.length === 0 && (
        <p className="map-empty">
          Seu próximo ponto de partida.
          <br />
          <span>Cadastre coordenadas para localizar um ponto no mapa.</span>
        </p>
      )}
      {sites.length > 0 && (
        <div className="map-legend" aria-label="Pontos do mapa">
          {sites.map((site) => (
            <button
              key={site.id}
              type="button"
              aria-pressed={selectedIds.includes(site.id)}
              onClick={() => onToggle(site.id)}
            >
              {site.name} · {site.latitude}°, {site.longitude}°
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
