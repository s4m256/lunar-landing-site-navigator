import { describe, expect, it } from "vitest";
import published from "../../docs/data/mvp-b-hourly.json";
import {
  HOURLY_TIMES,
  parseHourlyResult,
  sampledTransitions,
} from "./hourly-data";
import { getSample, type Target } from "./scientific-data";

// Invalid examples below are explicit mutations for validator tests, never lunar evidence.
const fixture = () => structuredClone(published);
type Fixture = ReturnType<typeof fixture>;

describe("MVP B hourly scientific consumer", () => {
  it("preserves the two covered sites, provenance and inclusive 721-stamp / 720-interval window", () => {
    const value = parseHourlyResult(published);
    expect(value.analysis.provenance).toEqual(published.analysis.provenance);
    expect(value.analysis.request.sites).toEqual([
      {
        id: "south-a",
        latitude_deg: -89.5,
        longitude_east_deg: 0,
        height_m: 0,
      },
      { id: "south-b", latitude_deg: -89, longitude_east_deg: 90, height_m: 0 },
    ]);
    expect(HOURLY_TIMES).toHaveLength(721);
    expect(HOURLY_TIMES[0]).toBe("2026-11-15T00:00:00.000Z");
    expect(HOURLY_TIMES.at(-1)).toBe("2026-12-15T00:00:00.000Z");
    expect(
      (Date.parse(HOURLY_TIMES.at(-1)!) - Date.parse(HOURLY_TIMES[0])) /
        3600000,
    ).toBe(720);
    expect(value.window.interval_count).toBe(720);
    expect(value.analysis.request.end_utc).toBe("2026-12-15T01:00:00Z");
    expect(value.topography.status).toBe("unavailable");
    expect(
      value.visibility.every((row) => row.topographic_visible === null),
    ).toBe(true);
  });

  it("retrieves all 2884 actual pair/UTC samples with their own angles and strict zero-horizon flags", () => {
    const value = parseHourlyResult(published);
    let count = 0;
    for (const series of published.analysis.series) {
      const flags = value.visibility.find(
        (row) => row.site_id === series.site_id && row.target === series.target,
      )!;
      expect(series.samples).toHaveLength(721);
      for (const [index, sample] of series.samples.entries()) {
        const actual = getSample(
          value.analysis,
          series.site_id,
          series.target as Target,
          HOURLY_TIMES[index],
        );
        expect(actual).toEqual(sample);
        expect(flags.ideal_visible[index]).toBe(sample.elevation_deg > 0);
        count++;
      }
    }
    expect(count).toBe(2884);
  });

  it("associates coordinates, series and visibility by site/target keys rather than array order", () => {
    const shuffled = fixture();
    shuffled.analysis.request.sites.reverse();
    shuffled.analysis.series.reverse();
    shuffled.visibility.reverse();
    const value = parseHourlyResult(shuffled);
    for (const series of published.analysis.series) {
      expect(
        getSample(
          value.analysis,
          series.site_id,
          series.target as Target,
          HOURLY_TIMES[360],
        ),
      ).toEqual(series.samples[360]);
    }
  });

  it("does not return samples for arbitrary coordinates, hours outside coverage, or the exclusive source end", () => {
    const value = parseHourlyResult(published);
    for (const utc of [
      "2026-11-14T23:00:00.000Z",
      "2026-11-15T00:30:00.000Z",
      "2026-12-15T01:00:00.000Z",
    ]) {
      expect(getSample(value.analysis, "south-a", "SUN", utc)).toBeUndefined();
    }
    expect(
      getSample(value.analysis, "my-site", "SUN", HOURLY_TIMES[0]),
    ).toBeUndefined();
  });

  it("treats exact zero as contact rather than above-horizon visibility", () => {
    const value = fixture();
    value.analysis.series[0].samples[0].elevation_deg = 0;
    value.visibility[0].ideal_visible[0] = false;
    expect(parseHourlyResult(value).visibility[0].ideal_visible[0]).toBe(false);
    value.visibility[0].ideal_visible[0] = true;
    expect(() => parseHourlyResult(value)).toThrow();
  });

  it.each([
    [
      "unsupported contract",
      (v: Fixture) => {
        v.schema_version = "2.0.0";
      },
    ],
    [
      "wrong timestamp count",
      (v: Fixture) => {
        v.window.timestamp_count = 720;
      },
    ],
    [
      "timestamps confused with intervals",
      (v: Fixture) => {
        v.window.interval_count = 721;
      },
    ],
    [
      "wrong cadence",
      (v: Fixture) => {
        v.window.step_seconds = 86400;
      },
    ],
    [
      "exclusive product endpoint",
      (v: Fixture) => {
        v.window.end_inclusive = false;
      },
    ],
    [
      "wrong product date",
      (v: Fixture) => {
        v.window.end_utc = "2026-12-14T00:00:00Z";
      },
    ],
    [
      "wrong engine-exclusive end",
      (v: Fixture) => {
        v.analysis.request.end_utc = "2026-12-15T00:00:00Z";
      },
    ],
    [
      "wrong source cadence",
      (v: Fixture) => {
        v.analysis.request.step_seconds = 7200;
      },
    ],
    [
      "wrong frame",
      (v: Fixture) => {
        v.analysis.request.frame = "MOON_ME";
      },
    ],
    [
      "changed latitude",
      (v: Fixture) => {
        v.analysis.request.sites[0].latitude_deg = -89;
      },
    ],
    [
      "changed longitude",
      (v: Fixture) => {
        v.analysis.request.sites[1].longitude_east_deg = 270;
      },
    ],
    [
      "duplicate coordinates ID",
      (v: Fixture) => {
        v.analysis.request.sites[1].id = "south-a";
      },
    ],
    [
      "uncomputed observer height",
      (v: Fixture) => {
        v.analysis.request.sites[0].height_m = 2;
      },
    ],
    [
      "duplicate analysis pair",
      (v: Fixture) => {
        v.analysis.series[1] = structuredClone(v.analysis.series[0]);
      },
    ],
    [
      "unknown analysis site",
      (v: Fixture) => {
        v.analysis.series[0].site_id = "my-site";
      },
    ],
    [
      "missing pair",
      (v: Fixture) => {
        v.analysis.series.pop();
      },
    ],
    [
      "duplicate visibility pair",
      (v: Fixture) => {
        v.visibility[1] = structuredClone(v.visibility[0]);
      },
    ],
    [
      "missing visibility pair",
      (v: Fixture) => {
        v.visibility.pop();
      },
    ],
    [
      "incorrect derived flag",
      (v: Fixture) => {
        v.visibility[0].ideal_visible[0] = !v.visibility[0].ideal_visible[0];
      },
    ],
    [
      "short derived flag array",
      (v: Fixture) => {
        v.visibility[0].ideal_visible.pop();
      },
    ],
    [
      "short angular series",
      (v: Fixture) => {
        v.analysis.series[0].samples.pop();
      },
    ],
    [
      "duplicate timestamp",
      (v: Fixture) => {
        v.analysis.series[0].samples[1].utc =
          v.analysis.series[0].samples[0].utc;
      },
    ],
    [
      "different target grid",
      (v: Fixture) => {
        v.analysis.series[1].samples[0].utc = "2026-11-15T00:30:00.000Z";
      },
    ],
    [
      "invalid calendar date",
      (v: Fixture) => {
        v.analysis.series[0].samples[0].utc = "2026-11-31T00:00:00.000Z";
      },
    ],
    [
      "nonfinite elevation",
      (v: Fixture) => {
        v.analysis.series[0].samples[0].elevation_deg = Number.NaN;
      },
    ],
    [
      "infinite azimuth",
      (v: Fixture) => {
        v.analysis.series[0].samples[0].azimuth_deg = Number.POSITIVE_INFINITY;
      },
    ],
    [
      "out-of-range elevation",
      (v: Fixture) => {
        v.analysis.series[0].samples[0].elevation_deg = 91;
      },
    ],
    [
      "out-of-range azimuth",
      (v: Fixture) => {
        v.analysis.series[0].samples[0].azimuth_deg = -1;
      },
    ],
    [
      "false available terrain status",
      (v: Fixture) => {
        v.topography.status = "verified";
      },
    ],
    [
      "invented topographic visibility array",
      (v: Fixture) => {
        (
          v.visibility[0] as unknown as { topographic_visible: unknown }
        ).topographic_visible = Array(721).fill(true);
      },
    ],
  ])("rejects %s explicitly", (_description, mutate) => {
    const value = fixture();
    mutate(value);
    expect(() => parseHourlyResult(value)).toThrow();
  });

  it("rejects absent, legacy and daily MVP A payloads rather than substituting data", () => {
    for (const invalid of [
      undefined,
      null,
      {},
      { schema_version: "1.0.0", status: "not_implemented" },
      published.analysis,
    ]) {
      expect(() => parseHourlyResult(invalid)).toThrow();
    }
  });

  it("brackets sampled changes only and does not convert sample counts into continuous durations", () => {
    const flags = [false, false, true, true, false];
    expect(sampledTransitions(flags, HOURLY_TIMES.slice(0, 5))).toEqual([
      { from: HOURLY_TIMES[1], to: HOURLY_TIMES[2], becomesVisible: true },
      { from: HOURLY_TIMES[3], to: HOURLY_TIMES[4], becomesVisible: false },
    ]);
    expect(sampledTransitions(Array(721).fill(true), HOURLY_TIMES)).toEqual([]);
    expect(sampledTransitions(Array(721).fill(false), HOURLY_TIMES)).toEqual(
      [],
    );
  });
});

it("refuses malformed transition grids instead of returning undefined event bounds", () => {
  expect(() => sampledTransitions([false, true], [HOURLY_TIMES[0]])).toThrow();
  expect(() =>
    sampledTransitions([false, true], [HOURLY_TIMES[1], HOURLY_TIMES[0]]),
  ).toThrow();
  expect(() =>
    sampledTransitions([false, true], ["bad", HOURLY_TIMES[0]]),
  ).toThrow();
});
