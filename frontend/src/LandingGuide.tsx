import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { MoonView } from "./MoonView";
import { SurfaceTerrainView } from "./SurfaceTerrainView";
import {
  loadTerrainAssets,
  solarFrameAt,
  surfaceHeight,
} from "./terrain/terrain-data";
import {
  applyRotation,
  geoToStereo,
  LUNAR_RADIUS_M,
  worldToGeo,
} from "./terrain/surface-math";
import { GuideAnalysis } from "./GuideAnalysis";
import { GuideIcon } from "./GuideIcon";
import { GuidePanel } from "./GuidePanel";
import { guideReducer, initialGuideState } from "./guide-state";
import {
  demoSelection,
  loadGuideDataset,
  missionTimestamps,
  periodCoverage,
  selectedSample,
  utcLabel,
} from "./guide-model";
import type { GuideDataset, LocationSelection, Slot } from "./guide-types";
import "./landing-guide.css";

type Panel = "charts" | "selection" | "data" | "time" | "help";
const titles: Record<Panel, string> = {
  charts: "Gráficos",
  selection: "Escolher locais",
  data: "Dados dos locais",
  time: "Tempo da missão",
  help: "How it works · Como funciona",
};
const coordinates = (p: { latitude: number; longitudeEast: number }) =>
  `${p.latitude.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}° lat · ${p.longitudeEast.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}° E`;

export function LandingGuide({
  daily,
  hourly,
}: {
  daily?: GuideDataset;
  hourly?: GuideDataset;
}) {
  const [state, dispatch] = useReducer(guideReducer, initialGuideState);
  const [started, setStarted] = useState(false),
    [panels, setPanels] = useState<Panel[]>([]);
  const [small, setSmall] = useState(() => window.innerWidth <= 700);
  const [message, setMessage] = useState(
    "Dois locais hipotéticos prontos para explorar.",
  );
  const [aim, setAim] = useState<LocationSelection | null>(null);
  const [latitude, setLatitude] = useState(""),
    [longitude, setLongitude] = useState(""),
    [coordinateError, setCoordinateError] = useState("");
  const triggers = useRef<Partial<Record<Panel, HTMLButtonElement | null>>>({});
  const datasets = useMemo(
    () => ({
      daily: daily ?? loadGuideDataset("daily"),
      hourly: hourly ?? loadGuideDataset("hourly"),
    }),
    [daily, hourly],
  );
  const dataset = datasets[state.datasetId];
  const timestamps = useMemo(
    () => missionTimestamps(dataset, state.startDate, state.durationDays),
    [dataset, state.startDate, state.durationDays],
  );
  const coverage = periodCoverage(dataset, state.startDate, state.durationDays);
  const index = timestamps.indexOf(state.utc);
  const availableSlots = (["A", "B"] as const).filter(
    (slot) =>
      index >= 0 &&
      selectedSample(dataset, state.selections[slot], state.target, state.utc),
  );
  const badge = availableSlots.length === 2 ? "A/B" : (availableSlots[0] ?? "");
  const modal = panels.includes("help") || (small && panels.length > 0);
  useEffect(() => {
    const onResize = () => {
      const narrow = window.innerWidth <= 700;
      setSmall(narrow);
      if (narrow) setPanels((p) => p.slice(-1));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  function closePanel(panel: Panel) {
    setPanels((p) => p.filter((v) => v !== panel));
    requestAnimationFrame(() => triggers.current[panel]?.focus());
  }
  function togglePanel(panel: Panel) {
    if (panels.includes(panel)) {
      closePanel(panel);
      return;
    }
    setPanels((p) =>
      small || panel === "help"
        ? [panel]
        : panel === "charts"
          ? [...p.filter((v) => v !== "help"), panel]
          : [...p.filter((v) => v === "charts"), panel],
    );
  }
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && panels.length) {
        e.preventDefault();
        closePanel(panels[panels.length - 1]);
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [panels]);
  useEffect(() => {
    if (!state.playing) return;
    if (index < 0 || index >= timestamps.length - 1) {
      dispatch({ type: "playing", value: false });
      return;
    }
    const timer = window.setTimeout(
      () => dispatch({ type: "utc", value: timestamps[index + 1] }),
      1200 / state.speed,
    );
    return () => window.clearTimeout(timer);
  }, [state.playing, state.speed, index, timestamps]);
  useEffect(() => {
    const stop = () => {
      if (document.hidden) dispatch({ type: "playing", value: false });
    };
    document.addEventListener("visibilitychange", stop);
    return () => document.removeEventListener("visibilitychange", stop);
  }, []);
  function start() {
    setPanels([]);
    setStarted(true);
    requestAnimationFrame(() => triggers.current.charts?.focus());
  }
  function selectLocation(
    value: Parameters<typeof demoSelection>[0] | LocationSelection,
  ) {
    const location = typeof value === "string" ? demoSelection(value) : value;
    dispatch({ type: "select", value: location });
    setCoordinateError("");
    setMessage(
      `Local ${state.activeSlot} selecionado: ${coordinates(location)}. ${"sourceSiteId" in location ? "Local calculado." : "Sem resultados calculados para esta seleção livre."}`,
    );
  }
  function selectCoordinates(e: FormEvent) {
    e.preventDefault();
    const lat = Number(latitude),
      lon = Number(longitude);
    if (
      !latitude.trim() ||
      !longitude.trim() ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < 0 ||
      lon >= 360
    ) {
      setCoordinateError(
        "Informe latitude entre −90° e 90° e longitude leste de 0° até menos de 360°.",
      );
      return;
    }
    selectLocation({
      latitude: lat,
      longitudeEast: lon,
      coordinateFrame: "MOON_ME_DE421",
    });
  }
  async function locateSelection(p: LocationSelection) {
    try {
      const assets = await loadTerrainAssets();
      if (p.coordinateFrame === "MOON_ME_DE421") {
        const [x, y] = geoToStereo(p.latitude, p.longitudeEast);
        if (surfaceHeight(assets.terrain, x, y) === undefined) {
          setMessage(
            "Este local fica fora do recorte LOLA disponível. A vista atual foi preservada.",
          );
          return;
        }
        dispatch({
          type: "center",
          value: { latitude: p.latitude, longitudeEast: p.longitudeEast },
        });
        return;
      }
      const frame = solarFrameAt(assets.solar, index >= 0 ? state.utc : "");
      if (!frame) {
        setMessage(
          "Escolha um instante coberto para transformar e localizar este ponto no relevo.",
        );
        return;
      }
      const lat = (p.latitude * Math.PI) / 180,
        lon = (p.longitudeEast * Math.PI) / 180,
        r = LUNAR_RADIUS_M;
      const me = applyRotation(frame.iau_to_me, [
        r * Math.cos(lat) * Math.cos(lon),
        r * Math.cos(lat) * Math.sin(lon),
        r * Math.sin(lat),
      ]);
      const location = worldToGeo([
        me[1] / 1000,
        (-me[2] - r) / 1000,
        -me[0] / 1000,
      ]);
      dispatch({
        type: "center",
        value: {
          latitude: location.latitude,
          longitudeEast: location.longitudeEast,
        },
      });
    } catch {
      setMessage(
        "Não foi possível carregar a transformação do terreno. Nenhum referencial foi substituído.",
      );
    }
  }
  function changePeriod(startDate: string, durationDays: number) {
    dispatch({ type: "period", startDate, durationDays });
    const next = missionTimestamps(dataset, startDate, durationDays);
    if (!next.includes(state.utc))
      dispatch({ type: "utc", value: next[0] ?? "" });
    setMessage(
      next.length
        ? `Período atualizado: ${next.length} amostras disponíveis.`
        : "Sem amostras nesse período. Altere início ou duração.",
    );
  }
  function step(offset: number) {
    dispatch({ type: "playing", value: false });
    if (index >= 0 && timestamps[index + offset])
      dispatch({ type: "utc", value: timestamps[index + offset] });
  }
  function tool(
    panel: Panel,
    label: string,
    icon: "chart" | "data" | "clock" | "select" | "help",
    className: string,
  ) {
    return (
      <button
        type="button"
        ref={(el) => {
          triggers.current[panel] = el;
        }}
        className={`lg-tool ${className} ${panels.includes(panel) ? "is-open" : ""}`}
        onClick={() => togglePanel(panel)}
        aria-expanded={panels.includes(panel)}
        aria-controls={`guide-panel-${panel}`}
      >
        <GuideIcon name={icon} />
        <span>{label}</span>
        {panel === "data" && badge && (
          <span
            className="lg-data-badge"
            aria-label={`Resultados disponíveis: ${badge}`}
          >
            {badge}
          </span>
        )}
      </button>
    );
  }
  return (
    <div className="landing-guide">
      {!started ? (
        <main className="lg-landing" inert={modal}>
          <div className="lg-home-moon">
            <MoonView
              view="3D"
              center={{ latitude: 8, longitudeEast: 15 }}
              selections={{ A: null, B: null }}
              selectionMode="cursor"
              activeSlot="A"
              onCenterChange={() => {}}
              onSelect={() => {}}
              decorative
            />
          </div>
          <div className="lg-home-orbit" aria-hidden="true" />
          <div className="lg-home-copy">
            <p className="lg-eyebrow">ARI / LUNAR LANDING SITE NAVIGATOR</p>
            <h1>
              Landing
              <br />
              <em>Guide.</em>
            </h1>
            <p className="lg-lead">
              Dois lugares. Um mesmo instante.
              <br />
              Descubra o que muda no céu da Lua.
            </p>
            <div className="lg-home-actions">
              <button type="button" className="lg-primary" onClick={start}>
                Start <GuideIcon name="arrow" />
              </button>
              <button
                type="button"
                ref={(el) => {
                  triggers.current.help = el;
                }}
                className="lg-text-button"
                onClick={() => togglePanel("help")}
                aria-expanded={panels.includes("help")}
                aria-controls="guide-panel-help"
              >
                How it works <GuideIcon name="help" />
              </button>
            </div>
            <p className="lg-home-translation">
              Começar a explorar · Como funciona
            </p>
          </div>
          <div className="lg-home-foot">
            <span>UMA EXPLORAÇÃO CIENTÍFICA / 2026</span>
            <p>
              Lua ilustrativa. Dados geométricos calculados, com limites
              explícitos.
            </p>
          </div>
        </main>
      ) : (
        <>
          <div className="lg-explorer" inert={modal}>
            <a className="lg-skip" href="#guide-map">
              Ir para a Lua e os controles de vista
            </a>
            <main className="lg-scene">
              <h1 className="lg-sr-only">Landing Guide · Exploração lunar</h1>
              <div className="lg-scene-title">
                <span>
                  ARI <span className="lg-title-divider">/</span> LANDING GUIDE
                </span>
              </div>
              <div id="guide-map" className="lg-surface-wrap">
                <SurfaceTerrainView
                  view={state.view}
                  center={state.center}
                  zoom={state.zoom}
                  bearing={state.bearing}
                  shadows={state.shadows}
                  utc={index >= 0 ? state.utc : ""}
                  selections={state.selections}
                  selectionMode={state.selectionMode}
                  activeSlot={state.activeSlot}
                  onCenterChange={(value) =>
                    dispatch({ type: "center", value })
                  }
                  onZoomChange={(value) => dispatch({ type: "zoom", value })}
                  onBearingChange={(value) =>
                    dispatch({ type: "bearing", value })
                  }
                  onAimChange={setAim}
                  onSelect={selectLocation}
                />
              </div>
              <div className="lg-terrain-key">
                <strong>LOLA · Polo sul lunar</strong>
                <p>
                  Fonte 80 m · malha visual 800 m.
                  <br />
                  Sombras renderizadas: aproximação.
                </p>
                <label>
                  <input
                    type="checkbox"
                    checked={state.shadows}
                    onChange={(e) =>
                      dispatch({ type: "shadows", value: e.target.checked })
                    }
                  />{" "}
                  Sombras do Sol
                </label>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "dataset", value: "hourly" })}
                >
                  Ver exemplo horário
                </button>
              </div>
              <div
                className="lg-surface-navigation"
                role="group"
                aria-label="Navegar na superfície"
              >
                <button
                  type="button"
                  aria-label="Aproximar mapa"
                  disabled={state.zoom >= 12}
                  onClick={() =>
                    dispatch({ type: "zoom", value: state.zoom * 1.4 })
                  }
                >
                  +
                </button>
                <button
                  type="button"
                  aria-label="Afastar mapa"
                  disabled={state.zoom <= 1}
                  onClick={() =>
                    dispatch({ type: "zoom", value: state.zoom / 1.4 })
                  }
                >
                  −
                </button>
                <button
                  type="button"
                  aria-label="Restaurar orientação da projeção"
                  onClick={() => dispatch({ type: "bearing", value: 0 })}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      display: "block",
                      transform: `rotate(${-state.bearing}deg)`,
                    }}
                  >
                    0° ↑
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Girar mapa 15 graus"
                  onClick={() =>
                    dispatch({ type: "bearing", value: state.bearing + 15 })
                  }
                >
                  ↻
                </button>
              </div>
              <div
                className="lg-selection-strip"
                aria-label="Locais selecionados"
              >
                {(["A", "B"] as Slot[]).map((slot) => {
                  const p = state.selections[slot];
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => {
                        dispatch({ type: "slot", value: slot });
                        togglePanel("selection");
                      }}
                      aria-label={`Editar local ${slot}`}
                    >
                      <span className={`lg-slot lg-slot-${slot}`}>{slot}</span>
                      <span>
                        {p ? coordinates(p) : "Escolher local"}
                        <small>
                          {p?.sourceSiteId
                            ? "Calculado · IAU_MOON"
                            : p
                              ? "Sem análise · ME"
                              : "Sem seleção"}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
              {state.selectionMode === "center" && (
                <button
                  type="button"
                  className="lg-confirm-center"
                  disabled={!aim}
                  onClick={() => aim && selectLocation(aim)}
                >
                  Confirmar mira como {state.activeSlot}
                </button>
              )}
              <p className="lg-map-instruction">
                {state.selectionMode === "cursor"
                  ? `Clique na superfície para selecionar ${state.activeSlot}.`
                  : `Oriente a vista e confirme a mira como ${state.activeSlot}.`}{" "}
                <span>Use Seleção para escolher sem apontar.</span>
              </p>
            </main>
            {tool("charts", "Gráficos", "chart", "lg-tool-charts")}
            {tool("selection", "Seleção A/B", "select", "lg-tool-selection")}
            {tool("data", "Dados", "data", "lg-tool-data")}
            <div
              className="lg-view-toggle"
              role="group"
              aria-label="Visualização lunar"
            >
              {(["2D", "3D"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  aria-pressed={state.view === view}
                  onClick={() => dispatch({ type: "view", value: view })}
                >
                  {view}
                </button>
              ))}
            </div>
            <div className="lg-time-dock">
              {tool("time", "Tempo", "clock", "lg-tool-time")}
              <span>
                <time dateTime={state.utc}>{utcLabel(state.utc)}</time>
                <small>
                  {state.datasetId === "daily"
                    ? "Amostras diárias"
                    : "Amostras horárias"}{" "}
                  · {state.target === "SUN" ? "Sol" : "Terra"}
                  {state.playing ? " · Reproduzindo" : ""}
                </small>
              </span>
            </div>
            <button
              type="button"
              ref={(el) => {
                triggers.current.help = el;
              }}
              className="lg-explorer-help"
              onClick={() => togglePanel("help")}
              aria-label="Como explorar e limites do modelo"
            >
              <GuideIcon name="help" />
            </button>
          </div>
          {modal && <div className="lg-backdrop" aria-hidden="true" />}
        </>
      )}
      {panels.map((panel) => (
        <GuidePanel
          key={panel}
          id={panel}
          title={titles[panel]}
          onClose={() => closePanel(panel)}
          modal={small || panel === "help"}
          position={
            panel === "charts"
              ? "left"
              : panel === "time"
                ? "time"
                : panel === "help"
                  ? "help"
                  : "right"
          }
        >
          {panel === "help" ? (
            <div className="lg-help-content">
              <p className="lg-panel-intro">
                Uma Lua para explorar. Uma comparação para entender.
              </p>
              <ol className="lg-help-steps">
                <li>
                  <span>01</span>
                  <div>
                    <h3>Escolha dois lugares</h3>
                    <p>
                      Comece com os locais calculados. Para explorar outros
                      pontos, use a Lua ou informe coordenadas.
                    </p>
                  </div>
                </li>
                <li>
                  <span>02</span>
                  <div>
                    <h3>Compare o mesmo instante</h3>
                    <p>
                      Abra Dados ou Gráficos. Veja se o centro do Sol ou da
                      Terra está acima da referência de 0°.
                    </p>
                  </div>
                </li>
                <li>
                  <span>03</span>
                  <div>
                    <h3>Mude a amostra</h3>
                    <p>
                      Abra Tempo, avance ou reproduza os instantes disponíveis.
                      Trocar 2D/3D preserva suas escolhas.
                    </p>
                  </div>
                </li>
              </ol>
              <p className="lg-note">
                O mapa agora usa relevo LOLA real e sombras visuais aproximadas.
                Os gráficos mantêm o horizonte idealizado de 0°: não incorporam
                essas sombras. Não há validação independente contra Horizons nem
                garantia de energia ou comunicação.
              </p>
              <details>
                <summary>Relevo, referenciais e sombras</summary>
                <p>
                  DEM LDEM_80S_80M V2.0, obtido diretamente do PDS. Fonte a 80
                  m, asset decimado a 400 m e malha de exibição a 800 m. Alturas
                  radiais sobre a esfera de 1.737.400 m, com curvatura lunar
                  preservada.
                </p>
                <p>
                  O terreno usa MOON_ME_DE421. A/B permanecem em IAU_MOON e são
                  transformados por matrizes SPICE em cada instante. A altura do
                  observador da análise continua 0 m sobre a esfera; o marcador
                  não representa automaticamente uma posição no chão do DEM.
                </p>
                <p>
                  A luz é a direção do centro solar, aproximada como paralela.
                  Sombras GPU têm resolução finita, recorte limitado e luz
                  ambiente artificial para leitura. Não calculam iluminação
                  efetiva nem duração de janelas. Abaixo do horizonte polar de
                  referência, a luz direta é desativada como convenção de
                  exibição, sem classificar toda a região como noite.
                </p>
              </details>
              {!started && (
                <button className="lg-primary" onClick={start}>
                  Start · Começar <GuideIcon name="arrow" />
                </button>
              )}
              <details>
                <summary>Interface científica anterior</summary>
                <p>
                  As telas detalhadas dos MVPs A/B e o rascunho de planejamento
                  continuam disponíveis. Abrir a interface anterior recarrega a
                  página.
                </p>
                <a className="lg-legacy-link" href="?interface=legacy">
                  Abrir interface anterior
                </a>
              </details>
            </div>
          ) : panel === "data" || panel === "charts" ? (
            <GuideAnalysis
              kind={panel}
              dataset={dataset}
              selections={state.selections}
              target={state.target}
              utc={state.utc}
              timestamps={timestamps}
              onTargetChange={(value) => dispatch({ type: "target", value })}
            />
          ) : panel === "selection" ? (
            <div className="lg-selection-content">
              <p className="lg-panel-intro">Escolha o lugar A e o lugar B.</p>
              <div
                className="lg-segment"
                role="group"
                aria-label="Local a substituir"
              >
                {(["A", "B"] as const).map((slot) => (
                  <button
                    key={slot}
                    aria-pressed={state.activeSlot === slot}
                    onClick={() => dispatch({ type: "slot", value: slot })}
                  >
                    Local {slot}
                  </button>
                ))}
              </div>
              <p className="lg-context">
                A próxima seleção substitui <strong>{state.activeSlot}</strong>.
              </p>
              <fieldset>
                <legend>Como selecionar</legend>
                <div className="lg-segment">
                  <button
                    aria-pressed={state.selectionMode === "center"}
                    onClick={() => dispatch({ type: "mode", value: "center" })}
                  >
                    Centro · mira
                  </button>
                  <button
                    aria-pressed={state.selectionMode === "cursor"}
                    onClick={() => dispatch({ type: "mode", value: "cursor" })}
                  >
                    Cursor · clique
                  </button>
                </div>
              </fieldset>
              <p className="lg-context">
                {state.selectionMode === "center"
                  ? "Use as setas na Lua para orientar a vista. Confirme a mira para selecionar."
                  : "Clique na superfície visível. A lista abaixo também funciona por teclado."}
              </p>
              <h3>Locais com amostras calculadas</h3>
              <div className="lg-demo-choices">
                <button onClick={() => selectLocation("south-a")}>
                  Usar −89,5° · 0° E em {state.activeSlot}
                  <small>Local demonstrativo south-a</small>
                </button>
                <button onClick={() => selectLocation("south-b")}>
                  Usar −89° · 90° E em {state.activeSlot}
                  <small>Local demonstrativo south-b</small>
                </button>
              </div>
              <button
                className="lg-text-button"
                onClick={() => {
                  dispatch({ type: "demo" });
                  setMessage(
                    "Os dois locais demonstrativos foram restaurados.",
                  );
                }}
              >
                Restaurar os dois locais calculados
              </button>
              <div className="lg-selected-list">
                {(["A", "B"] as const).map((slot) => {
                  const p = state.selections[slot];
                  return (
                    <article key={slot}>
                      <h3>Local {slot}</h3>
                      <p>{p ? coordinates(p) : "Sem seleção"}</p>
                      <p className="lg-context">
                        {p?.sourceSiteId
                          ? `${p.sourceSiteId} · amostras disponíveis nas datas cobertas`
                          : p
                            ? "Seleção livre · sem cálculo científico"
                            : "Escolha um local para comparar"}
                      </p>
                      <div className="lg-inline-actions">
                        <button
                          disabled={!p}
                          onClick={() => p && void locateSelection(p)}
                        >
                          Localizar {slot}
                        </button>
                        <button
                          disabled={!p}
                          onClick={() => {
                            dispatch({ type: "remove", slot });
                            setMessage(`Local ${slot} removido.`);
                          }}
                        >
                          Remover {slot}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              <button
                disabled={!state.previous}
                onClick={() => {
                  dispatch({ type: "undo" });
                  setMessage("Seleção anterior restaurada.");
                }}
              >
                Desfazer última seleção
              </button>
              <details>
                <summary>Informar coordenadas</summary>
                <form onSubmit={selectCoordinates}>
                  <label htmlFor="guide-lat">
                    Latitude planetocêntrica (°)
                  </label>
                  <input
                    id="guide-lat"
                    type="number"
                    min="-90"
                    max="90"
                    step="any"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    aria-describedby="guide-coordinate-help"
                  />
                  <label htmlFor="guide-lon">Longitude leste (°)</label>
                  <input
                    id="guide-lon"
                    type="number"
                    min="0"
                    max="359.999999"
                    step="any"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    aria-describedby="guide-coordinate-help"
                  />
                  <p id="guide-coordinate-help" className="lg-context">
                    Referencial do terreno: MOON_ME_DE421. Longitude de 0° a
                    menos de 360° E. Coordenadas próprias não executam análises
                    científicas. Os locais calculados permanecem definidos em
                    IAU_MOON e são transformados para o mapa.
                  </p>
                  {coordinateError && (
                    <p role="alert" className="lg-error">
                      {coordinateError}
                    </p>
                  )}
                  <button className="lg-primary" type="submit">
                    Selecionar coordenadas como {state.activeSlot}
                  </button>
                </form>
              </details>
            </div>
          ) : (
            <div className="lg-time-content">
              <label htmlFor="guide-dataset">Conjunto de amostras</label>
              <select
                id="guide-dataset"
                value={state.datasetId}
                onChange={(e) => {
                  dispatch({
                    type: "dataset",
                    value: e.target.value as "daily" | "hourly",
                  });
                  setMessage(
                    "Conjunto e período de exemplo atualizados. Seleções preservadas.",
                  );
                }}
              >
                <option value="daily">MVP A · diário · 2026</option>
                <option value="hourly">
                  MVP B · horário · 15 nov a 15 dez
                </option>
              </select>
              <details className="lg-mission-settings">
                <summary>Início e duração da missão</summary>
                <div className="lg-period-fields">
                  <div>
                    <label htmlFor="guide-start">Início da missão (UTC)</label>
                    <input
                      id="guide-start"
                      type="date"
                      value={state.startDate}
                      onChange={(e) =>
                        changePeriod(e.target.value, state.durationDays)
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor="guide-duration">Duração (dias)</label>
                    <input
                      id="guide-duration"
                      type="number"
                      min="1"
                      max="366"
                      value={
                        Number.isNaN(state.durationDays)
                          ? ""
                          : state.durationDays
                      }
                      onChange={(e) =>
                        changePeriod(state.startDate, e.target.valueAsNumber)
                      }
                    />
                  </div>
                </div>
                <p className="lg-context">
                  Início: {utcLabel(`${state.startDate}T00:00:00.000Z`)}. O
                  período inclui os dois extremos. Duração é tempo entre eles,
                  não quantidade de amostras.
                </p>
              </details>
              <p
                className={coverage === "complete" ? "lg-context" : "lg-error"}
                role="status"
              >
                {coverage === "empty"
                  ? "Sem amostras no período. Altere início ou duração."
                  : coverage === "partial"
                    ? `Cobertura parcial: ${timestamps.length} amostras. O restante do período não tem resultados.`
                    : `${timestamps.length} amostras no período · passo de ${state.datasetId === "daily" ? "1 dia" : "1 hora"}.`}
              </p>
              <label htmlFor="guide-instant">Instante selecionado (UTC)</label>
              <input
                id="guide-instant"
                type="datetime-local"
                step={state.datasetId === "daily" ? 86400 : 3600}
                value={state.utc.slice(0, 16)}
                onChange={(e) => {
                  dispatch({ type: "playing", value: false });
                  const epoch = Date.parse(`${e.target.value}Z`);
                  dispatch({
                    type: "utc",
                    value: Number.isFinite(epoch)
                      ? new Date(epoch).toISOString()
                      : "",
                  });
                }}
              />
              <p className="lg-context">
                {utcLabel(state.utc)}.{" "}
                {index < 0
                  ? "Sem amostra neste instante ou fora do período. Não selecionamos uma vizinha."
                  : "Amostra exata, sem interpolação."}
              </p>
              {index < 0 && timestamps.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    dispatch({ type: "utc", value: timestamps[0] })
                  }
                >
                  Usar primeira amostra disponível
                </button>
              )}
              <label htmlFor="guide-timeline">
                Linha do tempo ·{" "}
                {index >= 0
                  ? `${index + 1} de ${timestamps.length}`
                  : "sem amostra"}
              </label>
              <input
                id="guide-timeline"
                type="range"
                min="0"
                max={Math.max(0, timestamps.length - 1)}
                step="1"
                disabled={!timestamps.length}
                value={Math.max(0, index)}
                aria-valuetext={
                  index >= 0 ? utcLabel(state.utc) : "Sem amostra selecionada"
                }
                onChange={(e) => {
                  dispatch({ type: "playing", value: false });
                  dispatch({
                    type: "utc",
                    value: timestamps[Number(e.target.value)],
                  });
                }}
              />
              <div className="lg-playback">
                <button
                  aria-label="Amostra anterior"
                  disabled={index <= 0}
                  onClick={() => step(-1)}
                >
                  ←
                </button>
                <button
                  className="lg-play"
                  aria-label={
                    state.playing ? "Pausar reprodução" : "Reproduzir amostras"
                  }
                  disabled={index < 0 || index >= timestamps.length - 1}
                  onClick={() =>
                    dispatch({ type: "playing", value: !state.playing })
                  }
                >
                  <GuideIcon name={state.playing ? "pause" : "play"} />
                  {state.playing ? "Pausar" : "Reproduzir"}
                </button>
                <button
                  aria-label="Próxima amostra"
                  disabled={index < 0 || index >= timestamps.length - 1}
                  onClick={() => step(1)}
                >
                  →
                </button>
              </div>
              <label htmlFor="guide-speed">Velocidade da reprodução</label>
              <select
                id="guide-speed"
                value={state.speed}
                onChange={(e) =>
                  dispatch({ type: "speed", value: Number(e.target.value) })
                }
              >
                <option value={0.5}>0,5× · mais devagar</option>
                <option value={1}>1×</option>
                <option value={2}>2×</option>
              </select>
              <p className="lg-note">
                Reprodução percorre somente amostras calculadas. As sombras do
                mapa mudam em passos discretos e são aproximações visuais sobre
                o DEM. Não há cálculo de horários exatos de transição ou duração
                contínua.
              </p>
              {dataset.error && (
                <p role="alert" className="lg-error">
                  {dataset.error}
                </p>
              )}
            </div>
          )}
        </GuidePanel>
      ))}
      <p
        className="lg-sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {message}
      </p>
    </div>
  );
}
