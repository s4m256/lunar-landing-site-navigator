import Ajv from "ajv";
import schema from "../../contracts/analysis-result.v1.schema.json";

export type Target = "SUN" | "EARTH";
export interface Sample {
  utc: string;
  azimuth_deg: number;
  elevation_deg: number;
}
export interface ScientificSite {
  id: string;
  latitude_deg: number;
  longitude_east_deg: number;
  height_m: number;
}
export interface DemoResult {
  schema_version: "1.0.0";
  request: {
    schema_version: "1.0.0";
    frame: "IAU_MOON";
    surface_radius_m: number;
    sites: ScientificSite[];
    start_utc: string;
    end_utc: string;
    step_seconds: number;
  };
  series: { site_id: string; target: Target; samples: Sample[] }[];
  provenance: {
    schema_version: "1.0.0";
    engine_version: string;
    spiceypy_version: string;
    numpy_version: string;
    cspice_version: string;
    frame: "IAU_MOON";
    correction: "CN+S";
    frame_epoch: "OBSERVER";
    time_scale: string;
    surface_radius_m: number;
    horizon_elevation_deg: number;
    azimuth_convention: string;
    kernels: {
      filename: string;
      url: string;
      sha256: string;
      type: string;
      coverage_et: Record<string, number[][]>;
    }[];
    horizons_validation: "not_performed_in_engine";
    limitations: string[];
  };
}
const validate = new Ajv({
  allErrors: true,
  strictNumbers: true,
}).compile<DemoResult>(schema);
export const DEMO_SITES: readonly ScientificSite[] = [
  { id: "south-a", latitude_deg: -89.5, longitude_east_deg: 0, height_m: 0 },
  { id: "south-b", latitude_deg: -89, longitude_east_deg: 90, height_m: 0 },
];
export const siteLabel = (id: string) =>
  id === "south-a" ? "Local A" : id === "south-b" ? "Local B" : id;
export const DEMO_TIMESTAMPS = Array.from({ length: 365 }, (_, i) =>
  new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
);

/** The schema alone permits duplicate pairs and incomplete grids. Enforce MVP coverage as well. */
export function parseDemoResult(value: unknown): DemoResult {
  if (!validate(value))
    throw new Error("Dataset incompatível com analysis-result 1.0.0.");
  const fail = () => {
    throw new Error(
      "Dataset incompatível com a cobertura demonstrativa de 2026.",
    );
  };
  const request = value.request;
  if (
    request.start_utc !== "2026-01-01T00:00:00Z" ||
    request.end_utc !== "2027-01-01T00:00:00Z" ||
    request.step_seconds !== 86400
  )
    fail();
  if (new Set(request.sites.map((s) => s.id)).size !== 2) fail();
  for (const expected of DEMO_SITES) {
    const site = request.sites.find((s) => s.id === expected.id);
    if (
      !site ||
      site.latitude_deg !== expected.latitude_deg ||
      site.longitude_east_deg !== expected.longitude_east_deg ||
      site.height_m !== expected.height_m
    )
      fail();
  }
  const pairs = new Set<string>();
  for (const series of value.series) {
    const pair = `${series.site_id}/${series.target}`;
    if (!DEMO_SITES.some((s) => s.id === series.site_id) || pairs.has(pair))
      fail();
    pairs.add(pair);
    if (series.samples.length !== 365) fail();
    series.samples.forEach((sample, i) => {
      if (
        sample.utc !== DEMO_TIMESTAMPS[i] ||
        !Number.isFinite(sample.azimuth_deg) ||
        !Number.isFinite(sample.elevation_deg)
      )
        fail();
    });
  }
  return value;
}

/** Exact UTC match only. No nearest date, extrapolation or interpolation. */
export function getSample(
  result: DemoResult,
  siteId: string,
  target: Target,
  utc: string,
): Sample | undefined {
  return result.series
    .find((s) => s.site_id === siteId && s.target === target)
    ?.samples.find((s) => s.utc === utc);
}
