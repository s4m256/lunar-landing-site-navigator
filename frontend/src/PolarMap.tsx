import { DEMO_SITES, siteLabel } from "./scientific-data";

/** South-polar azimuthal equidistant schematic: radial distance = 90 + latitude. */
export function PolarMap() {
  const cx = 190,
    cy = 150,
    scale = 110 / 1.5;
  return (
    <div className="map-frame polar-map">
      <svg
        viewBox="0 0 420 295"
        role="img"
        aria-label="Mapa polar sul esquemático: Local A em −89,5°, 0° leste; Local B em −89°, 90° leste"
      >
        <title>Dois locais hipotéticos, projeção polar equidistante</title>
        <desc>
          Anéis representam latitudes planetocêntricas; meridiano zero acima e
          90 graus leste à direita. Não há dados de terreno.
        </desc>
        <rect width="420" height="295" fill="#101c21" />
        {[0.5, 1, 1.5].map((d) => (
          <g key={d}>
            <circle
              cx={cx}
              cy={cy}
              r={d * scale}
              fill="none"
              stroke="#365056"
            />
            <text x={cx - d * scale - 5} y={cy + 14} textAnchor="end">
              {-(90 - d)}°
            </text>
          </g>
        ))}
        <path
          d={`M${cx} 30V270 M70 ${cy}H310`}
          stroke="#557172"
          strokeDasharray="3 5"
        />
        <text x={cx} y="22" textAnchor="middle">
          0° E
        </text>
        <text x="320" y={cy + 4}>
          90° E
        </text>
        <text x={cx} y="287" textAnchor="middle">
          180° E
        </text>
        <circle cx={cx} cy={cy} r="2" fill="#bccac8" />
        <text x={cx - 8} y={cy + 25}>
          Polo sul / −90°
        </text>
        {DEMO_SITES.map((site, i) => {
          const angle = (site.longitude_east_deg * Math.PI) / 180;
          const radius = (90 + site.latitude_deg) * scale;
          const x = cx + radius * Math.sin(angle),
            y = cy - radius * Math.cos(angle);
          return (
            <g key={site.id} className={`polar-site-${i}`}>
              <circle cx={x} cy={y} r="6" />
              <text x={x + 12} y={y - 8}>
                {siteLabel(site.id)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="map-caption">
        <span>PROJEÇÃO POLAR EQUIDISTANTE</span>
        <span>SEM TERRENO</span>
      </div>
    </div>
  );
}
