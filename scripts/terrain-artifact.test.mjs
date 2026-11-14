import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const root = new URL("../frontend/public/terrain/", import.meta.url);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("contextual terrain and original PDS label keep their recorded hashes", async () => {
  const [artifact, label, manifest] = await Promise.all([
    readFile(new URL("south-a-context.json", root)),
    readFile(new URL("LDEM_4.LBL", root)),
    readFile(new URL("provenance.json", root), "utf8").then(JSON.parse),
  ]);
  assert.equal(hash(artifact), manifest.artifactSha256);
  assert.equal(hash(label), manifest.sourceLabelSha256);
  assert.equal(manifest.primaryArchiveVerified, false);
  assert.match(label.toString(), /MEAN EARTH\/POLAR AXIS OF DE421/);
});

test("terrain vertices retain radial heights and curvature after conversion to local coordinates", async () => {
  const data = JSON.parse(
    await readFile(new URL("south-a-context.json", root), "utf8"),
  );
  const centerRadius = data.metadata.referenceRadiusM + data.centerElevationM;
  for (let row = 0; row < data.size; row++) {
    for (let col = 0; col < data.size; col++) {
      const index = row * data.size + col;
      const east = (col / (data.size - 1) - 0.5) * data.extentM;
      const north = (0.5 - row / (data.size - 1)) * data.extentM;
      const radius = Math.hypot(
        east,
        north,
        centerRadius + data.heightsM[index],
      );
      // Bound on rounding to millimetres in the exported grid, not physical accuracy.
      assert.ok(
        Math.abs(
          radius - data.metadata.referenceRadiusM - data.elevationsM[index],
        ) < 0.002,
      );
    }
  }
});
