import { afterEach, describe, expect, it, vi } from "vitest";
import terrainRaw from "./south-pole-dem.visual.json?raw";
import solarRaw from "./solar-frames.visual.json?raw";
import terrainProvenance from "./south-pole-dem.visual.provenance.json";
import {
  loadTerrainAssets,
  parseSolarFrames,
  parseTerrainData,
  solarFrameAt,
  surfaceHeight,
  type TerrainData,
} from "./terrain-data";

// The app's tsconfig intentionally exposes browser types only. This test runs in
// Node/Vitest; load its built-in hashing tool without adding Node types to the app.
const nodeCryptoModule = "node:crypto";
const { createHash } = await import(/* @vite-ignore */ nodeCryptoModule);

const terrainFixture = () => JSON.parse(terrainRaw);
const solarFixture = () => JSON.parse(solarRaw);

afterEach(() => vi.unstubAllGlobals());

describe("LOLA visual asset consumer", () => {
  it("loads the real complete crop with its registered identity and metadata", () => {
    const terrain = parseTerrainData(terrainFixture());
    expect(createHash("sha256").update(terrainRaw).digest("hex")).toBe(
      terrainProvenance.artifact_sha256,
    );
    expect(terrain.width).toBe(513);
    expect(terrain.height).toBe(513);
    expect(terrain.heights_m).toHaveLength(263169);
    expect(terrain.frame).toBe("MOON_ME_DE421");
    expect(terrain.reference_radius_m).toBe(1_737_400);
    expect(terrain.step_m).toBe(400);
    expect(terrain.origin_x_m).toBe(-102360);
    expect(terrain.origin_y_m).toBe(102360);
    expect(terrain.min_height_m).toBe(-4982.5);
    expect(terrain.max_height_m).toBe(5402);
    expect(terrain.provenance.source_img_sha256).toBe(
      "e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc",
    );
  });

  it.each([
    [
      "frame",
      (d: ReturnType<typeof terrainFixture>) => {
        d.frame = "IAU_MOON";
      },
    ],
    [
      "projection",
      (d: ReturnType<typeof terrainFixture>) => {
        d.projection_origin_latitude_deg = 90;
      },
    ],
    [
      "radius",
      (d: ReturnType<typeof terrainFixture>) => {
        d.reference_radius_m = 1737.4;
      },
    ],
    [
      "units",
      (d: ReturnType<typeof terrainFixture>) => {
        d.height_unit = "kilometres";
      },
    ],
    [
      "count",
      (d: ReturnType<typeof terrainFixture>) => {
        d.heights_m.pop();
      },
    ],
    [
      "nonfinite",
      (d: ReturnType<typeof terrainFixture>) => {
        d.heights_m[0] = NaN;
      },
    ],
    [
      "declared min",
      (d: ReturnType<typeof terrainFixture>) => {
        d.min_height_m = 0;
      },
    ],
    [
      "step",
      (d: ReturnType<typeof terrainFixture>) => {
        d.step_m = 0;
      },
    ],
    [
      "source",
      (d: ReturnType<typeof terrainFixture>) => {
        d.provenance.source_img_sha256 = "verified";
      },
    ],
    [
      "limitations",
      (d: ReturnType<typeof terrainFixture>) => {
        d.limitations = [];
      },
    ],
    [
      "nodata sentinel",
      (d: ReturnType<typeof terrainFixture>) => {
        d.nodata.declared_value = d.heights_m[0];
      },
    ],
  ])(
    "rejects incompatible %s instead of rendering replacement terrain",
    (_, mutate) => {
      const data = terrainFixture();
      mutate(data);
      expect(() => parseTerrainData(data)).toThrow(/Relevo incompatível/);
    },
  );

  it("supports explicit nodata without substituting a radial zero", () => {
    const data = terrainFixture();
    data.heights_m[0] = null;
    const terrain = parseTerrainData(data);
    expect(
      surfaceHeight(terrain, terrain.origin_x_m, terrain.origin_y_m),
    ).toBeUndefined();
  });

  // An analytic 2x2 fixture checks display interpolation, not lunar terrain accuracy.
  const plane = (): TerrainData => ({
    ...parseTerrainData(terrainFixture()),
    width: 2,
    height: 2,
    origin_x_m: -40,
    origin_y_m: 40,
    step_m: 400,
    heights_m: [0, 100, 200, 300],
    min_height_m: 0,
    max_height_m: 300,
  });

  it("uses source pixel centres and bilinear weights with north-up rows", () => {
    const terrain = plane();
    expect(surfaceHeight(terrain, -40, 40)).toBe(0);
    expect(surfaceHeight(terrain, 360, -360)).toBe(300);
    expect(surfaceHeight(terrain, 160, -160)).toBe(150);
    expect(surfaceHeight(terrain, 60, -260)).toBe(175);
  });

  it("does not clamp outside the extent or bridge a nodata stencil", () => {
    const terrain = plane();
    expect(surfaceHeight(terrain, -40.01, 40)).toBeUndefined();
    expect(surfaceHeight(terrain, 360.01, -360)).toBeUndefined();
    expect(surfaceHeight(terrain, 160, 40.01)).toBeUndefined();
    expect(surfaceHeight(terrain, 160, -360.01)).toBeUndefined();
    expect(surfaceHeight(terrain, NaN, 40)).toBeUndefined();
    const gap = { ...terrain, heights_m: [0, 100, 200, null] };
    expect(surfaceHeight(gap, 160, -160)).toBeUndefined();
    expect(surfaceHeight(gap, -40, 40)).toBe(0);
  });
});

describe("solar frame display asset consumer", () => {
  it("accepts all 1055 actual UTC frames without adding interpolated instants", () => {
    const solar = parseSolarFrames(solarFixture());
    expect(solar.samples).toHaveLength(1055);
    const november = solarFrameAt(solar, "2026-11-15T00:00:00.000Z");
    expect(november?.sun_unit_me[0]).toBeCloseTo(-0.41344921773317, 12);
    expect(november?.sun_unit_me[1]).toBeCloseTo(0.91012166220481, 12);
    expect(november?.sun_unit_me[2]).toBeCloseTo(-0.02717175631769, 12);
    expect(solarFrameAt(solar, "2026-11-15T00:30:00.000Z")).toBeUndefined();
    expect(solarFrameAt(solar, "2026-11-15T00:00:00Z")).toBeUndefined();
    expect(solarFrameAt(solar, "2027-01-01T00:00:00.000Z")).toBeUndefined();
  });

  it.each([
    [
      "wrong frame",
      (d: ReturnType<typeof solarFixture>) => {
        d.frame = "IAU_MOON";
      },
    ],
    [
      "duplicate UTC",
      (d: ReturnType<typeof solarFixture>) => {
        d.samples[1].utc = d.samples[0].utc;
      },
    ],
    [
      "noncanonical UTC",
      (d: ReturnType<typeof solarFixture>) => {
        d.samples[0].utc = "2026-01-01T00:00:00Z";
      },
    ],
    [
      "missing UTC",
      (d: ReturnType<typeof solarFixture>) => {
        d.samples[0].utc = "2026-02-30T00:00:00.000Z";
      },
    ],
    [
      "non-unit ray",
      (d: ReturnType<typeof solarFixture>) => {
        d.samples[0].sun_unit_me = [0, 0, 2];
      },
    ],
    [
      "nonfinite ray",
      (d: ReturnType<typeof solarFixture>) => {
        d.samples[0].sun_unit_me[0] = Infinity;
      },
    ],
    [
      "scaled matrix",
      (d: ReturnType<typeof solarFixture>) => {
        d.samples[0].iau_to_me[0] = 2;
      },
    ],
    [
      "reflection",
      (d: ReturnType<typeof solarFixture>) => {
        d.samples[0].iau_to_me = [-1, 0, 0, 0, 1, 0, 0, 0, 1];
      },
    ],
    [
      "kernel identity",
      (d: ReturnType<typeof solarFixture>) => {
        d.provenance.kernels[0].sha256 = "verified";
      },
    ],
    [
      "empty provenance",
      (d: ReturnType<typeof solarFixture>) => {
        d.provenance = {};
      },
    ],
  ])("rejects %s before scene lighting can use it", (_, mutate) => {
    const data = solarFixture();
    mutate(data);
    expect(() => parseSolarFrames(data)).toThrow(
      /Orientação solar incompatível/,
    );
  });

  it("loads both checked assets through static HTTP and propagates request errors", async () => {
    const signal = new AbortController().signal;
    const fetch = vi
      .fn()
      .mockImplementation((url: string) =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              JSON.parse(url.includes("south-pole") ? terrainRaw : solarRaw),
            ),
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const loaded = await loadTerrainAssets(signal);
    expect(loaded.terrain.width).toBe(513);
    expect(loaded.solar.samples).toHaveLength(1055);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1]).toEqual({ signal });
    fetch.mockResolvedValue({ ok: false, status: 404 });
    await expect(loadTerrainAssets()).rejects.toThrow(/HTTP 404/);
  });

  it("does not hide a malformed JSON asset behind a plausible fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }),
    );
    await expect(loadTerrainAssets()).rejects.toThrow(/incompatível/);
  });
});
