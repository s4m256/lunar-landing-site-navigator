import {
  Component,
  lazy,
  Suspense,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import rawResult from "../../../docs/audits/pr4/result-2026.json?raw";
import {
  DEMO_TIMESTAMPS,
  getSample,
  parseDemoResult,
  type Sample,
} from "../scientific-data";
import { ExplorerInfo } from "./ExplorerInfo";
import "./explorer.css";

const LunarScene = lazy(() => import("./LunarScene"));
const SITE_ID = "south-a";
const angle = (value: number) => `${value.toFixed(2)}°`;

class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p className="explorer-scene-loading" role="status">
        A vista não pôde ser carregada. As posições do Sol e da Terra continuam
        disponíveis em texto.
      </p>
    ) : (
      this.props.children
    );
  }
}

function HorizonState({ sample }: { sample: Sample }) {
  const position =
    sample.elevation_deg > 0
      ? "acima"
      : sample.elevation_deg < 0
        ? "abaixo"
        : "no";
  return (
    <span>
      Centro {position} {position === "no" ? "" : "do "}horizonte idealizado
    </span>
  );
}

function TargetReadout({
  target,
  sample,
}: {
  target: "sun" | "earth";
  sample?: Sample;
}) {
  const isSun = target === "sun";
  const name = isSun ? "Sol" : "Terra";
  return (
    <article
      className={`explorer-readout explorer-readout-${target}`}
      aria-labelledby={`${target}-heading`}
    >
      <div className="explorer-readout-title">
        <span className="explorer-target-symbol" aria-hidden="true">
          {isSun ? "☀" : "◉"}
        </span>
        <div>
          <p className="explorer-kicker">
            {isSun ? "Iluminação" : "Comunicação direta"}
          </p>
          <h2 id={`${target}-heading`}>{name}</h2>
        </div>
      </div>
      {sample ? (
        <>
          <dl className="explorer-measurements">
            <div>
              <dt>Elevação</dt>
              <dd>{angle(sample.elevation_deg)}</dd>
            </div>
            <div>
              <dt>Azimute</dt>
              <dd>{angle(sample.azimuth_deg)}</dd>
            </div>
          </dl>
          <p className="explorer-horizon-state">
            <HorizonState sample={sample} />
          </p>
        </>
      ) : (
        <p className="explorer-missing-sample">Sem amostra para esta data.</p>
      )}
      <p className="explorer-readout-help">
        {isSun
          ? "A direção do Sol ajuda a entender o acesso à luz."
          : "A direção da Terra ajuda a entender a linha de visada."}
      </p>
    </article>
  );
}

export function MinimalExplorer({ source = rawResult }: { source?: string }) {
  const loaded = useMemo(() => {
    try {
      return { result: parseDemoResult(JSON.parse(source)) };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Dataset inválido.",
      };
    }
  }, [source]);
  const [date, setDate] = useState("2026-01-01");
  const [resetToken, setResetToken] = useState(0);
  const [informationOpen, setInformationOpen] = useState(false);
  const [terrainStatus, setTerrainStatus] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  const infoButton = useRef<HTMLButtonElement>(null);
  const utc = `${date}T00:00:00.000Z`;
  const available = DEMO_TIMESTAMPS.includes(utc);
  const result = loaded.result;
  const sun =
    result && available ? getSample(result, SITE_ID, "SUN", utc) : undefined;
  const earth =
    result && available ? getSample(result, SITE_ID, "EARTH", utc) : undefined;

  return (
    <main className="minimal-explorer" aria-labelledby="explorer-title">
      <header className="explorer-header">
        <div className="explorer-brand">
          <span className="explorer-brand-mark" aria-hidden="true">
            ◒
          </span>
          <div>
            <h1 id="explorer-title">LUNAR</h1>
            <p>Landing Site Navigator</p>
          </div>
        </div>
        <div className="explorer-location">
          <p>
            <span className="explorer-location-dot" aria-hidden="true" />
            Local A <span>· Polo sul</span>
          </p>
          <p>
            89,5° S · 0° E{" "}
            <span className="explorer-location-kind">/ local hipotético</span>
          </p>
        </div>
      </header>

      <section
        className="explorer-workspace"
        aria-label="Exploração do local lunar"
      >
        <div
          className="explorer-toolbar"
          role="group"
          aria-label="Controles de exploração"
        >
          <div className="explorer-date-control">
            <label htmlFor="explorer-date">Data da amostra (UTC)</label>
            <div className="explorer-date-row">
              <input
                id="explorer-date"
                type="date"
                min="2026-01-01"
                max="2026-12-31"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                aria-invalid={!available}
                aria-describedby="explorer-time"
              />
              <span id="explorer-time">00:00 UTC</span>
            </div>
          </div>
          <button
            className="explorer-tool-button"
            type="button"
            onClick={() => setResetToken((token) => token + 1)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Recentrar
          </button>
          <button
            ref={infoButton}
            className="explorer-tool-button"
            type="button"
            aria-haspopup="dialog"
            onClick={() => setInformationOpen(true)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v6m0-10v1" />
            </svg>
            Informações
          </button>
        </div>

        <div className="explorer-scene-stage">
          {loaded.error ? (
            <div className="explorer-data-error" role="alert">
              <span aria-hidden="true">◇</span>
              <h2>Dados científicos indisponíveis</h2>
              <p>{loaded.error}</p>
              <p>Nenhum resultado será apresentado.</p>
            </div>
          ) : (
            <SceneBoundary>
              <Suspense
                fallback={
                  <p className="explorer-scene-loading">
                    Preparando a vista lunar…
                  </p>
                }
              >
                <LunarScene
                  sun={sun}
                  earth={earth}
                  resetToken={resetToken}
                  onTerrainStatus={setTerrainStatus}
                />
              </Suspense>
            </SceneBoundary>
          )}
        </div>

        <div className="explorer-bottom">
          <div className="explorer-scene-caption">
            <p>Um local. Duas direções.</p>
            <span>
              {terrainStatus === "ready"
                ? "Relevo contextual LOLA · horizonte idealizado"
                : terrainStatus === "loading"
                  ? "Preparando relevo contextual · horizonte idealizado"
                  : "Relevo indisponível · superfície idealizada"}
            </span>
          </div>
          <div
            className="explorer-readouts"
            aria-label="Posições aparentes do Sol e da Terra"
          >
            <TargetReadout target="sun" sample={sun} />
            <TargetReadout target="earth" sample={earth} />
          </div>
          <p className="explorer-scope-note">
            Geometria dos centros dos astros. Não determina energia gerada ou
            disponibilidade de comunicação.
          </p>
        </div>
      </section>

      <p className="explorer-sr-only" role="status" aria-atomic="true">
        {loaded.error
          ? "Dados científicos indisponíveis."
          : sun && earth
            ? `Amostra ${utc}. Elevação do Sol ${angle(sun.elevation_deg)}. Elevação da Terra ${angle(earth.elevation_deg)}.`
            : "Sem amostra. Escolha uma data de 1 de janeiro a 31 de dezembro de 2026."}
      </p>
      {informationOpen && (
        <ExplorerInfo
          result={result}
          onClose={() => setInformationOpen(false)}
          returnFocus={infoButton}
        />
      )}
    </main>
  );
}
