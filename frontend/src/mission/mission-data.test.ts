import { describe, expect, it, vi } from "vitest";
import batchAB from "../../../docs/audits/mission/result-ab-2026.json";
import batchCD from "../../../docs/audits/mission/result-cd-2026.json";
import selected from "../../../docs/audits/mission/selected-samples.json";
import {
  classifyMissionElevation,
  DEFAULT_MISSION_DATE,
  getMissionAnalysis,
  MISSION_AUDIT,
  MISSION_DATES,
  MISSION_SITES,
  parseMissionResults,
} from "./mission-data";

const fixture = () => structuredClone([batchAB, batchCD]);

describe("guided mission scientific data", () => {
  it("retains both real batches and their full provenance without rewriting the scientific contract", () => {
    const results = parseMissionResults([batchAB, batchCD]);
    expect(results).toEqual([batchAB, batchCD]);
    expect(MISSION_AUDIT?.results).toEqual(results);
    expect(MISSION_AUDIT?.manifest.dates).toEqual(
      MISSION_DATES.map((date) => date.value),
    );
    for (const result of results) {
      expect(result.request.sites).toHaveLength(2);
      expect(result.provenance.frame).toBe("IAU_MOON");
      expect(result.provenance.correction).toBe("CN+S");
      expect(result.provenance.horizons_validation).toBe(
        "not_performed_in_engine",
      );
      expect(result.series.every((row) => row.samples.length === 365)).toBe(
        true,
      );
    }
  });

  it("uses each exact local/target/date sample from the real source batches", () => {
    for (const date of selected) {
      for (const row of date.sites) {
        const analysis = getMissionAnalysis(row.site_id, date.date);
        expect(analysis).toBeDefined();
        expect(analysis?.utc).toBe(`${date.date}T00:00:00.000Z`);
        expect(analysis?.site).toEqual(
          MISSION_SITES.find((site) => site.id === row.site_id),
        );
        for (const target of ["sun", "earth"] as const) {
          const original = [batchAB, batchCD]
            .flatMap((batch) => batch.series)
            .find(
              (series) =>
                series.site_id === row.site_id &&
                series.target === target.toUpperCase(),
            )
            ?.samples.find((sample) => sample.utc === analysis?.utc);
          expect(original).toEqual(row[target]);
          expect(analysis?.[target].azimuthDeg).toBe(original?.azimuth_deg);
          expect(analysis?.[target].elevationDeg).toBe(original?.elevation_deg);
          expect(analysis?.[target].state).toBe(
            row[target].elevation_deg > 0 ? "above" : "below",
          );
        }
        expect(analysis?.meetsGoal).toBe(row.meets_goal);
        expect(analysis?.meetsGoal).toBe(
          row.sun.elevation_deg > 0 && row.earth.elevation_deg > 0,
        );
      }
    }
  });

  it("offers real contrasting choices, including more than one solution and each site succeeding on a date", () => {
    expect(DEFAULT_MISSION_DATE).toBe("2026-03-24");
    const successfulSites = MISSION_DATES.map((date) =>
      MISSION_SITES.filter(
        (site) => getMissionAnalysis(site.id, date.value)?.meetsGoal,
      ).map((site) => site.id),
    );
    expect(successfulSites).toEqual([
      ["mission-b", "mission-c"],
      ["mission-a"],
      ["mission-d"],
    ]);
    const states = new Set(
      MISSION_DATES.flatMap((date) =>
        MISSION_SITES.map((site) => {
          const analysis = getMissionAnalysis(site.id, date.value)!;
          return `${analysis.sun.state}/${analysis.earth.state}`;
        }),
      ),
    );
    expect(states).toEqual(
      new Set(["above/above", "above/below", "below/above", "below/below"]),
    );
  });

  it("has four distinct hypothetical coordinates without borrowing the older observers", () => {
    expect(
      MISSION_SITES.map((site) => [site.latitudeDeg, site.longitudeDeg]),
    ).toEqual([
      [-85, 0],
      [-85, 90],
      [-85, 180],
      [-85, 270],
    ]);
    expect(MISSION_SITES.map((site) => site.label)).toEqual([
      "Local A",
      "Local B",
      "Local C",
      "Local D",
    ]);
    expect(getMissionAnalysis("south-a", DEFAULT_MISSION_DATE)).toBeUndefined();
  });

  it("returns missing for unknown dates, even dates covered by the source daily batches", () => {
    for (const date of [
      "2026-03-25",
      "2026-03-24T00:00:00.000Z",
      "2026-02-29",
      "2027-01-01",
      "",
    ])
      expect(getMissionAnalysis("mission-a", date)).toBeUndefined();
    expect(getMissionAnalysis("unknown", DEFAULT_MISSION_DATE)).toBeUndefined();
  });

  it("keeps zero on the horizon and never rounds a signed near-zero elevation into another state", () => {
    expect(classifyMissionElevation(0)).toBe("on-horizon");
    expect(classifyMissionElevation(-0)).toBe("on-horizon");
    expect(classifyMissionElevation(1e-12)).toBe("above");
    expect(classifyMissionElevation(-1e-12)).toBe("below");
    for (const invalid of [NaN, Infinity, -Infinity, 90.1, -90.1])
      expect(() => classifyMissionElevation(invalid)).toThrow("inválidos");
  });

  it("accepts reordered batches and series, using their identities", () => {
    const shuffled = fixture().reverse();
    shuffled.forEach((batch) => {
      batch.series.reverse();
      batch.request.sites.reverse();
    });
    expect(parseMissionResults(shuffled)).toEqual(shuffled);
  });

  it.each([
    [
      "wrong schema",
      (data: ReturnType<typeof fixture>) => {
        data[0].schema_version = "2.0.0";
      },
    ],
    [
      "wrong coordinate",
      (data: ReturnType<typeof fixture>) => {
        data[0].request.sites[0].latitude_deg = -89.5;
      },
    ],
    [
      "wrong longitude",
      (data: ReturnType<typeof fixture>) => {
        data[0].request.sites[0].longitude_east_deg = 1;
      },
    ],
    [
      "invented height",
      (data: ReturnType<typeof fixture>) => {
        data[0].request.sites[0].height_m = 10;
      },
    ],
    [
      "duplicate observer across batches",
      (data: ReturnType<typeof fixture>) => {
        data[1].request.sites[0] = data[0].request.sites[0];
      },
    ],
    [
      "duplicate target",
      (data: ReturnType<typeof fixture>) => {
        data[0].series[1] = data[0].series[0];
      },
    ],
    [
      "unknown observer",
      (data: ReturnType<typeof fixture>) => {
        data[0].series[0].site_id = "south-a";
      },
    ],
    [
      "missing target",
      (data: ReturnType<typeof fixture>) => {
        data[0].series.pop();
      },
    ],
    [
      "empty samples",
      (data: ReturnType<typeof fixture>) => {
        data[0].series[0].samples = [];
      },
    ],
    [
      "missing sample",
      (data: ReturnType<typeof fixture>) => {
        data[0].series[0].samples.pop();
      },
    ],
    [
      "duplicate time",
      (data: ReturnType<typeof fixture>) => {
        data[0].series[0].samples[1].utc = data[0].series[0].samples[0].utc;
      },
    ],
    [
      "invalid calendar",
      (data: ReturnType<typeof fixture>) => {
        data[0].series[0].samples[58].utc = "2026-02-29T00:00:00.000Z";
      },
    ],
    [
      "different cadence",
      (data: ReturnType<typeof fixture>) => {
        data[0].request.step_seconds = 3600;
      },
    ],
    [
      "different end",
      (data: ReturnType<typeof fixture>) => {
        data[0].request.end_utc = "2026-12-31T00:00:00Z";
      },
    ],
    [
      "NaN",
      (data: ReturnType<typeof fixture>) => {
        data[0].series[0].samples[0].elevation_deg = NaN;
      },
    ],
    [
      "infinite",
      (data: ReturnType<typeof fixture>) => {
        data[0].series[0].samples[0].azimuth_deg = Infinity;
      },
    ],
    [
      "elevation out of range",
      (data: ReturnType<typeof fixture>) => {
        data[0].series[0].samples[0].elevation_deg = 91;
      },
    ],
    [
      "azimuth 360",
      (data: ReturnType<typeof fixture>) => {
        data[0].series[0].samples[0].azimuth_deg = 360;
      },
    ],
    [
      "wrong correction",
      (data: ReturnType<typeof fixture>) => {
        data[0].provenance.correction = "NONE";
      },
    ],
    [
      "changed kernel hash",
      (data: ReturnType<typeof fixture>) => {
        data[0].provenance.kernels[0].sha256 = "0".repeat(64);
      },
    ],
    [
      "changed kernel source",
      (data: ReturnType<typeof fixture>) => {
        data[0].provenance.kernels[0].url = "https://example.com/fake";
      },
    ],
    [
      "duplicate kernel",
      (data: ReturnType<typeof fixture>) => {
        data[0].provenance.kernels[1] = data[0].provenance.kernels[0];
      },
    ],
  ])(
    "rejects %s explicitly instead of declaring a successful analysis",
    (_description, mutate) => {
      const invalid = fixture();
      mutate(invalid);
      expect(() => parseMissionResults(invalid)).toThrow(
        "Dados científicos da missão inválidos",
      );
    },
  );

  it("rejects absent or incomplete artifacts", () => {
    for (const value of [
      null,
      undefined,
      {},
      [],
      [batchAB],
      [batchAB, batchAB],
    ])
      expect(() => parseMissionResults(value)).toThrow(
        "Dados científicos da missão inválidos",
      );
  });

  it("keeps module import available for an error screen when an embedded artifact is invalid", async () => {
    vi.resetModules();
    vi.doMock("../../../docs/audits/mission/result-ab-2026.json", () => ({
      default: {},
    }));
    try {
      const invalidModule = await import("./mission-data");
      expect(invalidModule.MISSION_AUDIT).toBeUndefined();
      expect(invalidModule.MISSION_SITES).toHaveLength(4);
      expect(() =>
        invalidModule.getMissionAnalysis("mission-a", DEFAULT_MISSION_DATE),
      ).toThrow("Dados científicos da missão inválidos");
    } finally {
      vi.doUnmock("../../../docs/audits/mission/result-ab-2026.json");
      vi.resetModules();
    }
  });
});
