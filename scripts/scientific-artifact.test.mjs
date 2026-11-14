import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

// The frontend imports this original artifact directly, without a transformed copy.
test("scientific demo keeps the exact SHA-256 published in audit PR 5", async () => {
  const root = new URL("../docs/audits/pr4/", import.meta.url);
  const data = await readFile(new URL("result-2026.json", root));
  const manifest = JSON.parse(
    await readFile(new URL("checksums.sha256.json", root), "utf8"),
  );
  const hash = createHash("sha256").update(data).digest("hex");
  assert.equal(hash, manifest["result-2026.json"]);
  assert.equal(
    hash,
    "108d2adf202442acf32ba589504482ac00b2afac830b0bf14c55bc913147e023",
  );
});
