import { describe, expect, it } from "vitest";
import {
  directionFromAngles,
  hasUsableDirection,
  panoramaPosition,
  terrainPositions,
} from "./scene-geometry";

describe("local astronomical directions", () => {
  it.each([
    [0, 0, [0, 0, -1]],
    [90, 0, [1, 0, 0]],
    [180, 0, [0, 0, 1]],
    [270, 0, [-1, 0, 0]],
    [48, 90, [0, 1, 0]],
    [48, -90, [0, -1, 0]],
  ] as const)(
    "preserves cardinal/vertical direction %s°, %s°",
    (azimuth, elevation, expected) => {
      const actual = directionFromAngles(azimuth, elevation);
      actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 12));
    },
  );

  it("keeps the direction normalized and retains the elevation sign", () => {
    for (const azimuth of [0, 32.5283, 179.9, 302.4972, 359.999]) {
      for (const elevation of [-89.9, -1.4, 0, 1.7652, 89.9]) {
        const [east, up, south] = directionFromAngles(azimuth, elevation);
        expect(Math.hypot(east, up, south)).toBeCloseTo(1, 12);
        expect(
          (Math.atan2(up, Math.hypot(east, south)) * 180) / Math.PI,
        ).toBeCloseTo(elevation, 10);
      }
    }
  });

  it.each([
    [NaN, 0],
    [0, Infinity],
    [360, 0],
    [-1, 0],
    [0, 91],
    [0, -91],
  ])(
    "rejects invalid directions rather than moving targets to a substitute position",
    (azimuth, elevation) =>
      expect(() => directionFromAngles(azimuth, elevation)).toThrow(RangeError),
  );

  it("omits missing or non-finite samples", () => {
    expect(hasUsableDirection(undefined)).toBe(false);
    expect(
      hasUsableDirection({ utc: "", azimuth_deg: NaN, elevation_deg: 1 }),
    ).toBe(false);
    expect(
      hasUsableDirection({ utc: "", azimuth_deg: 0, elevation_deg: 0 }),
    ).toBe(true);
  });

  it("places targets below the panorama horizon when their elevation is negative", () => {
    const point = panoramaPosition({
      utc: "",
      azimuth_deg: 90,
      elevation_deg: -5,
    });
    expect(point.x).toBe(270);
    expect(point.y).toBe(249);
    expect(
      panoramaPosition({ utc: "", azimuth_deg: 90, elevation_deg: 5 }).y,
    ).toBe(231);
  });
});

describe("contextual terrain grid", () => {
  it("maps north/south and west/east consistently with the local view", () => {
    const positions = terrainPositions(
      3,
      120000,
      [1000, 0, 2000, 0, 0, 0, 3000, 0, 4000],
    );
    expect(Array.from(positions.slice(0, 3))).toEqual([
      -40,
      expect.closeTo(2 / 3),
      -40,
    ]);
    expect(Array.from(positions.slice(12, 15))).toEqual([0, 0, 0]);
    expect(Array.from(positions.slice(24, 27))).toEqual([
      40,
      expect.closeTo(8 / 3),
      40,
    ]);
  });

  it("applies exactly the same scale to elevation and horizontal distance", () => {
    const positions = terrainPositions(2, 120000, [0, 120000, 0, 0]);
    const eastDifference = positions[3] - positions[0];
    const upDifference = positions[4] - positions[1];
    expect(eastDifference).toBe(80);
    expect(upDifference).toBe(eastDifference);
  });

  it("rejects incomplete, non-finite or zero-extent terrain", () => {
    expect(() => terrainPositions(3, 120000, [0])).toThrow(RangeError);
    expect(() => terrainPositions(2, 120000, [0, 0, NaN, 0])).toThrow(
      RangeError,
    );
    expect(() => terrainPositions(2, 0, [0, 0, 0, 0])).toThrow(RangeError);
  });
});
