import { describe, expect, it } from "vitest";
import {
  applyRotation,
  geoToStereo,
  geoToWorld,
  LUNAR_RADIUS_M,
  stereoToGeo,
  sunToWorld,
  worldToGeo,
} from "./surface-math";

const wrapDifference = (a: number, b: number) =>
  ((((a - b + 180) % 360) + 360) % 360) - 180;
const closeVector = (
  actual: readonly number[],
  expected: readonly number[],
  digits = 9,
) => {
  actual.forEach((value, index) =>
    expect(value).toBeCloseTo(expected[index], digits),
  );
};

describe("south-polar display coordinates retain the spherical reference", () => {
  it("puts the reference south pole at the origin and radial height on the upward Y axis", () => {
    closeVector(geoToWorld(-90, 0), [0, 0, 0]);
    closeVector(geoToWorld(-90, 200, 1200), [0, 1.2, 0]);
    closeVector(geoToWorld(-90, 0, -500), [0, -0.5, 0]);
    expect(worldToGeo([0, 1.2, 0])).toEqual({
      latitude: -90,
      longitudeEast: 0,
      height_m: 1200,
    });
  });

  it("uses east-positive longitude and the declared ME-to-world axis permutation", () => {
    const radialKm = LUNAR_RADIUS_M / 1000;
    closeVector(geoToWorld(0, 0), [0, -radialKm, -radialKm]);
    closeVector(geoToWorld(0, 90), [radialKm, -radialKm, 0]);
    closeVector(geoToWorld(0, 180), [0, -radialKm, radialKm]);
    closeVector(geoToWorld(90, 0), [0, -2 * radialKm, 0]);
  });

  it("includes curvature instead of treating a fixed height as a flat plane", () => {
    const point = geoToWorld(-89, 0);
    const angle = Math.PI / 180;
    expect(point[1] * 1000).toBeCloseTo(
      LUNAR_RADIUS_M * (Math.cos(angle) - 1),
      6,
    );
    expect(point[2] * 1000).toBeCloseTo(-LUNAR_RADIUS_M * Math.sin(angle), 6);
    expect(point[1]).toBeLessThan(0);
  });

  it("round-trips both science locations, negative heights, longitude seams and poles", () => {
    for (const [latitude, longitude, height] of [
      [-89.5, 0, 0],
      [-89, 90, 0],
      [-85, 359.999999, -3400],
      [-80, -1, 5123],
      [45, 270, -2000],
      [-90, 0, 12],
      [90, 0, 50],
    ]) {
      const restored = worldToGeo(geoToWorld(latitude, longitude, height));
      expect(restored.latitude).toBeCloseTo(latitude, 8);
      expect(wrapDifference(restored.longitudeEast, longitude)).toBeCloseTo(
        0,
        8,
      );
      expect(restored.height_m).toBeCloseTo(height, 6);
    }
  });

  it("rejects nonfinite coordinates, invalid latitudes and nonexistent radial positions", () => {
    expect(() => geoToWorld(-91, 0)).toThrow(/Latitude/);
    expect(() => geoToWorld(91, 0)).toThrow(/Latitude/);
    expect(() => geoToWorld(NaN, 0)).toThrow(/finite/);
    expect(() => geoToWorld(-89, Infinity)).toThrow(/finite/);
    expect(() => geoToWorld(-89, 0, NaN)).toThrow(/radius/);
    expect(() => geoToWorld(-89, 0, -LUNAR_RADIUS_M)).toThrow(/radius/);
    expect(() => worldToGeo([0, -LUNAR_RADIUS_M / 1000, 0])).toThrow(/radius/);
    expect(() => worldToGeo([0, Infinity, 0])).toThrow(/finite/);
    expect(() => worldToGeo([0, 0])).toThrow(/3 finite/);
  });
});

describe("south-polar stereographic coordinates use the product-axis convention", () => {
  it("maps the south pole and four meridians with known stereographic distances", () => {
    closeVector(geoToStereo(-90, 315), [0, 0]);
    const distance = 2 * LUNAR_RADIUS_M * Math.tan(Math.PI / 360);
    closeVector(geoToStereo(-89, 0), [0, distance], 7);
    closeVector(geoToStereo(-89, 90), [distance, 0], 7);
    closeVector(geoToStereo(-89, 180), [0, -distance], 7);
    closeVector(geoToStereo(-89, 270), [-distance, 0], 7);
    expect(stereoToGeo(0, 0)).toEqual({ latitude: -90, longitudeEast: 0 });
  });

  it("round-trips longitude wrap and accepts an explicitly supplied reference radius", () => {
    for (const latitude of [-89.5, -89, -80, -45, 0, 45]) {
      for (const longitude of [-180, -1, 0, 90, 359.9999, 720]) {
        const projected = geoToStereo(latitude, longitude, 1_000_000);
        const restored = stereoToGeo(...projected, 1_000_000);
        expect(restored.latitude).toBeCloseTo(latitude, 8);
        expect(wrapDifference(restored.longitudeEast, longitude)).toBeCloseTo(
          0,
          8,
        );
      }
    }
  });

  it("rejects the singular north pole, nonfinite points and invalid reference radii", () => {
    expect(() => geoToStereo(90, 0)).toThrow(/singular/);
    expect(() => geoToStereo(-91, 0)).toThrow(/Latitude/);
    expect(() => geoToStereo(-89, NaN)).toThrow(/finite/);
    expect(() => geoToStereo(-89, 0, 0)).toThrow(/radius/);
    expect(() => stereoToGeo(Infinity, 0)).toThrow(/finite/);
    expect(() => stereoToGeo(0, 0, -1)).toThrow(/radius/);
  });
});

describe("frame rotation and solar direction preserve handedness", () => {
  const rotateX90 = [1, 0, 0, 0, 0, -1, 0, 1, 0];

  it("applies row-major rotations and preserves lengths under the frame conversion", () => {
    closeVector(applyRotation(rotateX90, [0, 1, 0]), [0, 0, 1]);
    const input = [2, -3, 4];
    const output = applyRotation(rotateX90, input);
    expect(Math.hypot(...output)).toBeCloseTo(Math.hypot(...input), 12);
    closeVector(applyRotation([1, 0, 0, 0, 1, 0, 0, 0, 1], input), input);
  });

  it("maps all three direction axes without the position-origin translation", () => {
    closeVector(sunToWorld([0, 20, 0]), [1, 0, 0]);
    closeVector(sunToWorld([0, 0, -20]), [0, 1, 0]);
    closeVector(sunToWorld([-20, 0, 0]), [0, 0, 1]);
    const direction = sunToWorld([2, -3, 4]);
    expect(Math.hypot(...direction)).toBeCloseTo(1, 12);
  });

  it("does not swap light direction with photon travel direction", () => {
    // A Sun direction toward ME +Y is world +East; photons travel oppositely.
    // Three.DirectionalLight must be positioned toward +East relative to its target.
    const towardSun = sunToWorld([0, 1, 0]);
    expect(towardSun[0]).toBe(1);
    expect(towardSun[1]).toBe(-0);
  });

  it("rejects scales, reflections, malformed rotations and zero solar vectors", () => {
    expect(() => applyRotation([2, 0, 0, 0, 1, 0, 0, 0, 1], [1, 0, 0])).toThrow(
      /orthonormal/,
    );
    expect(() =>
      applyRotation([-1, 0, 0, 0, 1, 0, 0, 0, 1], [1, 0, 0]),
    ).toThrow(/handedness/);
    expect(() => applyRotation([1, 0], [1, 0, 0])).toThrow(/9 finite/);
    expect(() => applyRotation(rotateX90, [NaN, 0, 0])).toThrow(/finite/);
    expect(() => sunToWorld([0, 0, 0])).toThrow(/nonzero/);
    expect(() => sunToWorld([1, Infinity, 0])).toThrow(/finite/);
  });
});
