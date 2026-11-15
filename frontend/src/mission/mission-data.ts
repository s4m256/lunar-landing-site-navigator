import Ajv from "ajv";
import schema from "../../../contracts/analysis-result.v1.schema.json";
import batchAB from "../../../docs/audits/mission/result-ab-2026.json";
import batchCD from "../../../docs/audits/mission/result-cd-2026.json";
import manifest from "../../../docs/audits/mission/manifest.json";
import type { DemoResult, Sample } from "../scientific-data";
import type {
  DirectionState,
  MissionAnalysis,
  MissionDate,
  MissionDirection,
  MissionProvenance,
  MissionSite,
} from "./types";

export const MISSION_SITES: MissionSite[] = [
  { id: "mission-a", label: "Site A", latitudeDeg: -85, longitudeDeg: 0 },
  { id: "mission-b", label: "Site B", latitudeDeg: -85, longitudeDeg: 90 },
  { id: "mission-c", label: "Site C", latitudeDeg: -85, longitudeDeg: 180 },
  { id: "mission-d", label: "Site D", latitudeDeg: -85, longitudeDeg: 270 },
];

export const MISSION_DATES: MissionDate[] = [
  { value: "2026-03-24", label: "March 24, 2026 — 00:00 UTC" },
  { value: "2026-04-28", label: "April 28, 2026 — 00:00 UTC" },
  { value: "2026-09-08", label: "September 8, 2026 — 00:00 UTC" },
];
export const DEFAULT_MISSION_DATE = MISSION_DATES[0].value;

export const MISSION_PROVENANCE: MissionProvenance = {
  summary:
    "Apparent directions to the centers of the Sun and Earth, calculated with SPICE for three dates in 2026 at 00:00 UTC.",
  model:
    "IAU_MOON · CN+S · sphere radius 1,737,400 m · radial height 0 m · tangent horizon 0°.",
  source:
    "JPL DE421 via skyfield-data 7.0.0; PCK/LSK via a SpiceyPy mirror. Files checked by SHA-256.",
  limitation:
    "Hypothetical sites. No terrain, body disks, eclipses, or guarantee of power or communication. No independent Horizons validation; physical accuracy and LSK currency are unconfirmed.",
};

const validate = new Ajv({
  allErrors: true,
  strictNumbers: true,
}).compile<DemoResult>(schema);
const expectedTimes = Array.from({ length: 365 }, (_, day) =>
  new Date(Date.UTC(2026, 0, day + 1)).toISOString(),
);

/** Validate the unchanged scientific contract and the exact four-site mission grid. */
export function parseMissionResults(input: unknown): DemoResult[] {
  const fail = (detail: string): never => {
    throw new Error(`Invalid mission scientific data: ${detail}.`);
  };
  if (!Array.isArray(input) || input.length !== 2)
    return fail("expected two batches");
  const results: DemoResult[] = [];
  const seenSites = new Set<string>();
  for (const candidate of input) {
    if (!validate(candidate)) return fail("analysis-result 1.0.0 contract");
    const { request, series, provenance } = candidate;
    if (
      request.start_utc !== "2026-01-01T00:00:00Z" ||
      request.end_utc !== "2027-01-01T00:00:00Z" ||
      request.step_seconds !== 86400
    )
      return fail("incompatible interval or cadence");
    const localIds = new Set<string>();
    for (const actual of request.sites) {
      const expected = MISSION_SITES.find((site) => site.id === actual.id);
      if (
        !expected ||
        seenSites.has(actual.id) ||
        actual.latitude_deg !== expected.latitudeDeg ||
        actual.longitude_east_deg !== expected.longitudeDeg ||
        actual.height_m !== 0
      )
        return fail("missing, duplicate, or incompatible observer");
      localIds.add(actual.id);
      seenSites.add(actual.id);
    }
    const pairs = new Set<string>();
    for (const row of series) {
      const pair = `${row.site_id}/${row.target}`;
      if (!localIds.has(row.site_id) || pairs.has(pair))
        return fail("incompatible site/target pair");
      pairs.add(pair);
      if (row.samples.length !== expectedTimes.length)
        return fail("incomplete series");
      row.samples.forEach((sample, index) => {
        if (
          sample.utc !== expectedTimes[index] ||
          !Number.isFinite(sample.azimuth_deg) ||
          sample.azimuth_deg >= 360 ||
          !Number.isFinite(sample.elevation_deg)
        )
          fail("incompatible sample, time, or angle");
      });
    }
    if (provenance.kernels.length !== manifest.kernels.length)
      return fail("incompatible kernel set");
    for (const expected of manifest.kernels) {
      const matching = provenance.kernels.filter(
        (kernel) => kernel.filename === expected.filename,
      );
      if (
        matching.length !== 1 ||
        matching[0].sha256 !== expected.sha256 ||
        matching[0].url !== expected.url
      )
        return fail("incompatible kernel source or hash");
    }
    results.push(candidate);
  }
  if (seenSites.size !== MISSION_SITES.length)
    return fail("incomplete coverage of the four sites");
  return results;
}

// Defer the error to the UI's guarded lookup, rather than crashing the module import.
const loaded = (() => {
  try {
    return {
      results: parseMissionResults([batchAB, batchCD]),
      error: undefined,
    };
  } catch (error) {
    return {
      results: undefined,
      error:
        error instanceof Error
          ? error
          : new Error(
              "Invalid mission scientific data: read failure.",
            ),
    };
  }
})();

/** Original requests, samples, versions, acquisition notes and hashes for a JSON download. */
export const MISSION_AUDIT = loaded.results
  ? { manifest, results: loaded.results }
  : undefined;

/** No rounding band: the exercise concerns the signed centre elevation itself. */
export function classifyMissionElevation(elevationDeg: number): DirectionState {
  if (!Number.isFinite(elevationDeg) || Math.abs(elevationDeg) > 90)
    throw new Error(
      "Invalid mission scientific data: elevation out of range.",
    );
  return elevationDeg > 0 ? "above" : elevationDeg < 0 ? "below" : "on-horizon";
}

function direction(sample: Sample): MissionDirection {
  return {
    azimuthDeg: sample.azimuth_deg,
    elevationDeg: sample.elevation_deg,
    state: classifyMissionElevation(sample.elevation_deg),
  };
}

/** Only curated dates at exact 00 UTC; unknown inputs never inherit a previous result. */
export function getMissionAnalysis(
  siteId: string,
  date: string,
): MissionAnalysis | undefined {
  if (loaded.error) throw loaded.error;
  const site = MISSION_SITES.find((candidate) => candidate.id === siteId);
  if (!site || !MISSION_DATES.some((candidate) => candidate.value === date))
    return undefined;
  const utc = `${date}T00:00:00.000Z`;
  const sample = (target: "SUN" | "EARTH") =>
    loaded
      .results!.flatMap((result) => result.series)
      .find((series) => series.site_id === siteId && series.target === target)
      ?.samples.find((candidate) => candidate.utc === utc);
  const sun = sample("SUN");
  const earth = sample("EARTH");
  if (!sun || !earth) return undefined;
  return {
    site: { ...site },
    utc,
    sun: direction(sun),
    earth: direction(earth),
    meetsGoal: sun.elevation_deg > 0 && earth.elevation_deg > 0,
  };
}
