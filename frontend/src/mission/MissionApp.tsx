import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  GuidePortrait,
  PolarMissionMap,
  RocketIllustration,
} from "./MissionArt";
import { HorizonDiagram } from "./HorizonDiagram";
import { MissionDialogue, WELCOME_DIALOGUE } from "./MissionDialogue";
import {
  DEFAULT_MISSION_DATE,
  MISSION_AUDIT,
  MISSION_DATES,
  MISSION_PROVENANCE,
  MISSION_SITES,
  getMissionAnalysis,
} from "./mission-data";
import type {
  MissionAnalysis,
  MissionDirection,
  MissionStage,
  TargetName,
} from "./types";
import "./mission.css";

const targetLabels: Record<TargetName, string> = { sun: "Sol", earth: "Terra" };

function Arrow({
  direction = "up-right",
}: {
  direction?: "up-right" | "up-left" | "down";
}) {
  const path =
    direction === "down"
      ? "M12 4v16m-6-6 6 6 6-6"
      : direction === "up-left"
        ? "M19 19 5 5M5 19V5h14"
        : "M5 19 19 5M5 5h14v14";
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  );
}

function formatAngle(value: number) {
  return `${value.toFixed(1).replace(".", ",")}°`;
}

function validDirection(direction: MissionDirection) {
  return (
    direction &&
    Number.isFinite(direction.elevationDeg) &&
    Number.isFinite(direction.azimuthDeg) &&
    Math.abs(direction.elevationDeg) <= 90 &&
    direction.azimuthDeg >= 0 &&
    direction.azimuthDeg < 360 &&
    direction.state ===
      (direction.elevationDeg > 0
        ? "above"
        : direction.elevationDeg < 0
          ? "below"
          : "on-horizon")
  );
}

function directionLabel(direction: MissionDirection) {
  if (direction.elevationDeg > 0) return "Acima do horizonte";
  if (direction.elevationDeg < 0) return "Abaixo do horizonte";
  return "No horizonte";
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

export function MissionApp() {
  const [stage, setStage] = useState<MissionStage>("briefing");
  const [selectedSiteId, setSelectedSiteId] = useState<string>();
  const [selectionRevision, setSelectionRevision] = useState(0);
  const [date, setDate] = useState(DEFAULT_MISSION_DATE);
  const [target, setTarget] = useState<TargetName>("sun");
  const [visitedSiteIds, setVisitedSiteIds] = useState<string[]>([]);
  const [discovered, setDiscovered] = useState(false);
  const [dialog, setDialog] = useState<"about" | "bonus" | null>(null);
  const [auditUrl, setAuditUrl] = useState<string>();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mapHeadingRef = useRef<HTMLHeadingElement>(null);
  const analysisPanelRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const previousStage = useRef(stage);
  const reducedMotion = useReducedMotion();

  const result = useMemo((): { analysis?: MissionAnalysis; error?: string } => {
    if (!selectedSiteId) return {};
    try {
      const analysis = getMissionAnalysis(selectedSiteId, date);
      if (
        !analysis ||
        !validDirection(analysis.sun) ||
        !validDirection(analysis.earth) ||
        analysis.site.id !== selectedSiteId ||
        !analysis.utc.startsWith(date)
      ) {
        throw new Error("Dados indisponíveis");
      }
      return { analysis };
    } catch {
      return {
        error:
          "Não foi possível carregar os dados deste local e desta data. Escolha outra opção para continuar.",
      };
    }
  }, [selectedSiteId, date]);
  const analysis = result.analysis;
  const meetsGoal =
    !!analysis &&
    analysis.sun.elevationDeg > 0 &&
    analysis.earth.elevationDeg > 0;
  const dateLabel =
    MISSION_DATES.find((item) => item.value === date)?.label ?? date;

  useEffect(() => {
    if (previousStage.current === stage) return;
    previousStage.current = stage;
    if (!dialog) headingRef.current?.focus();
  }, [stage]);

  useEffect(() => {
    if (selectionRevision === 0 || window.innerWidth > 760) return;
    analysisPanelRef.current?.scrollIntoView?.({
      behavior: "auto",
      block: "start",
    });
  }, [selectionRevision]);

  useEffect(() => {
    if (stage !== "launch" && stage !== "landing") return;
    const nextStage = stage === "launch" ? "selection" : "complete";
    if (reducedMotion) {
      setStage(nextStage);
      return;
    }
    const timer = window.setTimeout(() => setStage(nextStage), 1600);
    return () => window.clearTimeout(timer);
  }, [stage, reducedMotion]);

  useEffect(() => {
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus.current?.focus();
    };
  }, [dialog]);

  useEffect(() => {
    if (!MISSION_AUDIT || typeof URL.createObjectURL !== "function") return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(MISSION_AUDIT, null, 2)], {
        type: "application/json",
      }),
    );
    setAuditUrl(url);
    return () => URL.revokeObjectURL(url);
  }, []);

  function handleDialogKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setDialog(null);
    }
    if (event.key !== "Tab") return;
    const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button, a[href], select, [tabindex="0"]',
    );
    if (!controls?.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function selectSite(id: string) {
    setSelectedSiteId(id);
    setSelectionRevision((revision) => revision + 1);
    setVisitedSiteIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
  }

  function returnToMap() {
    mapHeadingRef.current?.focus();
    mapHeadingRef.current?.scrollIntoView?.({
      behavior: "auto",
      block: "start",
    });
  }

  function discover() {
    setDiscovered(true);
    setDialog("bonus");
  }

  const step =
    stage === "briefing" || stage === "launch"
      ? 0
      : stage === "selection"
        ? 1
        : 2;

  return (
    <main className="lunar-mission">
      <div className="mission-content" inert={dialog !== null}>
        <header className="mission-header">
          <div className="mission-brand">
            <span aria-hidden="true">◒</span> LUNAR{" "}
            <span className="mission-tagline">Uma missão, duas direções.</span>
          </div>
          <div className="mission-header-actions">
            <button
              className="mission-button mission-button-quiet"
              onClick={() => setDialog("about")}
            >
              Sobre a missão <Arrow />
            </button>
          </div>
        </header>

        <ol className="mission-progress" aria-label="Etapas da missão">
          {["Briefing", "Escolha do local", "Pouso ilustrativo"].map(
            (label, index) => (
              <li
                key={label}
                className={
                  index === step
                    ? "is-current"
                    : index < step
                      ? "is-complete"
                      : ""
                }
                aria-current={index === step ? "step" : undefined}
              >
                <span className="step-number" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {label}
              </li>
            ),
          )}
        </ol>

        {stage === "briefing" && (
          <section
            className="mission-briefing"
            aria-labelledby="mission-heading"
          >
            <div className="briefing-copy">
              <p className="mission-eyebrow">
                Pequenas escolhas. Grandes descobertas.
              </p>
              <h1
                className="mission-title"
                id="mission-heading"
                ref={headingRef}
                tabIndex={-1}
              >
                Um bom pouso começa com uma escolha.
              </h1>
              <p className="mission-intro">
                Explore o polo sul da Lua e descubra como a posição do Sol e da
                Terra muda a sua decisão.
              </p>
              <div className="mission-guide">
                <div className="guide-copy">
                  <MissionDialogue text={WELCOME_DIALOGUE} active={!dialog} />
                </div>
              </div>
              <ul className="mission-objectives">
                <li>
                  <span aria-hidden="true">☀</span>
                  <span>
                    <strong>Encontre o Sol</strong>A luz solar ajuda a alimentar
                    os painéis.
                  </span>
                </li>
                <li>
                  <span aria-hidden="true">◉</span>
                  <span>
                    <strong>Encontre a Terra</strong>Uma direção desobstruída é
                    parte da comunicação direta.
                  </span>
                </li>
              </ul>
              <div className="mission-actions">
                <button
                  className="mission-button mission-button-primary"
                  onClick={() => setStage("launch")}
                >
                  Iniciar missão <Arrow />
                </button>
                <button
                  className="mission-button mission-button-secondary"
                  onClick={() => setStage("selection")}
                >
                  Ir direto ao mapa
                </button>
              </div>
            </div>
            <div className="briefing-art">
              <GuidePortrait mood="welcome" />
              <p className="art-caption">
                Lua, sua guia de missão
                <br />
                <span>Personagem fictícia · nave robótica</span>
              </p>
            </div>
          </section>
        )}

        {(stage === "launch" || stage === "landing") && (
          <section
            className="mission-transition"
            aria-labelledby="mission-heading"
          >
            <div className="transition-art">
              <RocketIllustration
                phase={stage === "launch" ? "launch" : "landing"}
              />
            </div>
            <div className="transition-copy">
              <p className="mission-eyebrow">
                {stage === "launch" ? "Rumo à Lua" : "Decisão registrada"}
              </p>
              <h1
                id="mission-heading"
                className="mission-title"
                tabIndex={-1}
                ref={headingRef}
              >
                {stage === "launch"
                  ? "Próxima parada: sua descoberta."
                  : "Vamos imaginar esse pouso."}
              </h1>
              <p>Uma viagem ilustrativa de poucos segundos.</p>
              <button
                className="mission-button mission-button-secondary"
                onClick={() =>
                  setStage(stage === "launch" ? "selection" : "complete")
                }
              >
                {stage === "launch"
                  ? "Pular decolagem"
                  : "Pular pouso e ver resumo"}
              </button>
            </div>
          </section>
        )}

        {stage === "selection" && (
          <section
            className="mission-selection"
            aria-labelledby="mission-heading"
          >
            <div className="mission-section-heading">
              <div>
                <p className="mission-eyebrow">Você está no comando</p>
                <h1
                  id="mission-heading"
                  className="mission-title"
                  ref={headingRef}
                  tabIndex={-1}
                >
                  Onde vamos pousar?
                </h1>
              </div>
              <p>
                Neste exercício, procure Sol e Terra acima do horizonte
                idealizado.
              </p>
            </div>
            <div className="mission-workspace">
              <div className="mission-map-panel" id="mission-map-panel">
                <div className="map-heading">
                  <h2 tabIndex={-1} ref={mapHeadingRef}>
                    Explore os locais
                  </h2>
                  <span className="mission-map-counter">
                    {visitedSiteIds.length} de {MISSION_SITES.length} explorados
                  </span>
                </div>
                <p className="map-caption">
                  Selecione um dos quatro pontos para investigar.
                </p>
                <PolarMissionMap
                  sites={MISSION_SITES}
                  selectedSiteId={selectedSiteId}
                  visitedSiteIds={visitedSiteIds}
                  onSelect={selectSite}
                  onDiscover={discover}
                  discovered={discovered}
                />
              </div>
              <div className="mission-analysis-panel" ref={analysisPanelRef}>
                {selectedSiteId && (
                  <button
                    className="mission-map-return mission-button mission-button-quiet"
                    aria-controls="mission-map-panel"
                    onClick={returnToMap}
                  >
                    Voltar ao mapa
                  </button>
                )}
                <div className="mission-date-control">
                  <label htmlFor="mission-date">
                    Data da observação <span>· 00:00 UTC</span>
                  </label>
                  <select
                    id="mission-date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  >
                    {MISSION_DATES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
                {!selectedSiteId && (
                  <div className="analysis-empty">
                    <span aria-hidden="true">
                      <Arrow direction="up-left" />
                    </span>
                    <h2>Sua descoberta começa no mapa.</h2>
                    <p>
                      Escolha um local para comparar o Sol e a Terra. Você pode
                      experimentar quantas opções quiser.
                    </p>
                  </div>
                )}
                {result.error && (
                  <div role="alert" className="mission-error">
                    <h2>Dados indisponíveis</h2>
                    <p>{result.error}</p>
                  </div>
                )}
                {analysis && (
                  <div className="analysis-content">
                    <div className="mission-site-heading">
                      <p className="mission-eyebrow">Local em análise</p>
                      <h2>{analysis.site.label}</h2>
                      <p>
                        {analysis.site.latitudeDeg}° de latitude ·{" "}
                        {analysis.site.longitudeDeg}° de longitude
                      </p>
                    </div>
                    <div
                      className="target-cards"
                      aria-label="Direção para explicar"
                    >
                      {(["sun", "earth"] as const).map((name) => (
                        <button
                          key={name}
                          className={`target-card${target === name ? " is-selected" : ""}`}
                          aria-pressed={target === name}
                          onClick={() => setTarget(name)}
                        >
                          <span className="target-name">
                            <span aria-hidden="true">
                              {name === "sun" ? "☀" : "◉"}
                            </span>
                            {targetLabels[name]}
                          </span>
                          <span className="target-elevation">
                            {formatAngle(analysis[name].elevationDeg)}
                          </span>
                          <span className="target-status">
                            {directionLabel(analysis[name])}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="mission-diagram-panel">
                      <HorizonDiagram analysis={analysis} target={target} />
                    </div>
                    <div
                      className={`mission-explanation ${meetsGoal ? "is-positive" : "is-negative"}`}
                      role="status"
                    >
                      <h3>
                        {meetsGoal
                          ? "As duas direções estão acima."
                          : "Este ponto ainda não atende ao objetivo."}
                      </h3>
                      <p>
                        {meetsGoal
                          ? "Os centros do Sol e da Terra estão acima do horizonte idealizado nesta data. Você encontrou uma opção para concluir o exercício."
                          : `${analysis.sun.elevationDeg <= 0 && analysis.earth.elevationDeg <= 0 ? "O Sol e a Terra estão" : analysis.sun.elevationDeg <= 0 ? "O Sol está" : "A Terra está"} no horizonte ou abaixo dele nesta data. Experimente outro ponto ou outra data e compare.`}
                      </p>
                    </div>
                    <div className="mission-actions">
                      <button
                        className="mission-button mission-button-primary"
                        disabled={!meetsGoal}
                        onClick={() => {
                          if (meetsGoal) setStage("landing");
                        }}
                      >
                        Pousar neste local <Arrow direction="down" />
                      </button>
                      {!meetsGoal && (
                        <button
                          className="mission-button mission-button-secondary"
                          onClick={returnToMap}
                        >
                          Escolher outro ponto
                        </button>
                      )}
                    </div>
                    <p className="mission-footnote">
                      Ângulos dos centros dos astros. Esta comparação não
                      determina energia, comunicação ou segurança de um pouso
                      real.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {stage === "complete" && analysis && (
          <section
            className="mission-complete"
            aria-labelledby="mission-heading"
          >
            <div className="complete-art">
              <RocketIllustration phase="landed" />
              <GuidePortrait mood="happy" />
            </div>
            <div className="complete-copy">
              <p className="mission-eyebrow">Uma escolha, uma descoberta</p>
              <h1
                className="mission-title"
                id="mission-heading"
                tabIndex={-1}
                ref={headingRef}
              >
                Escolha registrada.
              </h1>
              <p className="mission-intro">
                Você comparou o céu antes de escolher o chão.
              </p>
              <div className="mission-summary">
                <h2>{analysis.site.label}</h2>
                <p>{dateLabel}</p>
                <dl>
                  {(["sun", "earth"] as const).map((name) => (
                    <div key={name}>
                      <dt>{targetLabels[name]}</dt>
                      <dd>
                        {formatAngle(analysis[name].elevationDeg)}{" "}
                        <span>{directionLabel(analysis[name])}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <MissionDialogue
                text="Boa! Você encontrou o Sol e a Terra acima do horizonte deste exercício. Num pouso de verdade, ainda precisamos estudar o relevo, a energia e a comunicação. Quer testar outro local?"
                active={!dialog}
              />
              <div className="mission-actions">
                <button
                  className="mission-button mission-button-primary"
                  onClick={() => setStage("selection")}
                >
                  Explorar outra opção <Arrow />
                </button>
              </div>
              <p className="mission-footnote">
                Pouso ilustrativo em um local hipotético.
              </p>
            </div>
          </section>
        )}

        <footer className="mission-footer">
          <span>Uma missão de curiosidade.</span>
          <span>Direções calculadas · cenário ilustrado</span>
        </footer>
      </div>

      {dialog && (
        <div
          className="mission-dialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setDialog(null);
          }}
        >
          <div
            ref={dialogRef}
            className="mission-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mission-dialog-title"
            onKeyDown={handleDialogKey}
          >
            <button
              className="dialog-close mission-button mission-button-quiet"
              aria-label="Fechar janela"
              onClick={() => setDialog(null)}
            >
              Fechar <span aria-hidden="true">×</span>
            </button>
            <p className="mission-eyebrow">
              {dialog === "about"
                ? "Contexto e fontes"
                : "Uma descoberta extra"}
            </p>
            <h2 id="mission-dialog-title">
              {dialog === "about"
                ? "Sobre esta missão"
                : "Na Lua, o silêncio é diferente."}
            </h2>
            {dialog === "about" ? (
              <>
                <p>
                  Esta é uma experiência educativa com uma guia fictícia e uma
                  nave robótica. A iniciativa CLPS da NASA contrata entregas
                  comerciais de cargas científicas e tecnológicas à Lua.
                </p>
                <p>
                  Os quatro locais são hipotéticos. As datas são amostras
                  selecionadas, todas às 00:00 UTC; não representam uma
                  simulação contínua.
                </p>
                <p>
                  O objetivo é comparar os centros do Sol e da Terra com um
                  horizonte lunar idealizado. As ilustrações de crateras, relevo
                  e voo não medem obstruções por montanhas.
                </p>
                <p>
                  Estar acima do horizonte não garante energia, enlace de
                  comunicação ou segurança de pouso.
                </p>
                <dl className="mission-provenance">
                  <div>
                    <dt>Dados</dt>
                    <dd>{MISSION_PROVENANCE.summary}</dd>
                  </div>
                  <div>
                    <dt>Modelo</dt>
                    <dd>{MISSION_PROVENANCE.model}</dd>
                  </div>
                  <div>
                    <dt>Fontes e auditoria</dt>
                    <dd>{MISSION_PROVENANCE.source}</dd>
                  </div>
                  <div>
                    <dt>Limites</dt>
                    <dd>{MISSION_PROVENANCE.limitation}</dd>
                  </div>
                </dl>
                <p className="mission-asset-credit">
                  Astronauta:{" "}
                  <a href="https://poly.google.com/view/dLHpzNdygsg">
                    Astronaut, de Poly
                  </a>
                  , licença{" "}
                  <a href="https://creativecommons.org/licenses/by/2.0/">
                    CC BY 2.0
                  </a>
                  . Imagem existente, sem alterações além do tamanho de
                  exibição, disponível no{" "}
                  <a href="https://github.com/google/model-viewer/blob/9c6fea9ac579e618bf2932456d3308309017df00/packages/modelviewer.dev/assets/poster-astronaut.webp">
                    model-viewer
                  </a>
                  .
                </p>
                {auditUrl ? (
                  <a
                    className="mission-button mission-button-secondary"
                    href={auditUrl}
                    download="auditoria-missao-lunar.json"
                  >
                    Baixar dados e auditoria (JSON)
                  </a>
                ) : (
                  <p>O arquivo de auditoria está indisponível.</p>
                )}
              </>
            ) : (
              <>
                <p>
                  O som precisa de um meio para se propagar. No vácuo da Lua,
                  ele não viaja como no ar da Terra.
                </p>
                <p>
                  Os astronautas conversam por rádio. Você descobriu um bônus —
                  e pode continuar sua missão quando quiser.
                </p>
                <button
                  className="mission-button mission-button-primary"
                  onClick={() => setDialog(null)}
                >
                  Voltar à exploração
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
