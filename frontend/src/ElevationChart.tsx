import {
  DEMO_SITES,
  siteLabel,
  type DemoResult,
  type Target,
} from "./scientific-data";

export function ElevationChart({
  result,
  target,
  utc,
}: {
  result: DemoResult;
  target: Target;
  utc: string;
}) {
  const series = DEMO_SITES.map((site) =>
    result.series.find((s) => s.site_id === site.id && s.target === target)!,
  );
  const values = series.flatMap((s) => s.samples.map((p) => p.elevation_deg));
  // A symmetric scale includes zero and all data, without implying a physical accuracy.
  const extent = Math.max(
    5,
    Math.ceil(Math.max(...values.map(Math.abs)) / 5) * 5,
  );
  const left = 62,
    right = 736,
    top = 32,
    bottom = 240;
  const x = (i: number) => left + (i / 364) * (right - left);
  const y = (el: number) =>
    bottom - ((el + extent) / (2 * extent)) * (bottom - top);
  const index = series[0].samples.findIndex((p) => p.utc === utc);
  const targetName = target === "SUN" ? "Sol" : "Terra";
  return (
    <section className="panel temporal" aria-labelledby="temporal-title">
      <div className="section-top">
        <div>
          <p className="eyebrow">EVOLUÇÃO / 2026</p>
          <h2 id="temporal-title">
            Elevação do centro {target === "SUN" ? "do Sol" : "da Terra"}
          </h2>
        </div>
        <span className="badge">365 amostras por local</span>
      </div>
      <div className="chart-legend">
        <span className="legend-a">● Local A</span>
        <span className="legend-b">◆ Local B</span>
        <span>Alvo: {targetName}</span>
      </div>
      <p className="chart-scroll-hint">
        Em telas estreitas, deslize o gráfico para explorar o ano completo.
      </p>
      <div
        className="chart-scroll"
        role="region"
        aria-label="Gráfico de elevação com rolagem horizontal"
        tabIndex={0}
      >
        <svg
          className="elevation-chart"
          viewBox="0 0 780 300"
          role="img"
          aria-label={`Elevação do centro ${target === "SUN" ? "do Sol" : "da Terra"} em graus durante 2026, Locais A e B`}
        >
          <title>{targetName}: elevação por amostra diária UTC</title>
          <desc>
            Pontos são amostras calculadas. Segmentos retos servem apenas como
            guia visual; não representam cálculos entre datas. Linha tracejada:
            horizonte geométrico de zero grau.
          </desc>
          {[-extent, 0, extent].map((tick) => (
            <g key={tick}>
              <line
                x1={left}
                x2={right}
                y1={y(tick)}
                y2={y(tick)}
                className={tick === 0 ? "horizon-line" : "chart-grid"}
              />
              <text x={left - 10} y={y(tick) + 4} textAnchor="end">
                {tick}°
              </text>
            </g>
          ))}
          <text x={left} y="17">
            Elevação (°)
          </text>
          <text x={right} y={y(0) - 8} textAnchor="end">
            Horizonte geométrico 0°
          </text>
          {series.map((s, i) => (
            <g key={s.site_id} className={`plot-${i}`}>
              <polyline
                points={s.samples
                  .map((p, n) => `${x(n)},${y(p.elevation_deg)}`)
                  .join(" ")}
              />
              {s.samples.map((p, n) => (
                <circle key={p.utc} cx={x(n)} cy={y(p.elevation_deg)} r="1.4">
                  <title>
                    {siteLabel(s.site_id)} · {p.utc} ·{" "}
                    {p.elevation_deg.toFixed(4)}°
                  </title>
                </circle>
              ))}
              {index >= 0 && (
                <circle
                  className="selected-point"
                  cx={x(index)}
                  cy={y(s.samples[index].elevation_deg)}
                  r="5"
                />
              )}
            </g>
          ))}
          {index >= 0 && (
            <line
              className="date-line"
              x1={x(index)}
              x2={x(index)}
              y1={top}
              y2={bottom}
            />
          )}
          <text x={left} y="265">
            01 jan
          </text>
          <text x={x(181)} y="265" textAnchor="middle">
            01 jul
          </text>
          <text x={right} y="265" textAnchor="end">
            31 dez
          </text>
          <text x="400" y="290" textAnchor="middle">
            Data da amostra (UTC)
          </text>
        </svg>
      </div>
      <p className="map-note">
        Amostras discretas às 00:00 UTC. As linhas apenas conectam pontos
        calculados; não há interpolação. Amostragem diária não determina duração
        contínua de iluminação.
      </p>
    </section>
  );
}
