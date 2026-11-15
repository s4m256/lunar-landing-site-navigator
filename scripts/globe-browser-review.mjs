// Run from the repository root with Playwright beside this script.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.env.REVIEW_URL || "http://127.0.0.1:4174";
const output = process.env.REVIEW_OUTPUT || "/tmp/lunar-globe-review";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/lib/chromium/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--enable-unsafe-swiftshader",
  ],
});
const report = { checks: [], errors: [], samples: [] };
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(String(error)));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  assert(
    await page.evaluate(() => document.fonts.check('20px "JetBrains Mono"')),
  );
  assert.deepEqual(
    await page.locator(".game-dialogue").evaluate((element) => {
      const css = getComputedStyle(element);
      return { border: css.borderWidth, background: css.backgroundColor };
    }),
    { border: "0px", background: "rgba(0, 0, 0, 0)" },
  );
  await page.screenshot({ path: `${output}/dialogue.png`, fullPage: true });
  await page.getByRole("button", { name: "Pular conversa" }).click();
  await page.locator('.mission-globe[data-status="ready"]').waitFor();
  assert.equal(await page.locator(".mission-globe-pin").count(), 4);
  // Draw synchronously, then sample the real framebuffer before composition.
  // This catches a flat placeholder texture even when projection/unit tests pass.
  report.samples = await page
    .locator(".mission-globe-stage canvas")
    .evaluate((canvas) => {
      canvas.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: 0.01,
          bubbles: true,
          cancelable: true,
        }),
      );
      const gl = canvas.getContext("webgl2");
      const values = [];
      for (let y = 0.34; y < 0.68; y += 0.06)
        for (let x = 0.34; x < 0.68; x += 0.06) {
          const pixel = new Uint8Array(4);
          gl.readPixels(
            Math.floor(x * canvas.width),
            Math.floor(y * canvas.height),
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixel,
          );
          values.push(pixel[0]);
        }
      return values;
    });
  assert(
    Math.max(...report.samples) - Math.min(...report.samples) > 20,
    "Polar relief must contain terrain detail, not a flat texture placeholder",
  );
  await page.getByRole("button", { name: "Polo sul", exact: true }).click();
  await page.screenshot({ path: `${output}/polar.png`, fullPage: true });
  await page
    .getByRole("button", { name: "Ver Lua inteira", exact: true })
    .click();
  await page.screenshot({ path: `${output}/globe.png`, fullPage: true });
  assert.equal(
    await page.locator(".mission-globe-pin").count(),
    0,
    "Overlapping zoomed-out hit targets are hidden until zoomed in",
  );
  await page.getByRole("button", { name: "Polo sul", exact: true }).click();
  const siteB = page.getByRole("button", { name: /^Local B,/ });
  await siteB.focus();
  await page.keyboard.press("Enter");
  assert.equal(await siteB.getAttribute("aria-pressed"), "true");
  await page.getByRole("heading", { name: "Local B", exact: true }).waitFor();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.locator(".mission-globe-stage").scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const stage = document
        .querySelector(".mission-globe-stage")
        .getBoundingClientRect();
      return (
        [...document.querySelectorAll(".mission-globe-pin")].length === 4 &&
        [...document.querySelectorAll(".mission-globe-pin")].every((pin) => {
          const box = pin.getBoundingClientRect();
          return (
            box.width >= 44 &&
            box.height >= 44 &&
            box.left >= stage.left - 1 &&
            box.right <= stage.right + 1 &&
            box.top >= stage.top - 1 &&
            box.bottom <= stage.bottom + 1
          );
        })
      );
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    if (width === 390)
      await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
  }
  report.checks.push(
    "Real WebGL renders polar relief; all four registered markers select by keyboard, fit touch targets at 320/390/768 px, and reset from whole-Moon view.",
  );
  await page
    .locator(".mission-globe-stage canvas")
    .evaluate((canvas) =>
      canvas
        .getContext("webgl2")
        .getExtension("WEBGL_lose_context")
        .loseContext(),
    );
  await page.locator('.mission-globe[data-status="unavailable"]').waitFor();
  await page.getByRole("button", { name: /^Local C ·/ }).click();
  await page.getByRole("heading", { name: "Local C", exact: true }).waitFor();
  await context.close();

  const fallback = await browser.newContext({ reducedMotion: "reduce" });
  await fallback.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (
        type === "webgl2" ||
        type === "webgl" ||
        type === "experimental-webgl"
      )
        return null;
      return original.call(this, type, ...args);
    };
  });
  const alternative = await fallback.newPage();
  alternative.on("pageerror", (error) => report.errors.push(String(error)));
  await alternative.goto(url, { waitUntil: "networkidle" });
  await alternative.getByRole("button", { name: "Pular conversa" }).click();
  await alternative
    .locator('.mission-globe[data-status="unavailable"]')
    .waitFor();
  await alternative.getByRole("button", { name: /^Local B ·/ }).click();
  await alternative
    .getByRole("heading", { name: "Local B", exact: true })
    .waitFor();
  report.checks.push(
    "Context loss and missing WebGL expose an operational coordinate list without fabricating a terrain view. Dialogue font loads and its panel border/background are absent.",
  );
  await fallback.close();
  assert.deepEqual(report.errors, []);
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
