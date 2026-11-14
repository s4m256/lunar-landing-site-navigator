import { describe, expect, it } from "vitest";
import data from "../../public/terrain/south-a-context.json";
import { parseTerrainContext } from "./terrain-data";

describe("contextual terrain input", () => {
  it("accepts the published ME/DE421 patch without treating it as a scientific horizon", () => {
    const terrain = parseTerrainContext(data);
    expect(terrain.metadata.use).toBe("VISUAL_CONTEXT_ONLY");
    expect(terrain.heightsM).toHaveLength(1089);
    expect(terrain.heightsM[544]).toBe(0);
    expect(terrain.metadata.verticalExaggeration).toBe(1);
  });

  it.each([
    [
      "wrong frame",
      (d: typeof data) => {
        d.metadata.coordinateFrame = "IAU_MOON";
      },
    ],
    [
      "wrong origin",
      (d: typeof data) => {
        d.metadata.centerLatitudeDeg = -89;
      },
    ],
    [
      "wrong row order",
      (d: typeof data) => {
        d.metadata.rowOrder = "south-to-north";
      },
    ],
    [
      "missing samples",
      (d: typeof data) => {
        d.heightsM.pop();
      },
    ],
    [
      "nonfinite height",
      (d: typeof data) => {
        d.heightsM[0] = NaN;
      },
    ],
    [
      "exaggerated elevations",
      (d: typeof data) => {
        d.metadata.verticalExaggeration = 3;
      },
    ],
    [
      "displaced observer",
      (d: typeof data) => {
        d.heightsM[544] = 100;
      },
    ],
    [
      "changed source",
      (d: typeof data) => {
        d.metadata.sourceImageSha256 = "0".repeat(64);
      },
    ],
  ] as const)("rejects %s instead of inventing terrain", (_name, mutate) => {
    const changed = structuredClone(data);
    mutate(changed);
    expect(() => parseTerrainContext(changed)).toThrow(
      "Relevo contextual indisponível",
    );
  });
});
