import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { MissionGlobe } from "./globe/MissionGlobe";
import { HorizonDiagram } from "./HorizonDiagram";
import { GameDialogue } from "./GameDialogue";
import { GameScene, CINEMATIC_DURATION_MS } from "./GameScene";
import {
  openingDialogue,
  arrivalDialogue,
  completionDialogue,
} from "./mission-copy";
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
import "./game-shell.css";

const targetLabels: Record<TargetName, string> = { sun: "Sun", earth: "Earth" };

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
  return `${value.toFixed(1)}°`;
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
  if (direction.elevationDeg > 0) return "Above the horizon";
  if (direction.elevationDeg < 0) return "Below the horizon";
  return "On the horizon";
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
  const [dialogueIndex, setDialogueIndex] = useState(0);
  const [arrivalIndex, setArrivalIndex] = useState(0);
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
  const cinematicClock = useRef<{
    stage: MissionStage;
    remaining: number;
  } | null>(null);
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
        throw new Error("Data unavailable");
      }
      return { analysis };
    } catch {
      return {
        error: "We could not load this site and date. Try another option.",
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
    if (stage !== "launch" && stage !== "landing") {
      cinematicClock.current = null;
      return;
    }
    if (cinematicClock.current?.stage !== stage) {
      cinematicClock.current = { stage, remaining: CINEMATIC_DURATION_MS };
    }
    const nextStage = stage === "launch" ? "arrival" : "complete";
    if (dialog) return;
    if (reducedMotion) {
      setStage(nextStage);
      return;
    }
    const clock = cinematicClock.current;
    const started = performance.now();
    const timer = window.setTimeout(() => setStage(nextStage), clock.remaining);
    return () => {
      window.clearTimeout(timer);
      clock.remaining = Math.max(
        0,
        clock.remaining - (performance.now() - started),
      );
    };
  }, [stage, reducedMotion, dialog]);

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

  return (
    <main className={`lunar-mission game-experience stage-${stage}`}>
      <div className="mission-content" inert={dialog !== null}>
        <header className="mission-header">
          <div className="mission-brand">
            <span aria-hidden="true">◒</span> LUNAR{" "}
            <span className="mission-tagline">Lunar mission</span>
          </div>
          <div className="mission-header-actions">
            <button
              className="mission-button mission-button-quiet"
              onClick={() => setDialog("about")}
            >
              About <Arrow />
            </button>
          </div>
        </header>

        {stage === "briefing" && (
          <GameScene phase="briefing">
            <h1 className="game-scene-heading" ref={headingRef} tabIndex={-1}>
              Lunar mission
            </h1>
            <GameDialogue
              text={openingDialogue[dialogueIndex]}
              active={!dialog}
              onBack={
                dialogueIndex > 0
                  ? () => setDialogueIndex((index) => index - 1)
                  : undefined
              }
              onNext={() => {
                if (dialogueIndex < openingDialogue.length - 1)
                  setDialogueIndex((index) => index + 1);
                else setStage("launch");
              }}
            />
          </GameScene>
        )}

        {(stage === "launch" || stage === "landing") && (
          <GameScene phase={stage}>
            <div className="game-cinematic-caption">
              <h1 ref={headingRef} tabIndex={-1}>
                {stage === "launch"
                  ? "On our way to the Moon"
                  : "Approaching the surface"}
              </h1>
              <p>Illustrative flight</p>
              <button
                className="game-dialogue-skip"
                onClick={() =>
                  setStage(stage === "launch" ? "arrival" : "complete")
                }
              >
                {stage === "launch" ? "Skip launch" : "Skip landing"}
              </button>
            </div>
          </GameScene>
        )}

        {stage === "arrival" && (
          <GameScene phase="arrival">
            <h1 className="game-scene-heading" ref={headingRef} tabIndex={-1}>
              Welcome to the Moon
            </h1>
            <GameDialogue
              text={arrivalDialogue[arrivalIndex]}
              active={!dialog}
              onBack={() => {
                if (arrivalIndex > 0) setArrivalIndex((index) => index - 1);
                else {
                  setDialogueIndex(openingDialogue.length - 1);
                  setStage("briefing");
                }
              }}
              onNext={() => {
                if (arrivalIndex < arrivalDialogue.length - 1)
                  setArrivalIndex((index) => index + 1);
                else setStage("selection");
              }}
            />
          </GameScene>
        )}

        {stage === "selection" && (
          <GameScene phase="selection">
            <section
              className="mission-selection"
              aria-labelledby="mission-heading"
            >
              <div className="mission-section-heading">
                <div>
                  <p className="mission-eyebrow">Your mission</p>
                  <h1
                    id="mission-heading"
                    className="mission-title"
                    ref={headingRef}
                    tabIndex={-1}
                  >
                    Where should we land?
                  </h1>
                </div>
                <p>
                  Find a site and date with the Sun and Earth above an idealized
                  horizon.
                </p>
              </div>
              <div className="mission-workspace">
                <div className="mission-map-panel" id="mission-map-panel">
                  <div className="map-heading">
                    <h2 tabIndex={-1} ref={mapHeadingRef}>
                      Explore the sites
                    </h2>
                    <span className="mission-map-counter">
                      {visitedSiteIds.length} of {MISSION_SITES.length} explored
                    </span>
                  </div>
                  <p className="map-caption">Choose a point to explore.</p>
                  <MissionGlobe
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
                      Back to map
                    </button>
                  )}
                  <div className="mission-date-control">
                    <label htmlFor="mission-date">
                      Date <span>· 00:00 UTC</span>
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
                      <h2>Pick a point on the Moon.</h2>
                      <p>
                        Compare the Sun and Earth at one site, then try another.
                      </p>
                    </div>
                  )}
                  {result.error && (
                    <div role="alert" className="mission-error">
                      <h2>Data unavailable</h2>
                      <p>{result.error}</p>
                    </div>
                  )}
                  {analysis && (
                    <div className="analysis-content">
                      <div className="mission-site-heading">
                        <p className="mission-eyebrow">Selected site</p>
                        <h2>{analysis.site.label}</h2>
                        <p>
                          {analysis.site.latitudeDeg}° latitude ·{" "}
                          {analysis.site.longitudeDeg}° longitude
                        </p>
                      </div>
                      <div
                        className="target-cards"
                        aria-label="Direction to explore"
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
                            ? "Both are above the horizon."
                            : "Try another site or date."}
                        </h3>
                        <p>
                          {meetsGoal
                            ? "The centers of the Sun and Earth are above the idealized horizon at this time. This meets the goal of the exercise."
                            : `${analysis.sun.elevationDeg <= 0 && analysis.earth.elevationDeg <= 0 ? "The centers of the Sun and Earth are" : analysis.sun.elevationDeg <= 0 ? "The Sun’s center is" : "Earth’s center is"} on or below the horizon at this time. Try another site or date.`}
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
                          Land here <Arrow direction="down" />
                        </button>
                        {!meetsGoal && (
                          <button
                            className="mission-button mission-button-secondary"
                            onClick={returnToMap}
                          >
                            Choose another point
                          </button>
                        )}
                      </div>
                      <p className="mission-footnote">
                        Center angles only. This exercise does not calculate
                        power, radio performance, or landing safety.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </GameScene>
        )}

        {stage === "complete" && analysis && (
          <GameScene phase="complete">
            <div className="game-result-caption">
              <h1 ref={headingRef} tabIndex={-1}>
                Site selected.
              </h1>
              <h2>{analysis.site.label}</h2>
              <p>{dateLabel}</p>
              <p>
                Sun {formatAngle(analysis.sun.elevationDeg)} · Earth{" "}
                {formatAngle(analysis.earth.elevationDeg)}
              </p>
              <p className="mission-footnote">
                Illustrative landing at a hypothetical site.
              </p>
            </div>
            <GameDialogue
              text={completionDialogue}
              active={!dialog}
              onBack={() => setStage("selection")}
              onNext={() => setStage("selection")}
            />
          </GameScene>
        )}
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
              aria-label="Close dialog"
              onClick={() => setDialog(null)}
            >
              Close <span aria-hidden="true">×</span>
            </button>
            <p className="mission-eyebrow">
              {dialog === "about"
                ? "Context and sources"
                : "A little discovery"}
            </p>
            <h2 id="mission-dialog-title">
              {dialog === "about" ? "About this mission" : "Sound on the Moon"}
            </h2>
            {dialog === "about" ? (
              <>
                <p>
                  This is an educational experience with a fictional guide and a
                  robotic spacecraft. NASA’s Commercial Lunar Payload Services
                  (CLPS) program buys commercial deliveries of science and
                  technology to the Moon.
                </p>
                <p>
                  The four sites are hypothetical. Dates are selected samples at
                  00:00 UTC, not a continuous simulation.
                </p>
                <p>
                  We compare the centers of the Sun and Earth with an idealized
                  lunar horizon. Terrain and flight illustrations do not measure
                  mountain obstruction.
                </p>
                <p>
                  An object above the horizon does not guarantee power, a
                  working radio link, or a safe landing.
                </p>
                <dl className="mission-provenance">
                  <div>
                    <dt>Data</dt>
                    <dd>{MISSION_PROVENANCE.summary}</dd>
                  </div>
                  <div>
                    <dt>Model</dt>
                    <dd>{MISSION_PROVENANCE.model}</dd>
                  </div>
                  <div>
                    <dt>Sources and audit</dt>
                    <dd>{MISSION_PROVENANCE.source}</dd>
                  </div>
                  <div>
                    <dt>Limitations</dt>
                    <dd>{MISSION_PROVENANCE.limitation}</dd>
                  </div>
                </dl>
                <p className="mission-asset-credit">
                  Moon selection adapts the existing{" "}
                  <a href="https://github.com/s4m256/lunar-landing-site-navigator/blob/343d31f/frontend/src/landing-guide/LunarViewport.tsx">
                    repository’s 3D view
                  </a>
                  , with its LROC mosaic and LOLA polar layer. Shading shows
                  relief, not lighting on the selected date or mountain
                  obstruction. The terrain is an approximate visual reference:
                  its source uses MOON_ME, while calculations use IAU_MOON,
                  without a frame transformation.
                </p>
                <p className="mission-asset-credit">
                  Scenery: lunar terrain illustration from{" "}
                  <a href="https://github.com/nasa/NASA-3D-Resources/blob/11ebb4ee043715aefbba6aeec8a61746fad67fa7/Images%20and%20Textures/Moon%20-%20Lunar%20Terrain/Moon%20-%20Lunar%20Terrain.jpg">
                    NASA 3D Resources
                  </a>
                  . It does not depict the selected site or a calculated
                  horizon.
                </p>
                <p className="mission-asset-credit">
                  Astronaut:{" "}
                  <a href="https://poly.google.com/view/dLHpzNdygsg">
                    Astronaut by Poly
                  </a>
                  , licensed under{" "}
                  <a href="https://creativecommons.org/licenses/by/2.0/">
                    CC BY 2.0
                  </a>
                  . Existing image, resized for display, available in{" "}
                  <a href="https://github.com/google/model-viewer/blob/9c6fea9ac579e618bf2932456d3308309017df00/packages/modelviewer.dev/assets/poster-astronaut.webp">
                    model-viewer
                  </a>
                  .
                </p>
                <p className="mission-asset-credit">
                  Dialogue font:{" "}
                  <a href="https://github.com/JetBrains/JetBrainsMono/tree/v2.304">
                    JetBrains Mono
                  </a>
                  , under the{" "}
                  <a href="https://github.com/JetBrains/JetBrainsMono/blob/v2.304/OFL.txt">
                    SIL Open Font License 1.1
                  </a>
                  .
                </p>
                {auditUrl ? (
                  <a
                    className="mission-button mission-button-secondary"
                    href={auditUrl}
                    download="lunar-mission-audit.json"
                  >
                    Download data and audit (JSON)
                  </a>
                ) : (
                  <p>The audit file is unavailable.</p>
                )}
              </>
            ) : (
              <>
                <p>
                  Sound needs a medium to travel through. In the Moon’s vacuum,
                  it cannot travel as it does through air on Earth.
                </p>
                <p>
                  Astronauts use radio to talk to each other. You found a
                  bonus—keep exploring whenever you’re ready.
                </p>
                <button
                  className="mission-button mission-button-primary"
                  onClick={() => setDialog(null)}
                >
                  Back to exploring
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
