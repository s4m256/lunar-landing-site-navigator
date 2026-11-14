import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const audit = path.join(root, "docs/audits/mission");
const read = async (file) => JSON.parse(await readFile(file, "utf8"));
const manifest = await read(path.join(audit, "manifest.json"));
const hash = (value) => createHash("sha256").update(value).digest("hex");

test("mission provenance identifies the exact unchanged scientific sources and outputs", async () => {
  for (const [name, expected] of Object.entries(manifest.source_sha256)) {
    assert.equal(hash(await readFile(path.join(root, name))), expected, name);
  }
  for (const [name, expected] of Object.entries(manifest.output_sha256)) {
    assert.equal(hash(await readFile(path.join(audit, name))), expected, name);
  }
});

test("curated mission examples are exact scientific samples, and allow every qualifying site", async () => {
  const selected = await read(path.join(audit, "selected-samples.json"));
  const batches = await Promise.all(
    ["ab", "cd"].map((pair) =>
      read(path.join(audit, `result-${pair}-2026.json`)),
    ),
  );
  const rows = batches.flatMap((batch) => batch.series);
  assert.equal(selected.length, 3);
  const qualifyingSites = new Set();
  for (const date of selected) {
    assert.equal(date.sites.length, 4);
    let count = 0;
    for (const site of date.sites) {
      for (const target of ["sun", "earth"]) {
        const sample = rows
          .find(
            (row) =>
              row.site_id === site.site_id &&
              row.target === target.toUpperCase(),
          )
          .samples.find(
            (sample) => sample.utc === `${date.date}T00:00:00.000Z`,
          );
        assert.deepEqual(site[target], sample);
      }
      const qualifies =
        site.sun.elevation_deg > 0 && site.earth.elevation_deg > 0;
      assert.equal(site.meets_goal, qualifies);
      if (qualifies) {
        count++;
        qualifyingSites.add(site.site_id);
      }
    }
    assert(count > 0);
    if (date.date === "2026-03-24")
      assert.equal(count, 2, "Both valid choices must remain valid.");
  }
  assert.equal(
    qualifyingSites.size,
    4,
    "A date change can make any of the four sites qualify.",
  );
});
