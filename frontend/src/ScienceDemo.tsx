import { useState } from "react";
import rawResult from "../../docs/audits/pr4/result-2026.json?raw";
import resultUrl from "../../docs/audits/pr4/result-2026.json?url";
import {
  DEMO_SITES,
  DEMO_TIMESTAMPS,
  getSample,
  parseDemoResult,
  siteLabel,
  type DemoResult,
  type Target,
} from "./scientific-data";
import { PolarMap } from "./PolarMap";
import { ElevationChart } from "./ElevationChart";

const format = (n: number) => n.toFixed(4);

export function ScienceDemo({ source = rawResult }: { source?: string }) {
  const [loaded] = useState<{ result: DemoResult } | { error: string }>(() => {
    try {
      return { result: parseDemoResult(JSON.parse(source)) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Dataset inválido." };
    }
  });
  const [date, setDate] = useState("2026-01-01");
  const [target, setTarget] = useState<Target>("SUN");
  const utc = `${date}T00:00:00.000Z`;
  const available = DEMO_TIMESTAMPS.includes(utc);
  return (
    <>
      <header className="header">
        <a className="brand" href="#top">
          <span className="brand-mark" aria-hidden="true">
            ◒
          </span>
          <span>
            LUNAR<span className="brand-sub">LANDING SITE NAVIGATOR</span>
          </span>
        </a>
        <nav aria-label="Navegação principal">
          <a href="#comparison-title">Comparar</a>
          <a href="#provenance">Fontes e limites</a>
        </nav>
        <span className="header-tag">ARI / MVP A</span>
      </header>
      <main id="top">
        <section className="hero" aria-labelledby="title">
          <div>
            <p className="eyebrow">GEOMETRIA LUNAR / DEMONSTRAÇÃO 2026</p>
            <h1 id="title">
              Lunar Landing Site Navigator
              <span>Dois locais. Um mesmo céu.</span>
            </h1>
            <p className="hero-copy">
              Compare a posição aparente dos centros do Sol e da Terra em dois
              locais hipotéticos próximos ao polo sul lunar.
            </p>
          </div>
          <div className="moon" aria-hidden="true" />
          <span className="moon-label">LUA / ILUSTRAÇÃO</span>
        </section>
        <aside className="notice science-notice">
          <span aria-hidden="true">◇</span>
          <div>
            <strong>
              Efemérides calculadas com SPICE, não observações diretas.
            </strong>
            <p>
              Modelo geométrico idealizado. Não avalia iluminação efetiva,
              qualidade de comunicação ou segurança de pouso.
            </p>
            <p>
              <strong>
                Sem validação independente contra JPL Horizons — comparação
                bloqueada por HTTP 403.
              </strong>
            </p>
          </div>
        </aside>
        {"error" in loaded ? (
          <section className="panel dataset-error" role="alert">
            <h2>Não foi possível carregar o dataset científico</h2>
            <p>{loaded.error}</p>
            <p>
              Nenhum resultado será apresentado. Verifique o artefato e o
              contrato analysis-result 1.0.0.
            </p>
          </section>
        ) : (
          <>
            <div className="workspace science-workspace">
              <aside
                className="panel planner"
                aria-label="Controles da demonstração científica"
              >
                <p className="eyebrow">01 / EXPLORAR</p>
                <h2>Uma amostra, dois locais</h2>
                <p className="muted">
                  Locais hipotéticos, sem recomendação de pouso. Resultados
                  apenas para as coordenadas abaixo.
                </p>
                <div className="demo-sites">
                  {DEMO_SITES.map((site, i) => (
                    <article key={site.id} className={`demo-site site-${i}`}>
                      <h3>
                        {siteLabel(site.id)} <small>{site.id}</small>
                      </h3>
                      <p>Latitude planetocêntrica: {site.latitude_deg}°</p>
                      <p>Longitude leste: {site.longitude_east_deg}°</p>
                      <p>Altura sobre a esfera: {site.height_m} m</p>
                    </article>
                  ))}
                </div>
                <label htmlFor="sample-date">Data da amostra (UTC)</label>
                <input
                  id="sample-date"
                  type="date"
                  min="2026-01-01"
                  max="2026-12-31"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  aria-describedby="sample-help"
                />
                <p id="sample-help" className="field-help">
                  365 datas disponíveis, sempre às 00:00 UTC. Intervalo final
                  exclusivo: 01/01/2027. Sem interpolação.
                </p>
                <fieldset className="target-control">
                  <legend>Alvo aparente</legend>
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
                <p className="field-help">
                  Azimute: norte = 0°, leste = 90°. Elevação: ângulo do centro
                  do alvo em relação ao horizonte geométrico de 0°.
                </p>
              </aside>
              <div className="visuals">
                <section
                  className="panel map-panel"
                  aria-labelledby="map-title"
                >
                  <div className="section-top">
                    <div>
                      <p className="eyebrow">LOCAIS / IAU_MOON</p>
                      <h2 id="map-title">Próximos ao polo sul</h2>
                    </div>
                    <span className="badge">Posições fixas</span>
                  </div>
                  <PolarMap />
                  <p className="map-note">
                    Mapa polar esquemático, sem relevo. Anéis indicam latitude;
                    distância radial proporcional ao afastamento angular do polo
                    sul. Os dois locais são comparados abaixo.
                  </p>
                </section>
                <section
                  className="panel numeric-comparison"
                  aria-labelledby="comparison-title"
                >
                  <div className="section-top">
                    <div>
                      <p className="eyebrow">02 / COMPARAR</p>
                      <h2 id="comparison-title">
                        Centro {target === "SUN" ? "do Sol" : "da Terra"} ·
                        mesmo instante
                      </h2>
                    </div>
                    <span className="badge">Graus (°)</span>
                  </div>
                  {available ? (
                    <>
                      <p className="sample-time" role="status">
                        <time dateTime={utc}>{utc}</time> · amostra calculada
                      </p>
                      <div className="table-scroll">
                        <table>
                          <caption>
                            Azimute e elevação do centro{" "}
                            {target === "SUN" ? "do Sol" : "da Terra"}, por
                            local
                          </caption>
                          <thead>
                            <tr>
                              <th scope="col">Local</th>
                              <th scope="col">Azimute (°)</th>
                              <th scope="col">Elevação (°)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {DEMO_SITES.map((site) => {
                              const sample = getSample(
                                loaded.result,
                                site.id,
                                target,
                                utc,
                              )!;
                              return (
                                <tr key={site.id}>
                                  <th scope="row">
                                    {siteLabel(site.id)}
                                    <small>{site.id}</small>
                                  </th>
                                  <td>{format(sample.azimuth_deg)}°</td>
                                  <td>{format(sample.elevation_deg)}°</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <p className="map-note">
                        Exibição arredondada a 4 casas decimais; os dígitos não
                        certificam precisão física. Valores completos no JSON.
                      </p>
                    </>
                  ) : (
                    <p role="status" className="no-data">
                      Sem amostra para esta data. Escolha uma data de 2026;
                      nenhum resultado foi interpolado ou extrapolado.
                    </p>
                  )}
                </section>
              </div>
            </div>
            <ElevationChart result={loaded.result} target={target} utc={utc} />
            <section
              className="panel provenance"
              id="provenance"
              aria-labelledby="provenance-title"
            >
              <div className="section-top">
                <div>
                  <p className="eyebrow">03 / ENTENDER OS LIMITES</p>
                  <h2 id="provenance-title">Fonte, hipóteses e proveniência</h2>
                </div>
                <a
                  className="download"
                  href={resultUrl}
                  download="result-2026.json"
                >
                  Baixar JSON completo ↓
                </a>
              </div>
              <div className="provenance-body">
                <p>
                  <strong>
                    SPICE offline → JSON validado → site estático.
                  </strong>{" "}
                  Nenhum Python executa no navegador. Contrato analysis-result{" "}
                  {loaded.result.schema_version}; quatro séries, 365 instantes
                  por série, passo de 86.400 s neste conjunto.
                </p>
                <ul>
                  <li>
                    Superfície esférica idealizada, raio de 1.737.400 m, altura
                    radial de 0 m nos dois locais. Orientação analítica{" "}
                    <strong>IAU_MOON</strong>; correção <strong>CN+S</strong>,
                    época do referencial OBSERVER.
                  </li>
                  <li>
                    Horizonte tangente de 0°: sem relevo, sombras de
                    montanhas/crateras, refração, disco finito ou eclipses.
                  </li>
                  <li>
                    Elevação do Sol não é iluminação efetiva de painéis nem
                    geração de energia. Elevação da Terra não garante
                    comunicação ou qualidade de enlace.
                  </li>
                  <li>
                    Não avalia segurança, adequação ou ranking de pouso.
                    Amostras diárias não medem duração contínua de iluminação.
                  </li>
                  <li>
                    DE421 distribuído por espelho de terceiros
                    (skyfield-data/PyPI), com hashes registrados; não verificado
                    diretamente no servidor NAIF. Completude atual da tabela de
                    leap seconds e precisão física não foram certificadas.
                  </li>
                  <li>
                    <strong>
                      Não validado independentemente contra Horizons.
                    </strong>{" "}
                    A auditoria registra HTTP 403 e zero amostras comparadas.
                    Consistência algébrica não é certificação de precisão
                    física.
                  </li>
                </ul>
                <details>
                  <summary>Versões, kernels e hashes SHA-256</summary>
                  <p>
                    Motor {loaded.result.provenance.engine_version} · SpiceyPy{" "}
                    {loaded.result.provenance.spiceypy_version} · NumPy{" "}
                    {loaded.result.provenance.numpy_version} ·{" "}
                    {loaded.result.provenance.cspice_version}
                  </p>
                  {loaded.result.provenance.kernels.map((k) => (
                    <article className="kernel" key={k.filename}>
                      <strong>
                        {k.filename} ({k.type})
                      </strong>
                      <code>{k.sha256}</code>
                      <a href={k.url} target="_blank" rel="noreferrer">
                        Fonte registrada ↗
                      </a>
                    </article>
                  ))}
                  <p>{loaded.result.provenance.time_scale}</p>
                  <p>{loaded.result.provenance.azimuth_convention}</p>
                  <ul>
                    {loaded.result.provenance.limitations.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </details>
              </div>
            </section>
          </>
        )}
        <footer>
          <span>◒ ARI / NASA SPACE APPS CHALLENGE 2026</span>
          <span>Demonstração geométrica · sem vínculo oficial com a NASA</span>
        </footer>
      </main>
    </>
  );
}
