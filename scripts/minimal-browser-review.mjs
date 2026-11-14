// Run from the repository root, with Playwright and @axe-core/playwright available
// beside this script (see docs/minimal-explorer.md). All requests target local preview.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const url = process.env.REVIEW_URL || "http://127.0.0.1:4174";
const output = process.env.REVIEW_OUTPUT || "/tmp/lunar-minimal-review";
await mkdir(output, { recursive: true });
const bytes = await readFile("docs/audits/pr4/result-2026.json");
const data = JSON.parse(bytes);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE || "/usr/lib/chromium/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const report = { url, checks: [], errors: [], resources: [], screenshots: [], accessibility: [] };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "America/Sao_Paulo", reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(String(error)));
  page.on("requestfailed", (request) => report.resources.push({ url: request.url(), error: request.failure() }));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.getByText("Relevo contextual LOLA · horizonte idealizado", { exact: true }).waitFor();
  assert.equal(await page.locator("canvas").count(), 1);
  assert.equal(await page.getByRole("button").count(), 2);
  report.checks.push("Three controls: date, recenter and information; real contextual DEM loaded.");

  for (const date of ["2026-01-01", "2026-06-15", "2026-12-31"]) {
    await page.getByLabel("Data da amostra (UTC)").fill(date);
    for (const [target, name] of [["SUN", "Sol"], ["EARTH", "Terra"]]) {
      const sample = data.series.find((s) => s.site_id === "south-a" && s.target === target).samples.find((s) => s.utc === `${date}T00:00:00.000Z`);
      const card = page.getByRole("article", { name, exact: true });
      assert.equal(await card.locator("dd").nth(0).innerText(), `${sample.elevation_deg.toFixed(2)}°`);
      assert.equal(await card.locator("dd").nth(1).innerText(), `${sample.azimuth_deg.toFixed(2)}°`);
      assert((await page.getByRole("status").innerText()).includes(`${date}T00:00:00.000Z`));
    }
  }
  report.checks.push("All twelve displayed numbers match source at first/middle/last UTC dates in America/Sao_Paulo.");
  await page.getByLabel("Data da amostra (UTC)").fill("2026-01-01");
  const compass = page.locator(".scene-compass");
  const initialCompass = await compass.getAttribute("style");
  await page.getByRole("region", { name: "Exploração tridimensional do local lunar" }).focus();
  await page.keyboard.press("ArrowLeft");
  assert.notEqual(await compass.getAttribute("style"), initialCompass);
  await page.getByRole("button", { name: "Recentrar", exact: true }).click();
  assert.equal(await compass.getAttribute("style"), initialCompass);
  assert.equal(await page.getByLabel("Data da amostra (UTC)").inputValue(), "2026-01-01");
  report.checks.push("Keyboard rotates the scene; recenter restores its orientation without changing UTC.");

  const checkAccessibility = async (name) => {
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    report.accessibility.push({ name, violations: result.violations.map((v) => ({ id: v.id, impact: v.impact, description: v.description, nodes: v.nodes.map((n) => n.target) })) });
    assert.equal(result.violations.length, 0, `${name}: accessibility violations`);
  };
  await checkAccessibility("desktop");
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true });
  report.screenshots.push(`${output}/desktop.png`);

  await page.getByRole("button", { name: "Informações", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Entenda o seu horizonte" });
  await dialog.waitFor();
  assert.equal(await page.locator(":focus").getAttribute("aria-label"), "Fechar informações");
  await page.keyboard.press("Shift+Tab");
  assert((await page.locator(":focus").innerText()).includes("Baixar JSON completo"));
  await page.keyboard.press("Tab");
  assert.equal(await page.locator(":focus").getAttribute("aria-label"), "Fechar informações");
  const link = dialog.getByRole("link", { name: /Baixar JSON completo/ });
  const artifact = await page.request.get(new URL(await link.getAttribute("href"), page.url()).href);
  assert.equal(hash(await artifact.body()), hash(bytes));
  await checkAccessibility("information-dialog");
  await page.screenshot({ path: `${output}/information.png`, fullPage: true });
  await page.keyboard.press("Escape");
  assert.equal(await dialog.count(), 0);
  assert.equal(await page.locator(":focus").innerText(), "Informações");
  report.checks.push("Information contains/restores keyboard focus, closes on Escape; download equals audited bytes.");

  await page.getByLabel("Data da amostra (UTC)").fill("2027-01-01");
  assert.equal(await page.locator(".explorer-measurements").count(), 0);
  assert.equal(await page.locator(".scene-label:not([hidden])").count(), 0);
  assert((await page.getByRole("status").innerText()).includes("Sem amostra"));
  await page.getByLabel("Data da amostra (UTC)").fill("2026-01-01");
  report.checks.push("Out-of-coverage dates remove numbers and directions without a substitute sample.");

  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(200);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Horizontal overflow at ${width}`);
    assert(await page.getByRole("button", { name: "Informações", exact: true }).isVisible());
    const labels = await page.locator(".scene-label:not([hidden])").evaluateAll((elements) => elements.map((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }));
    if (labels.length === 2) assert(labels[0].right <= labels[1].left || labels[1].right <= labels[0].left || labels[0].bottom <= labels[1].top || labels[1].bottom <= labels[0].top, `Labels overlap at ${width}`);
    if (width === 390) {
      await checkAccessibility("mobile-390");
      await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
      report.screenshots.push(`${output}/mobile.png`);
    }
  }
  report.checks.push("320/390/768 px layouts avoid horizontal overflow and overlapping celestial labels.");

  const noTerrain = await context.newPage();
  await noTerrain.route("**/terrain/south-a-context.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await noTerrain.goto(url, { waitUntil: "networkidle" });
  await noTerrain.getByText("Relevo indisponível · superfície idealizada", { exact: true }).waitFor();
  assert.equal(await noTerrain.getByRole("article", { name: "Sol", exact: true }).locator("dd").count(), 2);
  report.checks.push("Malformed terrain falls back explicitly while preserving independent scientific values.");
  await noTerrain.close();

  const noWebGL = await context.newPage();
  await noWebGL.addInitScript(() => {
    Object.defineProperty(window, "WebGLRenderingContext", { value: undefined, configurable: true });
    Object.defineProperty(window, "WebGL2RenderingContext", { value: undefined, configurable: true });
  });
  await noWebGL.goto(url, { waitUntil: "networkidle" });
  await noWebGL.getByRole("img", { name: /Panorama alternativo/ }).waitFor();
  assert.equal(await noWebGL.getByRole("article", { name: "Terra", exact: true }).locator("dd").count(), 2);
  report.checks.push("Without WebGL, the alternative panorama and scientific readouts remain available.");
  await noWebGL.screenshot({ path: `${output}/fallback.png`, fullPage: true });
  await noWebGL.close();
  assert.equal(report.errors.length, 0);
  assert.equal(report.resources.length, 0);
  report.pass = true;
} catch (error) {
  report.pass = false;
  report.failure = String(error.stack || error);
} finally {
  await browser.close();
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.pass ? 0 : 1;
}
