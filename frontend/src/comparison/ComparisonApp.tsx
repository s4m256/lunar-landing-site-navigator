import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { MissionGlobe } from "../mission/globe/MissionGlobe";
import { HorizonDiagram } from "../mission/HorizonDiagram";
import {
  DEFAULT_MISSION_DATE,
  MISSION_AUDIT,
  MISSION_PROVENANCE,
  MISSION_SITES,
} from "../mission/mission-data";
import type { TargetName } from "../mission/types";
import { readScenario, ScenarioCard, type ScenarioValue } from "./ScenarioCard";
import "./comparison.css";

type Slot = "A" | "B";
const number = (slot: Slot) => (slot === "A" ? "1" : "2");
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("en", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));

function difference(body: string, first: number, second: number) {
  const delta = second - first;
  if (delta === 0) return `${body}: same elevation.`;
  const magnitude = Math.abs(delta);
  const amount =
    magnitude < 0.1 ? "less than 0.1°" : `${magnitude.toFixed(1)}°`;
  return `${body}: ${amount} ${delta > 0 ? "higher" : "lower"} in scenario 2.`;
}

function About({
  onClose,
  auditUrl,
}: {
  onClose: () => void;
  auditUrl?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  function trap(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
    if (event.key !== "Tab") return;
    const controls =
      ref.current?.querySelectorAll<HTMLElement>("button, a[href]");
    if (!controls?.length) return;
    const first = controls[0],
      last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  return (
    <div
      className="comparison-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="comparison-about-title"
        className="comparison-about"
        onKeyDown={trap}
      >
        <div className="comparison-about-heading">
          <h2 id="comparison-about-title">About this explorer</h2>
          <button type="button" onClick={onClose} aria-label="Close about">
            Close
          </button>
        </div>
        <p>
          NASA's Commercial Lunar Payload Services (CLPS) missions deliver
          robotic science payloads to the Moon. This educational prototype
          compares the directions of the Sun and Earth at hypothetical sites.
        </p>
        <h3>What the results mean</h3>
        <p>
          Elevation is the angle above or below a level, tangent horizon.
          Azimuth gives the direction around that horizon, clockwise from local
          north. Both refer to the center of the body.
        </p>
        <p>
          The four sites lie at 85° south. Three selected dates are available,
          each at 00:00 UTC. These snapshots do not establish sunlight duration,
          communication windows, or rise/set times. A higher angle is not a
          landing recommendation.
        </p>
        <p>
          The calculation does not include mountain obstruction, shadows,
          eclipses, power generation, radio performance, or landing safety. The
          Moon's terrain shading is fixed, not the illumination at the selected
          date.
        </p>
        <dl>
          <dt>Geometry</dt>
          <dd>{MISSION_PROVENANCE.model}</dd>
          <dt>Data</dt>
          <dd>{MISSION_PROVENANCE.source}</dd>
          <dt>Validation limits</dt>
          <dd>{MISSION_PROVENANCE.limitation}</dd>
        </dl>
        <h3>Sources and credits</h3>
        <p>
          The Moon view reuses the LROC mosaic and LOLA polar DEM from{" "}
          <a href="https://github.com/zaczusantos-ops/aistudiolandingguide/tree/6d2e5310aba05edb6436975ba7915cd2b82f5bba">
            Isaac's AI Studio project
          </a>
          , via the{" "}
          <a href="https://github.com/s4m256/lunar-landing-site-navigator/tree/343d31f">
            existing repository integration
          </a>
          . The DEM uses MOON_ME; analysis uses IAU_MOON, with no frame
          transformation. This is an approximate map, not precision landing
          terrain.
        </p>
        <p>
          Numerals use{" "}
          <a href="https://github.com/JetBrains/JetBrainsMono/tree/v2.304">
            JetBrains Mono
          </a>
          , licensed under{" "}
          <a href="https://github.com/JetBrains/JetBrainsMono/blob/v2.304/OFL.txt">
            SIL OFL 1.1
          </a>
          .
        </p>
        {auditUrl ? (
          <a
            className="comparison-download"
            href={auditUrl}
            download="lunar-comparison-source-data.json"
          >
            Download source data (JSON)
          </a>
        ) : (
          <p>Source data download unavailable.</p>
        )}
      </div>
    </div>
  );
}

export function ComparisonApp() {
  const [values, setValues] = useState<Record<Slot, ScenarioValue>>({
    A: { date: DEFAULT_MISSION_DATE },
    B: { date: DEFAULT_MISSION_DATE },
  });
  const [active, setActive] = useState<Slot>("A");
  const [comparing, setComparing] = useState(false);
  const [target, setTarget] = useState<TargetName>("sun");
  const [about, setAbout] = useState(false);
  const [auditUrl, setAuditUrl] = useState<string>();
  const [visited, setVisited] = useState<string[]>([]);
  const compareButton = useRef<HTMLButtonElement>(null);
  const secondCard = useRef<HTMLDivElement>(null);
  const wasComparing = useRef(false);
  const first = useMemo(() => readScenario(values.A), [values.A]);
  const second = useMemo(() => readScenario(values.B), [values.B]);
  const current = active === "A" ? first : second;
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
  useEffect(() => {
    if (comparing && !wasComparing.current)
      secondCard.current?.querySelector<HTMLButtonElement>("button")?.focus();
    else if (!comparing && wasComparing.current) compareButton.current?.focus();
    wasComparing.current = comparing;
  }, [comparing]);
  function update(slot: Slot, value: ScenarioValue) {
    setValues((previous) => ({ ...previous, [slot]: value }));
    if (value.siteId)
      setVisited((previous) =>
        previous.includes(value.siteId!)
          ? previous
          : [...previous, value.siteId!],
      );
  }
  function selectSite(siteId: string) {
    if (!MISSION_SITES.some((site) => site.id === siteId)) return;
    update(active, { ...values[active], siteId });
  }
  function addComparison() {
    if (!first.analysis) return;
    setValues((previous) => ({ ...previous, B: { ...previous.A } }));
    setComparing(true);
    setActive("B");
  }
  const comparisonKind =
    first.analysis && second.analysis
      ? values.A.siteId === values.B.siteId
        ? values.A.date === values.B.date
          ? "Same site and date. Change scenario 2 to compare."
          : "Same site. Different dates."
        : values.A.date === values.B.date
          ? "Different sites. Same date."
          : "Different sites and dates."
      : "";

  return (
    <main className="comparison-app">
      <div className="comparison-content" inert={about}>
        <header className="comparison-header">
          <a className="comparison-brand" href="#explorer">
            ◒ <span>LUNAR</span>
            <span className="comparison-brand-caption">SITE EXPLORER</span>
          </a>
          <button
            className="comparison-about-trigger"
            type="button"
            onClick={() => setAbout(true)}
          >
            About &amp; data
          </button>
        </header>
        <section className="comparison-intro" id="explorer">
          <p className="comparison-eyebrow">LUNAR SOUTH POLE</p>
          <h1>Compare lunar landing sites</h1>
          <p>
            Choose a site and date. Compare the Sun and Earth above the horizon.
          </p>
        </section>
        <div className="comparison-layout">
          <section className="comparison-moon" aria-labelledby="moon-heading">
            <div className="comparison-section-heading">
              <h2 id="moon-heading">Explore the Moon</h2>
              <span>4 hypothetical sites</span>
            </div>
            <p className="comparison-map-instruction">
              Choose a point for <strong>scenario {number(active)}</strong>, or
              use its site menu.
            </p>
            <MissionGlobe
              sites={MISSION_SITES}
              selectedSiteId={values[active].siteId}
              comparisonSiteIds={
                comparing
                  ? [values.A.siteId, values.B.siteId].filter(
                      (id): id is string => !!id,
                    )
                  : []
              }
              visitedSiteIds={visited}
              onSelect={selectSite}
            />
          </section>
          <section
            className="comparison-panel"
            aria-label="Scenario comparison"
          >
            <div className="comparison-section-heading">
              <h2>Your scenarios</h2>
              <span>All samples at 00:00 UTC</span>
            </div>
            <div
              className={`comparison-cards${comparing ? " comparison-cards--pair" : ""}`}
            >
              <ScenarioCard
                slot="A"
                value={values.A}
                active={active === "A"}
                onActivate={() => setActive("A")}
                onChange={(value) => update("A", value)}
              />
              {comparing && (
                <div ref={secondCard}>
                  <ScenarioCard
                    slot="B"
                    value={values.B}
                    active={active === "B"}
                    onActivate={() => setActive("B")}
                    onChange={(value) => update("B", value)}
                    onRemove={() => {
                      setComparing(false);
                      setActive("A");
                    }}
                  />
                </div>
              )}
            </div>
            {!comparing && (
              <button
                ref={compareButton}
                className="comparison-add"
                type="button"
                disabled={!first.analysis}
                onClick={addComparison}
              >
                + Compare another scenario
              </button>
            )}
            {comparing && first.analysis && second.analysis && (
              <div
                className="comparison-summary"
                aria-label="Comparison summary"
              >
                <p>{comparisonKind}</p>
                {(values.A.siteId !== values.B.siteId ||
                  values.A.date !== values.B.date) && (
                  <p>
                    {difference(
                      "Sun",
                      first.analysis.sun.elevationDeg,
                      second.analysis.sun.elevationDeg,
                    )}{" "}
                    {difference(
                      "Earth",
                      first.analysis.earth.elevationDeg,
                      second.analysis.earth.elevationDeg,
                    )}
                  </p>
                )}
              </div>
            )}
            <p
              className="comparison-announcement"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {current.analysis
                ? `Editing scenario ${number(active)}: ${current.analysis.site.label}, ${dateLabel(values[active].date)}.`
                : `Choose a site for scenario ${number(active)}.`}
            </p>
            <div className="comparison-meaning">
              <p>
                <strong>Sunlight powers solar panels.</strong> The Sun's
                direction is one part of understanding the available light.
              </p>
              <p>
                <strong>Earth visibility matters for direct radio.</strong> A
                clear direction toward Earth is one part of a working
                connection.
              </p>
            </div>
            {current.analysis && (
              <section
                className="comparison-horizon"
                aria-labelledby="horizon-heading"
              >
                <div className="comparison-horizon-header">
                  <h2 id="horizon-heading">
                    Scenario {number(active)} · horizon view
                  </h2>
                  <div
                    className="comparison-targets"
                    role="group"
                    aria-label="Body shown in the horizon view"
                  >
                    {(["sun", "earth"] as const).map((body) => (
                      <button
                        key={body}
                        type="button"
                        aria-pressed={target === body}
                        onClick={() => setTarget(body)}
                      >
                        {body === "sun" ? "Sun" : "Earth"}
                      </button>
                    ))}
                  </div>
                </div>
                <HorizonDiagram analysis={current.analysis} target={target} />
              </section>
            )}
            <p className="comparison-limitation">
              Geometry snapshots only. Terrain obstruction, power, radio
              performance, and landing safety are not calculated.
            </p>
          </section>
        </div>
      </div>
      {about && <About onClose={() => setAbout(false)} auditUrl={auditUrl} />}
    </main>
  );
}
