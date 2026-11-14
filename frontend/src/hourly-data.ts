import Ajv from "ajv";
import schema from "../../contracts/visibility-window.v1.schema.json";
import { DEMO_SITES, type DemoResult, type Target } from "./scientific-data";

export interface HourlyResult {
  schema_version: "1.0.0";
  window: {
    start_utc: string;
    end_utc: string;
    end_inclusive: true;
    step_seconds: 3600;
    timestamp_count: 721;
    interval_count: 720;
  };
  analysis: DemoResult;
  topography: { status: "unavailable"; reason: string };
  visibility: {
    site_id: string;
    target: Target;
    ideal_visible: boolean[];
    topographic_visible: null;
  }[];
}
export const HOURLY_TIMES = Array.from({ length: 721 }, (_, i) =>
  new Date(Date.UTC(2026, 10, 15, i)).toISOString(),
);
const validate = new Ajv({
  allErrors: true,
  strictNumbers: true,
}).compile<HourlyResult>(schema);

export function parseHourlyResult(value: unknown): HourlyResult {
  if (!validate(value))
    throw new Error("Dataset incompatível com visibility-window 1.0.0.");
  const fail = () => {
    throw new Error(
      "Cobertura ou visibilidade horária incompatível com os dois locais do MVP B.",
    );
  };
  const r = value.analysis.request;
  if (
    value.window.start_utc !== "2026-11-15T00:00:00Z" ||
    value.window.end_utc !== "2026-12-15T00:00:00Z" ||
    value.window.timestamp_count !== 721 ||
    value.window.interval_count !== 720 ||
    value.window.step_seconds !== 3600 ||
    !value.window.end_inclusive
  )
    fail();
  // The original engine has a half-open request; this preserves its contract while
  // the product window includes both endpoints. No sample at Dec15 01:00 is used.
  if (
    r.start_utc !== value.window.start_utc ||
    r.end_utc !== "2026-12-15T01:00:00Z" ||
    r.step_seconds !== 3600
  )
    fail();
  if (new Set(r.sites.map((s) => s.id)).size !== 2) fail();
  for (const expected of DEMO_SITES) {
    const site = r.sites.find((s) => s.id === expected.id);
    if (
      !site ||
      site.latitude_deg !== expected.latitude_deg ||
      site.longitude_east_deg !== expected.longitude_east_deg ||
      site.height_m !== expected.height_m
    )
      fail();
  }
  const pairs = new Set<string>();
  for (const series of value.analysis.series) {
    const key = `${series.site_id}/${series.target}`;
    if (
      pairs.has(key) ||
      !DEMO_SITES.some((s) => s.id === series.site_id) ||
      series.samples.length !== 721
    )
      fail();
    pairs.add(key);
    const flags = value.visibility.filter(
      (v) => v.site_id === series.site_id && v.target === series.target,
    );
    if (
      flags.length !== 1 ||
      flags[0].ideal_visible.length !== 721 ||
      flags[0].topographic_visible !== null
    )
      fail();
    series.samples.forEach((sample, i) => {
      if (
        sample.utc !== HOURLY_TIMES[i] ||
        !Number.isFinite(sample.azimuth_deg) ||
        !Number.isFinite(sample.elevation_deg) ||
        flags[0].ideal_visible[i] !== sample.elevation_deg > 0
      )
        fail();
    });
  }
  if (
    pairs.size !== 4 ||
    value.visibility.length !== 4 ||
    value.topography.status !== "unavailable"
  )
    fail();
  return value;
}

export function sampledTransitions(flags: boolean[], timestamps: string[]) {
  const epochs = timestamps.map((t) => Date.parse(t));
  if (
    flags.length !== timestamps.length ||
    flags.length < 2 ||
    flags.some((f) => typeof f !== "boolean") ||
    timestamps.some((t) => !t.endsWith("Z")) ||
    epochs.some((t, i) => !Number.isFinite(t) || (i > 0 && t <= epochs[i - 1]))
  ) {
    throw new Error(
      "Transições exigem estados e timestamps UTC correspondentes e crescentes.",
    );
  }
  return flags.flatMap((visible, i) =>
    i > 0 && visible !== flags[i - 1]
      ? [
          {
            from: timestamps[i - 1],
            to: timestamps[i],
            becomesVisible: visible,
          },
        ]
      : [],
  );
}
