// Run from the repo root with Playwright and Axe installed beside this script.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const url = process.env.REVIEW_URL || "http://127.0.0.1:4174";
const output = process.env.REVIEW_OUTPUT || "/tmp/lunar-comparison-review";
await mkdir(output, { recursive: true });
const selected = JSON.parse(
  await readFile("docs/audits/mission/selected-samples.json", "utf8"),
);
const originals = await Promise.all(
  ["ab", "cd"].map(async (pair) =>
    JSON.parse(
      await readFile(`docs/audits/mission/result-${pair}-2026.json`, "utf8"),
    ),
  ),
);
const browser = await chromium.launch({
  executablePath: "/usr/lib/chromium/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--enable-unsafe-swiftshader",
  ],
});
const report = {
  checks: [],
  errors: [],
  requestFailures: [],
  accessibility: [],
};
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    reducedMotion: "reduce",
    acceptDownloads: true,
  });
  if (process.env.OFFLINE_REVIEW === "1")
    await context.route(/^https?:/, (route) =>
      route.request().url() === url ? route.continue() : route.abort(),
    );
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(String(error)));
  page.on("requestfailed", (request) =>
    report.requestFailures.push({
      url: request.url(),
      failure: request.failure(),
    }),
  );
  const audit = async (name) => {
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    report.accessibility.push({
      name,
      violations: result.violations.map((item) => ({
        id: item.id,
        nodes: item.nodes.map((node) => node.target),
      })),
    });
    assert.equal(result.violations.length, 0, name);
  };
  await page.goto(url, { waitUntil: "networkidle" });
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  await page
    .getByRole("heading", { name: "Compare lunar landing sites" })
    .waitFor();
  await page.locator('.mission-globe[data-status="ready"]').waitFor();
  assert.equal(
    await page
      .locator(".game-dialogue, .game-voice, .mission-globe-bonus")
      .count(),
    0,
  );
  assert.equal(await page.locator(".mission-globe-pin").count(), 4);
  assert(
    await page
      .getByRole("button", { name: /Compare another scenario/ })
      .isDisabled(),
  );
  assert.equal(
    await page.evaluate(() => document.activeElement.tagName),
    "BODY",
  );
  await audit("initial explorer");
  await page.screenshot({ path: `${output}/initial.png`, fullPage: true });
  const scenario1 = page.getByRole("region", {
    name: "Scenario 1",
    exact: true,
  });
  const scenario2 = page.getByRole("region", {
    name: "Scenario 2",
    exact: true,
  });
  for (const date of selected) {
    await page
      .getByLabel("Date for scenario 1", { exact: true })
      .selectOption(date.date);
    for (const site of date.sites) {
      await page
        .getByRole("button", {
          name: new RegExp(`^Site ${site.site_id.at(-1).toUpperCase()},`),
        })
        .click();
      for (const target of ["sun", "earth"]) {
        const row = scenario1.locator(`.scenario-card__direction--${target}`);
        assert(
          (await row.innerText()).includes(
            `${site[target].elevation_deg.toFixed(1)}° elevation`,
          ),
        );
        assert(
          (await row.innerText()).includes(
            `${site[target].elevation_deg > 0 ? "Above" : site[target].elevation_deg < 0 ? "Below" : "On"} horizon`,
          ),
        );
        assert(
          (await row.innerText()).includes(
            `Azimuth ${site[target].azimuth_deg.toFixed(1)}°`,
          ),
        );
        await page
          .getByRole("button", {
            name: target === "sun" ? "Sun" : "Earth",
            exact: true,
          })
          .click();
        const title = await page
          .locator(".mission-horizon title")
          .textContent();
        assert(title.includes(site[target].elevation_deg.toFixed(2)));
        assert(title.includes(site[target].azimuth_deg.toFixed(2)));
      }
    }
  }
  report.checks.push(
    "All 12 audited site/date combinations match 24 elevations, azimuths and full-precision horizon states; the horizon view follows the chosen body.",
  );
  await page
    .getByLabel("Site for scenario 1", { exact: true })
    .selectOption("mission-a");
  await page
    .getByLabel("Date for scenario 1", { exact: true })
    .selectOption("2026-03-24");
  await page.getByRole("button", { name: /Compare another scenario/ }).click();
  assert(
    await page
      .getByRole("button", { name: "Scenario 2", exact: true })
      .evaluate((el) => el === document.activeElement),
  );
  assert(
    (await page.locator(".comparison-summary").innerText()).includes(
      "Same site and date",
    ),
  );
  const firstSnapshot = await scenario1
    .locator(".scenario-card__results")
    .innerText();
  await page.getByRole("button", { name: /^Site B,/ }).click();
  assert.equal(
    await page.getByLabel("Site for scenario 2", { exact: true }).inputValue(),
    "mission-b",
  );
  assert.equal(
    await scenario1.locator(".scenario-card__results").innerText(),
    firstSnapshot,
  );
  assert(
    (await page.locator(".comparison-summary").innerText()).includes(
      "Different sites. Same date.",
    ),
  );
  await page.getByRole("button", { name: "Sun", exact: true }).click();
  await audit("two scenarios");
  await page.screenshot({
    path: `${output}/comparison-desktop.png`,
    fullPage: true,
  });
  await page
    .getByLabel("Site for scenario 2", { exact: true })
    .selectOption("mission-a");
  await page
    .getByLabel("Date for scenario 2", { exact: true })
    .selectOption("2026-04-28");
  assert(
    (await page.locator(".comparison-summary").innerText()).includes(
      "Same site. Different dates.",
    ),
  );
  assert.equal(
    await scenario1.locator(".scenario-card__results").innerText(),
    firstSnapshot,
  );
  const secondSnapshot = await scenario2
    .locator(".scenario-card__results")
    .innerText();
  await page.getByRole("button", { name: "Scenario 1", exact: true }).click();
  await page.getByRole("button", { name: /^Site C,/ }).click();
  assert.equal(
    await page.getByLabel("Site for scenario 1", { exact: true }).inputValue(),
    "mission-c",
  );
  assert.equal(
    await scenario2.locator(".scenario-card__results").innerText(),
    secondSnapshot,
  );
  assert(
    (
      await page.getByRole("heading", { name: /horizon view/ }).innerText()
    ).includes("Scenario 1"),
  );
  await page.getByRole("button", { name: "Remove scenario 2" }).click();
  assert.equal(await scenario2.count(), 0);
  assert(
    await page
      .getByRole("button", { name: /Compare another scenario/ })
      .evaluate((el) => el === document.activeElement),
  );
  assert.equal(
    await page.getByLabel("Site for scenario 1", { exact: true }).inputValue(),
    "mission-c",
  );
  report.checks.push(
    "Adding, independently editing and removing scenario 2 preserves scenario 1; same-site/different-date comparison works; active map and horizon stay synchronized.",
  );
  await page.getByRole("button", { name: "About & data" }).click();
  const modal = page.getByRole("dialog", { name: "About this explorer" });
  assert(await modal.isVisible());
  assert(await page.locator(".comparison-content").evaluate((el) => el.inert));
  assert(
    await page
      .getByRole("button", { name: "Close about" })
      .evaluate((el) => el === document.activeElement),
  );
  await page.keyboard.press("Shift+Tab");
  assert(
    await page
      .getByRole("link", { name: "Download source data (JSON)" })
      .evaluate((el) => el === document.activeElement),
  );
  await page.keyboard.press("Tab");
  assert(
    await page
      .getByRole("button", { name: "Close about" })
      .evaluate((el) => el === document.activeElement),
  );
  const pending = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download source data (JSON)" }).click();
  const download = await pending;
  assert.equal(
    download.suggestedFilename(),
    "lunar-comparison-source-data.json",
  );
  assert.deepEqual(
    JSON.parse(await readFile(await download.path(), "utf8")).results,
    originals,
  );
  await audit("about and source data");
  await page.keyboard.press("Escape");
  assert(
    await page
      .getByRole("button", { name: "About & data" })
      .evaluate((el) => el === document.activeElement),
  );
  const viewport = page.getByRole("group", { name: "Interactive Moon" });
  const pinBefore = await page
    .getByRole("button", { name: /^Site A,/ })
    .boundingBox();
  await viewport.focus();
  await page.keyboard.press("ArrowRight");
  const pinAfter = await page
    .getByRole("button", { name: /^Site A,/ })
    .boundingBox();
  assert(
    pinBefore &&
      pinAfter &&
      Math.hypot(pinBefore.x - pinAfter.x, pinBefore.y - pinAfter.y) > 1,
  );
  await page.getByRole("button", { name: "South pole", exact: true }).click();
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await page.getByRole("button", { name: "South pole", exact: true }).click();
  await page
    .getByRole("button", { name: "View whole Moon", exact: true })
    .click();
  await page.screenshot({ path: `${output}/whole-moon.png`, fullPage: true });
  await page.getByRole("button", { name: "South pole", exact: true }).click();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `No horizontal overflow at ${width}px`,
    );
    await page.locator(".mission-globe-stage").scrollIntoViewIfNeeded();
    for (const pin of await page.locator(".mission-globe-pin").all()) {
      const box = await pin.boundingBox();
      assert(box.width >= 44 && box.height >= 44);
    }
    await page
      .getByRole("button", { name: /Compare another scenario/ })
      .click();
    await page
      .getByLabel("Date for scenario 2", { exact: true })
      .selectOption("2026-09-08");
    assert.equal(
      await page
        .getByLabel("Date for scenario 1", { exact: true })
        .inputValue(),
      "2026-03-24",
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    if (width === 390) {
      await audit("mobile comparison");
      await page.screenshot({
        path: `${output}/comparison-mobile.png`,
        fullPage: true,
      });
    }
    await page.getByRole("button", { name: "Remove scenario 2" }).click();
  }
  await page
    .locator(".mission-globe-stage canvas")
    .evaluate((canvas) =>
      canvas
        .getContext("webgl2")
        .getExtension("WEBGL_lose_context")
        .loseContext(),
    );
  await page.locator('.mission-globe[data-status="unavailable"]').waitFor();
  await page
    .getByLabel("Site for scenario 1", { exact: true })
    .selectOption("mission-d");
  assert(
    (await scenario1.locator(".scenario-card__results").innerText()).includes(
      "Sun",
    ),
  );
  report.checks.push(
    "About focus trap, exact audit download, keyboard orbit/zoom, 320/390/768 layouts, 44px map targets, and context-loss fallback verified.",
  );
  await context.close();
  const fallback = await browser.newContext({ reducedMotion: "reduce" });
  await fallback.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (/webgl/.test(type)) return null;
      return original.call(this, type, ...args);
    };
  });
  if (process.env.OFFLINE_REVIEW === "1")
    await fallback.route(/^https?:/, (route) =>
      route.request().url() === url ? route.continue() : route.abort(),
    );
  const alt = await fallback.newPage();
  alt.on("pageerror", (error) => report.errors.push(String(error)));
  await alt.goto(url, { waitUntil: "networkidle" });
  await alt.locator('.mission-globe[data-status="unavailable"]').waitFor();
  await alt
    .getByLabel("Site for scenario 1", { exact: true })
    .selectOption("mission-b");
  await alt.getByRole("button", { name: /Compare another scenario/ }).click();
  await alt
    .getByLabel("Site for scenario 2", { exact: true })
    .selectOption("mission-c");
  assert.equal(await alt.locator(".scenario-card__results").count(), 2);
  await fallback.close();
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.requestFailures, []);
  report.pass = true;
} catch (error) {
  report.pass = false;
  report.failure = String(error.stack || error);
} finally {
  await browser.close();
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
if (!report.pass) process.exitCode = 1;
