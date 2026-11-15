import { useId } from "react";
import {
  classifyMissionElevation,
  getMissionAnalysis,
  MISSION_DATES,
  MISSION_SITES,
} from "../mission/mission-data";
import type { MissionAnalysis, MissionDirection } from "../mission/types";
import "./scenario-card.css";

export interface ScenarioValue {
  siteId?: string;
  date: string;
}

export interface ScenarioCardProps {
  slot: "A" | "B";
  value: ScenarioValue;
  active: boolean;
  onActivate: () => void;
  onChange: (value: ScenarioValue) => void;
  onRemove?: () => void;
}

function validDirection(direction: MissionDirection): boolean {
  return (
    Number.isFinite(direction.azimuthDeg) &&
    direction.azimuthDeg >= 0 &&
    direction.azimuthDeg < 360 &&
    Number.isFinite(direction.elevationDeg) &&
    Math.abs(direction.elevationDeg) <= 90 &&
    direction.state === classifyMissionElevation(direction.elevationDeg)
  );
}

export function readScenario(value: ScenarioValue): {
  analysis?: MissionAnalysis;
  error?: string;
} {
  if (!value.siteId) return {};
  const unavailable = { error: "Data unavailable. Try another site or date." };
  const site = MISSION_SITES.find((item) => item.id === value.siteId);
  if (!site || !MISSION_DATES.some((item) => item.value === value.date))
    return unavailable;
  try {
    const result = getMissionAnalysis(site.id, value.date);
    if (
      !result ||
      result.site.id !== site.id ||
      result.site.latitudeDeg !== site.latitudeDeg ||
      result.site.longitudeDeg !== site.longitudeDeg ||
      result.utc !== `${value.date}T00:00:00.000Z` ||
      !validDirection(result.sun) ||
      !validDirection(result.earth)
    )
      return unavailable;
    return { analysis: result };
  } catch {
    return unavailable;
  }
}

function DirectionRow({
  name,
  direction,
}: {
  name: "Sun" | "Earth";
  direction: MissionDirection;
}) {
  const status =
    direction.elevationDeg > 0
      ? "Above"
      : direction.elevationDeg < 0
        ? "Below"
        : "On";
  return (
    <div
      className={`scenario-card__direction scenario-card__direction--${name.toLowerCase()}`}
    >
      <span className="scenario-card__body">{name}</span>
      <span>
        {direction.elevationDeg !== 0 && Math.abs(direction.elevationDeg) < 0.1
          ? Number(direction.elevationDeg.toPrecision(2)).toString()
          : direction.elevationDeg.toFixed(1)}
        ° elevation
      </span>
      <span>{status} horizon</span>
      <span className="scenario-card__azimuth">
        Azimuth {direction.azimuthDeg.toFixed(1)}°
      </span>
    </div>
  );
}

export function ScenarioCard({
  slot,
  value,
  active,
  onActivate,
  onChange,
  onRemove,
}: ScenarioCardProps) {
  const id = useId();
  const { analysis, error } = readScenario(value);
  const number = slot === "A" ? "1" : "2";
  const change = (next: ScenarioValue) => {
    onActivate();
    onChange(next);
  };

  return (
    <section
      className={`scenario-card${active ? " scenario-card--active" : ""}`}
      aria-label={`Scenario ${number}`}
    >
      <div className="scenario-card__header">
        <button
          type="button"
          className="scenario-card__activate"
          aria-label={`Scenario ${number}`}
          aria-pressed={active}
          onClick={onActivate}
        >
          Scenario {number}
        </button>
        {slot === "B" && onRemove && (
          <button
            type="button"
            className="scenario-card__remove"
            onClick={onRemove}
          >
            Remove scenario 2
          </button>
        )}
      </div>
      <div className="scenario-card__fields">
        <label htmlFor={`${id}-site`}>
          Site
          <select
            id={`${id}-site`}
            aria-label={`Site for scenario ${number}`}
            value={value.siteId ?? ""}
            onChange={(event) =>
              change({ ...value, siteId: event.target.value || undefined })
            }
          >
            <option value="">Choose a point</option>
            {MISSION_SITES.map((site) => (
              <option value={site.id} key={site.id}>
                {site.label}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`${id}-date`}>
          Date
          <select
            id={`${id}-date`}
            aria-label={`Date for scenario ${number}`}
            value={value.date}
            onChange={(event) => change({ ...value, date: event.target.value })}
          >
            {MISSION_DATES.map((date) => (
              <option value={date.value} key={date.value}>
                {date.label.split(" — ")[0]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {analysis ? (
        <div className="scenario-card__results">
          <p>Centers relative to an ideal horizon; terrain is not included.</p>
          <DirectionRow name="Sun" direction={analysis.sun} />
          <DirectionRow name="Earth" direction={analysis.earth} />
        </div>
      ) : error ? (
        <p className="scenario-card__message" role="status">
          {error}
        </p>
      ) : (
        <p className="scenario-card__message">
          Choose a point to see Sun and Earth directions.
        </p>
      )}
    </section>
  );
}
