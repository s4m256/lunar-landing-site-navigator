import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { lunarUnitVector } from "./MissionGlobe";
import { POLAR_STEREO_SPAN, shadePolarDem, southPolarUv } from "./polar-relief";

describe("lunar globe registration", () => {
  it("maps east-positive cardinal longitudes and the south pole into the original lunar frame", () => {
    const expected = [
      [0, -1, 0],
      [90, 0, 1],
      [180, 1, 0],
      [270, 0, -1],
    ];
    for (const [lon, x, z] of expected) {
      const point = lunarUnitVector(0, lon);
      expect(point.x).toBeCloseTo(x);
      expect(point.y).toBeCloseTo(0);
      expect(point.z).toBeCloseTo(z);
    }
    expect(lunarUnitVector(-90, 0).y).toBeCloseTo(-1);
  });

  it("aligns the original atlas longitude with Three sphere UVs", () => {
    const sphere = new THREE.SphereGeometry(1, 8, 4);
    const pos = sphere.getAttribute("position");
    const uv = sphere.getAttribute("uv");
    // Equatorial vertices at 0°, 90°, 180°, and 270° east.
    for (let i = 0; i < 4; i++) {
      const index = 2 * 9 + i * 2;
      const lon = i * 90;
      const expected = lunarUnitVector(0, lon);
      expect(pos.getX(index)).toBeCloseTo(expected.x);
      expect(pos.getZ(index)).toBeCloseTo(expected.z);
      const shiftedU = (uv.getX(index) + 0.5) % 1;
      const signedLon = lon >= 180 ? lon - 360 : lon;
      expect(shiftedU).toBeCloseTo((signedLon + 180) / 360);
      expect(uv.getY(index)).toBeCloseTo(0.5);
    }
    // Native Three UV v=1 is north and v=0 is south, matching the atlas.
    expect(uv.getY(0)).toBeCloseTo(1);
    expect(uv.getY(4 * 9)).toBeCloseTo(0);
    sphere.dispose();
  });

  it("projects the four sites around the south pole in the rotated frame", () => {
    const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
    camera.up.set(0, 0, -1);
    camera.position.set(0, 1.55, 0.001);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const rotation = new THREE.Matrix4().makeRotationX(Math.PI);
    const points = [0, 90, 180, 270].map((lon) =>
      lunarUnitVector(-85, lon).applyMatrix4(rotation).project(camera),
    );
    expect(points[0].x).toBeLessThan(0);
    expect(points[1].y).toBeGreaterThan(0);
    expect(points[2].x).toBeGreaterThan(0);
    expect(points[3].y).toBeLessThan(0);
  });
});

describe("LOLA polar cap", () => {
  it("places the pole at the center and 85°S sites on the corresponding meridians", () => {
    const pole = southPolarUv(lunarUnitVector(-90, 0));
    expect(pole.u).toBeCloseTo(0.5);
    expect(pole.v).toBeCloseTo(0.5);
    const r = Math.tan((2.5 * Math.PI) / 180) / POLAR_STEREO_SPAN;
    const expected = [
      [0.5, 0.5 - r],
      [0.5 + r, 0.5],
      [0.5, 0.5 + r],
      [0.5 - r, 0.5],
    ];
    [0, 90, 180, 270].forEach((longitude, index) => {
      const uv = southPolarUv(lunarUnitVector(-85, longitude));
      expect(uv.u).toBeCloseTo(expected[index][0]);
      expect(uv.v).toBeCloseTo(expected[index][1]);
    });
  });
  it("derives shading from the packed DEM instead of adding artificial terrain", () => {
    const data = new Uint8ClampedArray(3 * 3 * 4);
    for (let i = 0; i < 9; i++) {
      data[i * 4] = 128;
      data[i * 4 + 3] = 255;
    }
    const flat = shadePolarDem(data, 3, 3);
    expect(flat[0]).toBe(flat[16]);
    data[5 * 4] = 200;
    const sloped = shadePolarDem(data, 3, 3);
    expect(sloped[16]).not.toBe(flat[16]);
  });
});
