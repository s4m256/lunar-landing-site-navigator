import { useState } from "react";
import raw from "../../docs/data/mvp-b-hourly.json?raw";
import download from "../../docs/data/mvp-b-hourly.json?url";
import {
  HOURLY_TIMES,
  parseHourlyResult,
  sampledTransitions,
  type HourlyResult,
} from "./hourly-data";
import {
  DEMO_SITES,
  getSample,
  siteLabel,
  type Target,
} from "./scientific-data";
import { PolarMap } from "./PolarMap";

const utcLabel = (utc: string) =>
  utc.replace("T", " ").replace(".000Z", " UTC");

export function HourlyVisibility({ source = raw }: { source?: string }) {
  const [loaded] = useState<{ data: HourlyResult } | { error: string }>(() => {
    try {
      return { data: parseHourlyResult(JSON.parse(source)) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Dataset inválido." };
    }
  });
  const [date, setDate] = useState("2026-11-15");
  const [hour, setHour] = useState("00");
  const [target, setTarget] = useState<Target>("SUN");
  const utc = `${date}T${hour}:00:00.000Z`;
  const index = HOURLY_TIMES.indexOf(utc);
  const targetLabel = target === "SUN" ? "do Sol" : "da Terra";
  return (
    <>
      <header className="header">
        <a className="brand" href="#hourly-top">
          <span className="brand-mark" aria-hidden="true">
            ◒
          </span>
          <span>
            LUNAR<span className="brand-sub">LANDING SITE NAVIGATOR</span>
          </span>
        </a>
        <span className="header-tag">ARI / MVP B</span>
      </header>
      <main id="hourly-top">
        <section className="hero hourly-hero">
          <div>
            <p className="eyebrow">15 NOV → 15 DEZ 2026 / UTC</p>
            <h1>
              Visibilidade lunar por hora
              <span>O centro do alvo acima do horizonte.</span>
            </h1>
            <p className="hero-copy">
              Mesmos dois locais do MVP A. Efemérides SPICE a cada hora;
              comparação de amostras, sem interpolação temporal.
            </p>
          </div>
        </section>
        <aside className="notice">
          <div>
            <strong>
              721 timestamps · 720 intervalos horários · 720 horas entre
              extremos.
            </strong>
            <p>
              Inclui 15/11/2026 00:00 e 15/12/2026 00:00 UTC. Estados entre
              amostras não foram calculados.
            </p>
          </div>
        </aside>
        {"error" in loaded ? (
          <section className="panel dataset-error" role="alert">
            <h2>Dataset horário indisponível</h2>
            <p>{loaded.error}</p>
            <p>Nenhum número substituto será apresentado.</p>
          </section>
        ) : (
          <>
            <aside className="notice terrain-unavailable" role="note">
              <div>
                <strong>
                  Horizonte topográfico desativado — LOLA não obtido e
                  verificado.
                </strong>
                <p>{loaded.data.topography.reason}</p>
                <p>
                  Os resultados abaixo usam exclusivamente o horizonte
                  idealizado de 0° do MVP A. Não há perfil de terreno, altura
                  topográfica nem comparação de relevo real disponível. A
                  compatibilidade IAU_MOON ↔ MOON_ME não foi estabelecida para
                  um DEM.
                </p>
              </div>
            </aside>
            <div className="workspace science-workspace">
              <aside className="panel planner">
                <p className="eyebrow">01 / SELECIONAR</p>
                <h2>Instante exato em UTC</h2>
                <label htmlFor="hourly-date">Data (UTC)</label>
                <input
                  id="hourly-date"
                  type="date"
                  min="2026-11-15"
                  max="2026-12-15"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                <label htmlFor="hourly-hour">Hora (UTC)</label>
                <select
                  id="hourly-hour"
                  value={hour}
                  onChange={(e) => setHour(e.target.value)}
                >
                  {Array.from({ length: 24 }, (_, i) =>
                    String(i).padStart(2, "0"),
                  ).map((h) => (
                    <option
                      key={h}
                      value={h}
                      disabled={date === "2026-12-15" && h !== "00"}
                    >
                      {h}:00 UTC
                    </option>
                  ))}
                </select>
                <p className="field-help">
                  Em 15/12 há somente 00:00. Escolher um instante sem cobertura
                  não seleciona automaticamente a hora vizinha.
                </p>
                <fieldset className="target-control">
                  <legend>Centro aparente</legend>
                  <div className="segmented">
                    <button
                      aria-pressed={target === "SUN"}
                      onClick={() => setTarget("SUN")}
                    >
                      Sol
                    </button>
                    <button
                      aria-pressed={target === "EARTH"}
                      onClick={() => setTarget("EARTH")}
                    >
                      Terra
                    </button>
                  </div>
                </fieldset>
                <div className="demo-sites">
                  {DEMO_SITES.map((site, i) => (
                    <article key={site.id} className={`demo-site site-${i}`}>
                      <h3>
                        {siteLabel(site.id)} <small>{site.id}</small>
                      </h3>
                      <p>Latitude planetocêntrica: {site.latitude_deg}°</p>
                      <p>Longitude leste: {site.longitude_east_deg}°</p>
                      <p>Altura radial: 0 m na esfera, sem altitude LOLA.</p>
                    </article>
                  ))}
                </div>
                <PolarMap />
              </aside>
              <div className="visuals">
                <section className="panel numeric-comparison">
                  <div className="section-top">
                    <div>
                      <p className="eyebrow">02 / COMPARAR</p>
                      <h2>Centro {targetLabel} · mesmo instante</h2>
                    </div>
                  </div>
                  {index < 0 ? (
                    <p role="status" className="no-data">
                      Sem amostra para este instante. Selecione uma hora
                      coberta; não há interpolação nem extrapolação.
                    </p>
                  ) : (
                    <>
                      <p className="sample-time" role="status">
                        <time dateTime={utc}>{utcLabel(utc)}</time>
                      </p>
                      <div className="table-scroll">
                        <table>
                          <caption>
                            Posição aparente e visibilidade amostrada do centro{" "}
                            {targetLabel}
                          </caption>
                          <thead>
                            <tr>
                              <th scope="col">Local</th>
                              <th scope="col">Azimute (°)</th>
                              <th scope="col">Elevação (°)</th>
                              <th scope="col">Idealizado 0°</th>
                              <th scope="col">Topográfico</th>
                            </tr>
                          </thead>
                          <tbody>
                            {DEMO_SITES.map((site) => {
                              const sample = getSample(
                                loaded.data.analysis,
                                site.id,
                                target,
                                utc,
                              )!;
                              return (
                                <tr key={site.id}>
                                  <th scope="row">{siteLabel(site.id)}</th>
                                  <td>{sample.azimuth_deg.toFixed(4)}°</td>
                                  <td>{sample.elevation_deg.toFixed(4)}°</td>
                                  <td>
                                    {sample.elevation_deg > 0
                                      ? "Acima"
                                      : "Não acima"}
                                  </td>
                                  <td>Indisponível</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                  <p className="map-note">
                    “Acima” significa elevação do centro estritamente maior que
                    0°. Igualdade não é visibilidade. Arredondamento visual não
                    altera o teste e não certifica precisão física. Azimute:
                    norte = 0°, leste = 90°.
                  </p>
                </section>
                <section className="panel">
                  <div className="section-top">
                    <h2>Janelas amostradas, lado a lado</h2>
                  </div>
                  <p className="map-note">
                    Cada traço representa um timestamp. Verde: centro acima de
                    0°; cinza: não acima. Não representa duração contínua de luz
                    ou comunicação.
                  </p>
                  <div
                    className="chart-scroll"
                    role="region"
                    tabIndex={0}
                    aria-label="Visibilidade horária com rolagem horizontal"
                  >
                    <svg
                      className="hourly-chart"
                      viewBox="0 0 820 225"
                      role="img"
                      aria-label="Amostras horárias do Sol e da Terra nos locais A e B, horizonte idealizado zero graus"
                    >
                      <title>721 estados calculados por local e alvo</title>
                      {DEMO_SITES.flatMap((site, si) =>
                        (["SUN", "EARTH"] as const).map((t, ti) => {
                          const row = si * 2 + ti,
                            y = 28 + row * 42,
                            v = loaded.data.visibility.find(
                              (v) => v.site_id === site.id && v.target === t,
                            )!;
                          return (
                            <g key={`${site.id}/${t}`}>
                              <text x="10" y={y + 7}>
                                {siteLabel(site.id)} ·{" "}
                                {t === "SUN" ? "Sol" : "Terra"}
                              </text>
                              {v.ideal_visible.map((flag, i) => (
                                <line
                                  key={i}
                                  x1={130 + (i / 720) * 665}
                                  x2={130 + (i / 720) * 665}
                                  y1={y - 6}
                                  y2={y + 12}
                                  stroke={flag ? "#b5e9d4" : "#344653"}
                                  strokeWidth=".8"
                                />
                              ))}
                            </g>
                          );
                        }),
                      )}
                      {index >= 0 && (
                        <line
                          className="date-line"
                          x1={130 + (index / 720) * 665}
                          x2={130 + (index / 720) * 665}
                          y1="10"
                          y2="181"
                        />
                      )}
                      <text x="130" y="204">
                        15 nov 00:00
                      </text>
                      <text x="795" y="204" textAnchor="end">
                        15 dez 00:00
                      </text>
                      <text x="460" y="223" textAnchor="middle">
                        Timestamp (UTC) · passo 1 h
                      </text>
                    </svg>
                  </div>
                  <p className="map-note">
                    Em telas estreitas, deslize o gráfico. A linha vertical
                    marca apenas o instante selecionado.
                  </p>
                  <div className="sample-counts">
                    {DEMO_SITES.map((site) => {
                      const v = loaded.data.visibility.find(
                        (v) => v.site_id === site.id && v.target === target,
                      )!;
                      return (
                        <p key={site.id}>
                          <strong>{siteLabel(site.id)}:</strong>{" "}
                          {v.ideal_visible.filter(Boolean).length} de 721
                          amostras com o centro {targetLabel} acima de 0°.
                        </p>
                      );
                    })}
                  </div>
                </section>
              </div>
            </div>
            <section className="panel provenance">
              <div className="section-top">
                <h2>Mudanças entre amostras</h2>
              </div>
              <div className="provenance-body">
                <p>
                  Os pares abaixo delimitam mudanças detectadas entre estados
                  consecutivos separados por 1 hora. O horário exato da
                  transição não foi calculado; outras mudanças dentro do
                  intervalo podem não ser detectadas. Não somamos timestamps
                  como se fossem intervalos.
                </p>
                <div className="transition-columns">
                  {DEMO_SITES.map((site) => {
                    const v = loaded.data.visibility.find(
                      (v) => v.site_id === site.id && v.target === target,
                    )!;
                    const transitions = sampledTransitions(
                      v.ideal_visible,
                      HOURLY_TIMES,
                    );
                    return (
                      <article key={site.id}>
                        <h3>
                          {siteLabel(site.id)} · centro {targetLabel}
                        </h3>
                        {transitions.length ? (
                          <ul>
                            {transitions.map((t) => (
                              <li key={t.to}>
                                <time dateTime={t.from}>
                                  {utcLabel(t.from)}
                                </time>{" "}
                                → <time dateTime={t.to}>{utcLabel(t.to)}</time>:{" "}
                                {t.becomesVisible
                                  ? "passou a acima"
                                  : "passou a não acima"}{" "}
                                entre essas amostras.
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>
                            Nenhuma mudança detectada nas amostras; não é
                            garantia de estado contínuo.
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>
            <section className="panel provenance">
              <div className="section-top">
                <h2>Proveniência e limites</h2>
                <a
                  className="download"
                  href={download}
                  download="mvp-b-hourly.json"
                >
                  Baixar dataset e proveniência ↓
                </a>
              </div>
              <div className="provenance-body">
                <p>
                  SPICE offline, DE421 de espelho skyfield-data/PyPI, IAU_MOON,
                  CN+S, época OBSERVER. Mesma esfera de raio 1.737.400 m do MVP
                  A; altura radial 0 m. Não é MOON_ME de um produto LOLA
                  validado. Não há Python em produção.
                </p>
                <p>
                  <strong>Sem validação independente contra Horizons.</strong>{" "}
                  Não há alegação de precisão física certificada nem verificação
                  primária NAIF. Visibilidade do centro solar não é geração de
                  energia nem iluminação total do terreno. Visibilidade do
                  centro terrestre não garante comunicação operacional.
                </p>
                <p>
                  Aquisição do DEM falhou antes da conferência de metadados,
                  projeção, referência vertical e hashes. Os testes topográficos
                  analíticos/sintéticos são testes de software separados: não
                  são perfis destes locais nem dados lunares observados.
                </p>
                <details>
                  <summary>Versões e hashes dos kernels usados</summary>
                  <p>
                    Motor {loaded.data.analysis.provenance.engine_version} ·
                    SpiceyPy {loaded.data.analysis.provenance.spiceypy_version}{" "}
                    · NumPy {loaded.data.analysis.provenance.numpy_version} ·{" "}
                    {loaded.data.analysis.provenance.cspice_version}
                  </p>
                  {loaded.data.analysis.provenance.kernels.map((k) => (
                    <article className="kernel" key={k.filename}>
                      <strong>{k.filename}</strong>
                      <code>{k.sha256}</code>
                      <a href={k.url} target="_blank" rel="noreferrer">
                        Fonte registrada ↗
                      </a>
                    </article>
                  ))}
                </details>
              </div>
            </section>
          </>
        )}
        <footer>
          <span>ARI / MVP B · horizonte real indisponível</span>
          <span>Dados calculados, não observações diretas</span>
        </footer>
      </main>
    </>
  );
}
