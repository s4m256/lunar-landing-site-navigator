import { describe, expect, it } from "vitest";
import rawDaily from "../../docs/audits/pr4/result-2026.json?raw";
import rawHourly from "../../docs/data/mvp-b-hourly.json?raw";
import {
  angle,
  demoSelection,
  loadGuideDataset,
  missionTimestamps,
  periodCoverage,
  selectedSample,
  utcLabel,
} from "./guide-model";

const daily = loadGuideDataset("daily");
const hourly = loadGuideDataset("hourly");

describe("Landing Guide scientific selectors", () => {
  it("loads the original daily and hourly contracts without transforming the science", () => {
    expect(daily.error).toBeUndefined();
    expect(daily.timestamps).toHaveLength(365);
    expect(daily.cadenceSeconds).toBe(86400);
    expect(daily.result).toEqual(JSON.parse(rawDaily));
    expect(hourly.error).toBeUndefined();
    expect(hourly.timestamps).toHaveLength(721);
    expect(hourly.cadenceSeconds).toBe(3600);
    expect(hourly.result).toEqual(JSON.parse(rawHourly).analysis);
    expect(
      (Date.parse(hourly.timestamps[720]) - Date.parse(hourly.timestamps[0])) /
        3600000,
    ).toBe(720);
  });

  it("uses source identity rather than a visual A/B slot, including swapped selections", () => {
    const slotA = demoSelection("south-b");
    const slotB = demoSelection("south-a");
    const utc = "2026-09-01T00:00:00.000Z";
    expect(selectedSample(daily, slotA, "SUN", utc)?.elevation_deg).toBe(
      -0.5438251172899302,
    );
    expect(selectedSample(daily, slotB, "SUN", utc)?.elevation_deg).toBe(
      0.5485541689011072,
    );
    expect(selectedSample(daily, slotA, "EARTH", utc)?.elevation_deg).toBe(
      5.264842869079462,
    );
  });

  it("never grants coverage to free coordinates, near points or stale source IDs", () => {
    const utc = "2026-09-01T00:00:00.000Z";
    expect(selectedSample(daily, null, "SUN", utc)).toBeUndefined();
    expect(
      selectedSample(daily, { latitude: -89.5, longitudeEast: 0 }, "SUN", utc),
    ).toBeUndefined();
    expect(
      selectedSample(
        daily,
        { ...demoSelection("south-a"), latitude: -89.500001 },
        "SUN",
        utc,
      ),
    ).toBeUndefined();
    expect(
      selectedSample(
        daily,
        { ...demoSelection("south-b"), longitudeEast: -270 },
        "SUN",
        utc,
      ),
    ).toBeUndefined();
    expect(
      selectedSample(
        daily,
        { ...demoSelection("south-a"), latitude: NaN },
        "SUN",
        utc,
      ),
    ).toBeUndefined();
  });

  it("rejects missing times instead of finding a nearby or interpolated sample", () => {
    for (const utc of [
      "2026-09-01T12:00:00.000Z",
      "2027-01-01T00:00:00.000Z",
      "2026-09-01T00:00:00Z",
    ]) {
      expect(
        selectedSample(daily, demoSelection("south-a"), "SUN", utc),
      ).toBeUndefined();
    }
    expect(
      selectedSample(
        hourly,
        demoSelection("south-a"),
        "SUN",
        "2026-12-15T00:00:00.000Z",
      ),
    ).toBeDefined();
    expect(
      selectedSample(
        hourly,
        demoSelection("south-a"),
        "SUN",
        "2026-12-15T01:00:00.000Z",
      ),
    ).toBeUndefined();
  });

  it.each(["{}", "{", '{"schema_version":"2.0.0"}'])(
    "fails closed for incompatible daily JSON: %s",
    (source) => {
      const invalid = loadGuideDataset("daily", source);
      expect(invalid.error).toBeTruthy();
      expect(invalid.result).toBeUndefined();
      expect(invalid.timestamps).toEqual([]);
      expect(
        selectedSample(
          invalid,
          demoSelection("south-a"),
          "SUN",
          daily.timestamps[0],
        ),
      ).toBeUndefined();
    },
  );

  it("keeps the hourly unavailable-terrain invariant enforced", () => {
    const source = JSON.parse(rawHourly);
    source.visibility[0].topographic_visible =
      source.visibility[0].ideal_visible;
    const invalid = loadGuideDataset("hourly", JSON.stringify(source));
    expect(invalid.error).toBeTruthy();
    expect(invalid.result).toBeUndefined();
    expect(invalid.timestamps).toHaveLength(0);
  });
});

describe("Landing Guide mission sample filter", () => {
  it("preserves inclusive hourly endpoints and distinguishes samples from elapsed hours", () => {
    const timestamps = missionTimestamps(hourly, "2026-11-15", 30);
    expect(timestamps).toHaveLength(721);
    expect(timestamps[0]).toBe("2026-11-15T00:00:00.000Z");
    expect(timestamps.at(-1)).toBe("2026-12-15T00:00:00.000Z");
    expect(periodCoverage(hourly, "2026-11-15", 30)).toBe("complete");
    expect(missionTimestamps(hourly, "2026-11-15", 1)).toHaveLength(25);
  });

  it("filters existing daily samples without fabricating the requested endpoint", () => {
    expect(missionTimestamps(daily, "2026-09-01", 30)).toHaveLength(31);
    const timestamps = missionTimestamps(daily, "2026-12-30", 3);
    expect(timestamps).toEqual([
      "2026-12-30T00:00:00.000Z",
      "2026-12-31T00:00:00.000Z",
    ]);
    expect(periodCoverage(daily, "2026-12-30", 3)).toBe("partial");
    expect(periodCoverage(hourly, "2026-11-14", 2)).toBe("partial");
    expect(missionTimestamps(hourly, "2026-11-14", 2)).toHaveLength(25);
  });

  it.each([
    ["2026-02-30", 1],
    ["2026-1-01", 1],
    ["", 1],
    ["2026-09-01", 0],
    ["2026-09-01", -1],
    ["2026-09-01", NaN],
    ["2026-09-01", Infinity],
    ["2026-09-01", 367],
  ])("returns no samples for invalid period %s / %s", (start, duration) => {
    expect(missionTimestamps(daily, String(start), Number(duration))).toEqual(
      [],
    );
    expect(periodCoverage(daily, String(start), Number(duration))).toBe(
      "empty",
    );
  });

  it("identifies empty and failed-data periods explicitly", () => {
    expect(periodCoverage(hourly, "2027-01-01", 1)).toBe("empty");
    expect(
      missionTimestamps(loadGuideDataset("hourly", "{}"), "2026-11-15", 30),
    ).toEqual([]);
  });

  it("formats UTC explicitly and never prints a nonfinite angle as a valid number", () => {
    expect(utcLabel("2026-09-01T00:00:00.000Z")).toContain("00:00");
    expect(utcLabel("2026-09-01T00:00:00.000Z")).toContain("UTC");
    expect(utcLabel("2026-09-01T00:00:00")).toBe("Sem instante UTC válido");
    expect(angle(NaN)).toBe("Indisponível");
    expect(angle(0.5485541689011072)).toBe("+0,55°");
  });
});
