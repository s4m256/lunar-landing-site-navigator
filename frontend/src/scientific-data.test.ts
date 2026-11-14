import { describe, expect, it } from "vitest";
import published from "../../docs/audits/pr4/result-2026.json";
import { getSample, parseDemoResult } from "./scientific-data";

// Negative fixtures are mutations for consumer validation, never scientific results.
const fixture = () => JSON.parse(JSON.stringify(published)) as typeof published;

describe("MVP A scientific consumer", () => {
  it("retains the published request and full provenance without altering source values", () => {
    const result = parseDemoResult(published);
    expect(result.request).toEqual(published.request);
    expect(result.provenance).toEqual(published.provenance);
    expect(result.series).toEqual(published.series);
    expect(result.request.sites.map((site) => site.id).sort()).toEqual([
      "south-a",
      "south-b",
    ]);
    expect(result.provenance.frame).toBe("IAU_MOON");
    expect(result.provenance.correction).toBe("CN+S");
    expect(result.provenance.horizons_validation).toBe(
      "not_performed_in_engine",
    );
  });

  it("retrieves each real sample by local, target and exact UTC across all four series", () => {
    const result = parseDemoResult(published);
    for (const series of published.series) {
      expect(series.samples).toHaveLength(365);
      expect(series.samples[0].utc).toBe("2026-01-01T00:00:00.000Z");
      expect(series.samples.at(-1)?.utc).toBe("2026-12-31T00:00:00.000Z");
      for (const sample of series.samples) {
        expect(
          getSample(
            result,
            series.site_id,
            series.target as "SUN" | "EARTH",
            sample.utc,
          ),
        ).toEqual(sample);
      }
    }
    expect(
      getSample(result, "south-a", "SUN", "2026-01-01T00:00:00.000Z")
        ?.azimuth_deg,
    ).toBe(32.52825562822418);
    expect(
      getSample(result, "south-a", "EARTH", "2026-01-01T00:00:00.000Z")
        ?.elevation_deg,
    ).toBe(6.781256907477674);
  });

  it("uses site and target keys rather than the position of a series in the artifact", () => {
    const shuffled = fixture();
    shuffled.series.reverse();
    const result = parseDemoResult(shuffled);
    for (const original of published.series) {
      const sample = original.samples[180];
      expect(
        getSample(
          result,
          original.site_id,
          original.target as "SUN" | "EARTH",
          sample.utc,
        ),
      ).toEqual(sample);
    }
  });

  it("does not infer values for arbitrary locations, dates, hours or the excluded end", () => {
    const result = parseDemoResult(published);
    expect(
      getSample(result, "my-location", "SUN", "2026-01-01T00:00:00.000Z"),
    ).toBeUndefined();
    for (const utc of [
      "2025-12-31T00:00:00.000Z",
      "2026-01-01T12:00:00.000Z",
      "2027-01-01T00:00:00.000Z",
    ]) {
      expect(getSample(result, "south-a", "SUN", utc)).toBeUndefined();
    }
  });

  it.each([
    [
      "unknown contract",
      (value: ReturnType<typeof fixture>) => {
        value.schema_version = "2.0.0";
      },
    ],
    [
      "missing target pair",
      (value: ReturnType<typeof fixture>) => {
        value.series.pop();
      },
    ],
    [
      "duplicate target pair allowed structurally by the schema",
      (value: ReturnType<typeof fixture>) => {
        value.series[1] = structuredClone(value.series[0]);
      },
    ],
    [
      "unknown local ID",
      (value: ReturnType<typeof fixture>) => {
        value.series[0].site_id = "uncomputed-site";
      },
    ],
    [
      "wrong latitude for Local A",
      (value: ReturnType<typeof fixture>) => {
        value.request.sites[0].latitude_deg = -89;
      },
    ],
    [
      "wrong east longitude for Local B",
      (value: ReturnType<typeof fixture>) => {
        value.request.sites[1].longitude_east_deg = 270;
      },
    ],
    [
      "nonzero observer height",
      (value: ReturnType<typeof fixture>) => {
        value.request.sites[0].height_m = 1;
      },
    ],
    [
      "duplicate site IDs",
      (value: ReturnType<typeof fixture>) => {
        value.request.sites[1].id = value.request.sites[0].id;
      },
    ],
    [
      "unsupported start",
      (value: ReturnType<typeof fixture>) => {
        value.request.start_utc = "2025-01-01T00:00:00Z";
      },
    ],
    [
      "inclusive end masquerading as covered data",
      (value: ReturnType<typeof fixture>) => {
        value.request.end_utc = "2026-12-31T00:00:00Z";
      },
    ],
    [
      "different cadence",
      (value: ReturnType<typeof fixture>) => {
        value.request.step_seconds = 3600;
      },
    ],
    [
      "short series",
      (value: ReturnType<typeof fixture>) => {
        value.series[0].samples.pop();
      },
    ],
    [
      "duplicate timestamp",
      (value: ReturnType<typeof fixture>) => {
        value.series[0].samples[1].utc = value.series[0].samples[0].utc;
      },
    ],
    [
      "different grid for one pair",
      (value: ReturnType<typeof fixture>) => {
        value.series[2].samples[0].utc = "2026-01-01T01:00:00.000Z";
      },
    ],
    [
      "invalid calendar date",
      (value: ReturnType<typeof fixture>) => {
        value.series[0].samples[58].utc = "2026-02-29T00:00:00.000Z";
      },
    ],
    [
      "NaN angle",
      (value: ReturnType<typeof fixture>) => {
        value.series[0].samples[0].elevation_deg = Number.NaN;
      },
    ],
    [
      "infinite angle",
      (value: ReturnType<typeof fixture>) => {
        value.series[0].samples[0].azimuth_deg = Number.POSITIVE_INFINITY;
      },
    ],
    [
      "azimuth below range",
      (value: ReturnType<typeof fixture>) => {
        value.series[0].samples[0].azimuth_deg = -1;
      },
    ],
    [
      "elevation above range",
      (value: ReturnType<typeof fixture>) => {
        value.series[0].samples[0].elevation_deg = 91;
      },
    ],
  ])("rejects %s explicitly", (_description, mutate) => {
    const invalid = fixture();
    mutate(invalid);
    expect(() => parseDemoResult(invalid)).toThrow();
  });

  it("rejects absent data and the old status-only contract instead of fabricating samples", () => {
    for (const invalid of [
      null,
      undefined,
      {},
      {
        schema_version: "1.0.0",
        status: "not_implemented",
        message: "Not calculated",
      },
    ]) {
      expect(() => parseDemoResult(invalid)).toThrow();
    }
  });
});
