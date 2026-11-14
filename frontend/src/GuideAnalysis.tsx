import { useEffect, useId, useMemo, useRef, useState } from "react";
import type {
  GuideDataset,
  LocationSelection,
  Selections,
  Slot,
} from "./guide-types";
import { selectedSample } from "./guide-model";
import type { Sample, Target } from "./scientific-data";
import "./guide-analysis.css";

interface Props {
  kind: "data" | "charts";
  dataset: GuideDataset;
  selections: Selections;
  target: Target;
  utc: string;
  timestamps: readonly string[];
  onTargetChange: (target: Target) => void;
}

const slots: Slot[] = ["A", "B"];
const number = (value: number, digits = 2) =>
  value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
const angle = (value: number) => `${value > 0 ? "+" : ""}${number(value)}°`;
const position = (value: number) =>
  value > 0 ? "acima" : value < 0 ? "abaixo" : "no horizonte";
const utcLabel = (utc: string) => {
  const value = new Date(utc);
  return Number.isFinite(value.getTime())
    ? `${new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" }).format(value)} UTC`
    : "Instante inválido";
};

function SelectionNote({
  selection,
  slot,
}: {
  selection: LocationSelection | null;
  slot: Slot;
}) {
  if (!selection)
    return <p className="lg-analysis-empty">Selecione um lugar para {slot}.</p>;
  return (
    <p className="lg-analysis-coordinates">
      {number(selection.latitude, 3)}° latitude ·{" "}
      {number(selection.longitudeEast, 3)}° leste
      <span>
        {selection.sourceSiteId
          ? `Local calculado: ${selection.sourceSiteId}`
          : "Seleção livre · sem resultados calculados"}
      </span>
    </p>
  );
}

function TargetControl({
  target,
  onChange,
}: {
  target: Target;
  onChange: (target: Target) => void;
}) {
  return (
    <fieldset className="lg-analysis-target">
      <legend>Centro aparente de</legend>
      <div>
        <button
          type="button"
          aria-pressed={target === "SUN"}
          onClick={() => onChange("SUN")}
        >
          Sol
        </button>
        <button
          type="button"
          aria-pressed={target === "EARTH"}
          onClick={() => onChange("EARTH")}
        >
          Terra
        </button>
      </div>
    </fieldset>
  );
}

function ScientificLimits({ dataset }: { dataset: GuideDataset }) {
  const provenance = dataset.result?.provenance;
  return (
    <div className="lg-analysis-limits">
      <p>
        <strong>Uma posição, não uma promessa.</strong> Sol acima de 0° não
        informa energia disponível. Terra acima não garante comunicação.
      </p>
      <p>
        Comunicação operacional e blackout de rádio:{" "}
        <strong>não calculados</strong>. Sem relevo, sombras topográficas ou
        avaliação de segurança de pouso.
      </p>
      <details>
        <summary>Fonte, método e limitações</summary>
        <p>
          Efemérides calculadas offline com SPICE e DE421, orientação analítica{" "}
          <code>IAU_MOON</code>, correção <code>CN+S</code>, época{" "}
          <code>OBSERVER</code>. Não são observações diretas.
        </p>
        <p>
          Dois locais hipotéticos, a 0 m sobre uma esfera de raio 1.737.400 m.
          Horizonte tangente idealizado em 0°, sem refração, discos finitos ou
          eclipses. A esfera desenhada é uma ilustração e não um DEM.
        </p>
        <p>
          Azimute: norte local = 0°, leste local = 90°.{" "}
          <strong>Cada local possui sua própria referência de norte.</strong>{" "}
          Subtrair os azimutes de A/B não mede uma separação num céu comum.
        </p>
        <p>
          <strong>Sem validação independente contra JPL Horizons.</strong> A
          comparação da auditoria ficou bloqueada por HTTP 403. Os kernels têm
          hashes registrados; DE421 veio de espelho de terceiros e não foi
          conferido diretamente no servidor NAIF.
        </p>
        <p>
          Amostras discretas, sem interpolação ou extrapolação. Não determinam
          duração contínua exata. Casas decimais exibidas não certificam
          precisão física.
        </p>
        <a
          className="lg-analysis-download"
          href={dataset.downloadUrl}
          download={
            dataset.id === "daily" ? "result-2026.json" : "mvp-b-hourly.json"
          }
        >
          Baixar dados e proveniência completos
        </a>
        {provenance && (
          <details className="lg-analysis-technical">
            <summary>Versões e hashes dos kernels</summary>
            <p>
              Motor {provenance.engine_version} · SpiceyPy{" "}
              {provenance.spiceypy_version} · NumPy {provenance.numpy_version} ·{" "}
              {provenance.cspice_version}
            </p>
            {provenance.kernels.map((kernel) => (
              <div className="lg-analysis-kernel" key={kernel.filename}>
                <strong>{kernel.filename}</strong>
                <code>{kernel.sha256}</code>
                <a href={kernel.url} target="_blank" rel="noreferrer">
                  Fonte registrada de {kernel.filename}
                </a>
              </div>
            ))}
          </details>
        )}
      </details>
    </div>
  );
}

interface Curve {
  slot: Slot;
  samples: (Sample | undefined)[];
}

function SampleChart({
  curves,
  timestamps,
  utc,
  target,
}: {
  curves: Curve[];
  timestamps: readonly string[];
  utc: string;
  target: Target;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(400);
  const values = curves.flatMap((curve) =>
    curve.samples.flatMap((sample) => (sample ? [sample.elevation_deg] : [])),
  );
  const hasChart = timestamps.length > 0 && values.length > 0;
  useEffect(() => {
    if (!hasChart) return;
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const width = container.getBoundingClientRect().width;
      if (width > 0) setChartWidth(Math.max(260, Math.floor(width)));
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(container);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [hasChart]);
  const extent = Math.max(1, Math.ceil(Math.max(0, ...values.map(Math.abs))));
  const left = 50,
    right = chartWidth - 18,
    top = 28,
    bottom = 204;
  const x = (index: number) =>
    left + (index / Math.max(1, timestamps.length - 1)) * (right - left);
  const y = (value: number) =>
    bottom - ((value + extent) / (extent * 2)) * (bottom - top);
  const selectedIndex = timestamps.indexOf(utc);
  const date = (value: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(value));
  function path(samples: (Sample | undefined)[]) {
    let previous = false;
    return samples
      .map((sample, index) => {
        if (!sample) {
          previous = false;
          return "";
        }
        const command = previous ? "L" : "M";
        previous = true;
        return `${command}${x(index)},${y(sample.elevation_deg)}`;
      })
      .join(" ");
  }
  if (timestamps.length === 0)
    return (
      <p className="lg-analysis-empty" role="status">
        Nenhuma amostra disponível neste período.
      </p>
    );
  if (!values.length)
    return (
      <p className="lg-analysis-empty" role="status">
        Não há séries para os locais selecionados. Use os locais demonstrativos
        para comparar resultados calculados.
      </p>
    );
  return (
    <>
      <div className="lg-analysis-chart-legend" aria-label="Legenda do gráfico">
        {curves
          .filter((curve) => curve.samples.some(Boolean))
          .map((curve) => (
            <span
              key={curve.slot}
              className={`lg-analysis-series-${curve.slot.toLowerCase()}`}
            >
              <span aria-hidden="true">
                {curve.slot === "A" ? "● ━" : "◆ ┄"}
              </span>{" "}
              Local {curve.slot}
            </span>
          ))}
        <span>Referência: 0°</span>
      </div>
      <div
        className="lg-analysis-chart-scroll"
        ref={containerRef}
        tabIndex={0}
        role="region"
        aria-label="Gráfico do período completo. Os mesmos valores estão na tabela abaixo."
      >
        <svg
          viewBox={`0 0 ${chartWidth} 264`}
          role="img"
          aria-labelledby={`${titleId} ${descriptionId}`}
        >
          <title id={titleId}>
            Elevação do centro {target === "SUN" ? "do Sol" : "da Terra"} nos
            locais selecionados
          </title>
          <desc id={descriptionId}>
            Elevação em graus no eixo vertical; timestamps UTC no eixo
            horizontal. Pontos são amostras calculadas. Segmentos apenas guiam a
            leitura e não representam cálculos entre amostras. Círculos e linha
            contínua: A; losangos e linha tracejada: B. Horizonte idealizado em
            zero grau. Consulte a tabela para os valores exatos de cada amostra.
          </desc>
          {[-extent, 0, extent].map((value) => (
            <g key={value}>
              <line
                x1={left}
                x2={right}
                y1={y(value)}
                y2={y(value)}
                className={
                  value === 0 ? "lg-analysis-zero" : "lg-analysis-grid"
                }
              />
              <text x={left - 10} y={y(value) + 4} textAnchor="end">
                {value}°
              </text>
            </g>
          ))}
          <text x={left} y={14}>
            Elevação (°)
          </text>
          <text x={right} y={y(0) - 8} textAnchor="end">
            0° idealizado
          </text>
          {curves.map((curve) => (
            <g
              className={`lg-analysis-curve lg-analysis-series-${curve.slot.toLowerCase()}`}
              key={curve.slot}
            >
              <path className="lg-analysis-line" d={path(curve.samples)} />
              {curve.samples.map((sample, index) =>
                sample ? (
                  curve.slot === "A" ? (
                    <circle
                      key={sample.utc}
                      cx={x(index)}
                      cy={y(sample.elevation_deg)}
                      r={selectedIndex === index ? 4 : 1.5}
                    >
                      <title>{`Local ${curve.slot}, ${utcLabel(sample.utc)}: ${angle(sample.elevation_deg)}`}</title>
                    </circle>
                  ) : (
                    <path
                      key={sample.utc}
                      className="lg-analysis-point"
                      d={`M${x(index)},${y(sample.elevation_deg) - (selectedIndex === index ? 4.5 : 2)}l${selectedIndex === index ? 4.5 : 2},${selectedIndex === index ? 4.5 : 2}l-${selectedIndex === index ? 4.5 : 2},${selectedIndex === index ? 4.5 : 2}l-${selectedIndex === index ? 4.5 : 2},-${selectedIndex === index ? 4.5 : 2}Z`}
                    >
                      <title>{`Local ${curve.slot}, ${utcLabel(sample.utc)}: ${angle(sample.elevation_deg)}`}</title>
                    </path>
                  )
                ) : null,
              )}
            </g>
          ))}
          {selectedIndex >= 0 && (
            <line
              className="lg-analysis-current"
              x1={x(selectedIndex)}
              x2={x(selectedIndex)}
              y1={top}
              y2={bottom}
            />
          )}
          <text x={left} y={228}>
            {date(timestamps[0])}
          </text>
          {timestamps.length > 1 && (
            <text x={right} y={228} textAnchor="end">
              {date(timestamps[timestamps.length - 1])}
            </text>
          )}
          <text x={(left + right) / 2} y={253} textAnchor="middle">
            Amostra calculada · UTC
          </text>
        </svg>
      </div>
      <p className="lg-analysis-chart-note">
        {timestamps.length} amostras no período por local coberto. Os segmentos
        ligam somente pontos calculados; não há interpolação. A linha de 0° não
        considera montanhas ou crateras.
      </p>
    </>
  );
}

export function GuideAnalysis({
  kind,
  dataset,
  selections,
  target,
  utc,
  timestamps,
  onTargetChange,
}: Props) {
  const targetName = target === "SUN" ? "do Sol" : "da Terra";
  const activeUtc = timestamps.includes(utc) ? utc : "";
  const curves = useMemo(
    () =>
      kind === "charts"
        ? slots.map((slot) => ({
            slot,
            samples: timestamps.map((timestamp) =>
              selectedSample(dataset, selections[slot], target, timestamp),
            ),
          }))
        : [],
    [kind, dataset, selections, target, timestamps],
  );

  if (dataset.error || !dataset.result)
    return (
      <div className="lg-analysis">
        <div className="lg-analysis-error" role="alert">
          <h3>Dados científicos indisponíveis</h3>
          <p>
            {dataset.error || "Não foi possível validar o conjunto científico."}
          </p>
          <p>Nenhum número substituto será apresentado.</p>
        </div>
      </div>
    );

  return (
    <div className="lg-analysis">
      <TargetControl target={target} onChange={onTargetChange} />
      <p className="lg-analysis-time">
        <time dateTime={utc}>{utcLabel(utc)}</time> ·{" "}
        {activeUtc ? "amostra calculada" : "sem amostra selecionada"}
      </p>
      {!activeUtc && (
        <p role="status" className="lg-analysis-empty">
          Sem amostra neste instante dentro do período da missão. Ajuste Tempo;
          nenhum instante vizinho foi usado.
        </p>
      )}
      {kind === "data" ? (
        <>
          <div className="lg-analysis-readings">
            {slots.map((slot) => {
              const selection = selections[slot];
              const sample = selectedSample(
                dataset,
                selection,
                target,
                activeUtc,
              );
              return (
                <section
                  className={`lg-analysis-reading lg-analysis-series-${slot.toLowerCase()}`}
                  key={slot}
                  aria-label={`Dados do local ${slot}`}
                >
                  <h3>
                    <span aria-hidden="true">{slot === "A" ? "●" : "◆"}</span>{" "}
                    Local {slot}
                  </h3>
                  <SelectionNote selection={selection} slot={slot} />
                  {sample ? (
                    <>
                      <p className="lg-analysis-measure">
                        {angle(sample.elevation_deg)} <span>elevação</span>
                      </p>
                      <p className="lg-analysis-summary">
                        O centro {targetName} está{" "}
                        {position(sample.elevation_deg)}
                        {sample.elevation_deg !== 0
                          ? " do horizonte idealizado"
                          : " idealizado"}
                        .
                      </p>
                    </>
                  ) : (
                    selection && (
                      <p className="lg-analysis-empty">
                        {selection.sourceSiteId
                          ? "Sem amostra para estas coordenadas e este instante."
                          : "Sem resultados para estas coordenadas. Não usamos as séries de outro local."}
                      </p>
                    )
                  )}
                </section>
              );
            })}
          </div>
          <details className="lg-analysis-metrics">
            <summary>Ver ângulos e unidades</summary>
            <div
              className="lg-analysis-table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Valores numéricos do instante selecionado"
            >
              <table>
                <caption>
                  Centro {targetName} · {utcLabel(utc)}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Local</th>
                    <th scope="col">Elevação (°)</th>
                    <th scope="col">Azimute local (°)</th>
                  </tr>
                </thead>
                <tbody>
                  {slots.map((slot) => {
                    const sample = selectedSample(
                      dataset,
                      selections[slot],
                      target,
                      activeUtc,
                    );
                    return (
                      <tr key={slot}>
                        <th scope="row">{slot}</th>
                        <td>
                          {sample
                            ? angle(sample.elevation_deg)
                            : "Sem resultado"}
                        </td>
                        <td>
                          {sample
                            ? `${number(sample.azimuth_deg)}°`
                            : "Sem resultado"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <>
          <h3 className="lg-analysis-chart-title">
            Elevação do centro {targetName}
          </h3>
          <SampleChart
            curves={curves}
            timestamps={timestamps}
            utc={utc}
            target={target}
          />
          <div className="lg-analysis-counts">
            {curves.map((curve) => {
              const samples = curve.samples.filter(
                (sample): sample is Sample => !!sample,
              );
              return (
                <p key={curve.slot}>
                  <strong>Local {curve.slot}:</strong>{" "}
                  {samples.length
                    ? `${samples.filter((sample) => sample.elevation_deg > 0).length} de ${samples.length} amostras com o centro acima de 0°.`
                    : "Sem resultados neste período."}
                </p>
              );
            })}
            <p>
              Contar amostras não mede duração contínua de iluminação ou
              contato.
            </p>
          </div>
          <details className="lg-analysis-metrics">
            <summary>Consultar amostras em tabela</summary>
            <div
              className="lg-analysis-table-scroll lg-analysis-period-table"
              tabIndex={0}
              role="region"
              aria-label="Tabela de elevações por timestamp UTC"
            >
              <table>
                <caption>
                  Elevação do centro {targetName}, em graus · mesmo instante nos
                  dois locais
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Amostra (UTC)</th>
                    <th scope="col">Local A (°)</th>
                    <th scope="col">Local B (°)</th>
                  </tr>
                </thead>
                <tbody>
                  {timestamps.map((timestamp, index) => (
                    <tr
                      key={timestamp}
                      aria-current={timestamp === utc ? "true" : undefined}
                    >
                      <th scope="row">{utcLabel(timestamp)}</th>
                      {curves.map((curve) => (
                        <td key={curve.slot}>
                          {curve.samples[index]
                            ? angle(curve.samples[index]!.elevation_deg)
                            : "Sem resultado"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {timestamps.length === 0 && <p>Nenhuma amostra neste período.</p>}
            </div>
          </details>
        </>
      )}
      <ScientificLimits dataset={dataset} />
    </div>
  );
}
