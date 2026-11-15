// Run with Playwright and @axe-core/playwright beside this script.
// Checks the current English, text-only guide; speech is intentionally absent.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const url =
  process.env.REVIEW_URL || "http://127.0.0.1:4188/Lunar-English.html";
const output =
  process.env.REVIEW_OUTPUT || "/tmp/lunar-english-dialogue-review";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_EXECUTABLE || "/usr/lib/chromium/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--enable-unsafe-swiftshader",
  ],
});
const report = { checks: [], errors: [], accessibility: [] };
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "no-preference",
  });
  await context.addInitScript(() => {
    window.__speechAccesses = 0;
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      get() {
        window.__speechAccesses++;
        return { getVoices: () => [], speak() {}, cancel() {} };
      },
    });
  });
  if (process.env.OFFLINE_REVIEW === "1") {
    await context.route(/^https?:/, (route) =>
      route.request().url() === url ? route.continue() : route.abort(),
    );
  }
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(String(error)));
  await page.goto(url, { waitUntil: "networkidle" });
  const next = page.getByRole("button", { name: "Continue", exact: true });
  const back = page.getByRole("button", { name: "Back", exact: true });
  const line = () =>
    page.locator(".game-dialogue-text > span").first().innerText();
  const visibleLine = () =>
    page
      .locator(".game-dialogue-text > span[aria-hidden] > span")
      .last()
      .innerText();
  async function advance() {
    if ((await line()) !== (await visibleLine())) await next.click();
    await next.click();
  }
  async function audit(name) {
    const findings = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    report.accessibility.push({
      name,
      violations: findings.violations.map((item) => item.id),
    });
    assert.equal(findings.violations.length, 0, name);
  }
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  assert.match(await line(), /CLPS missions are robotic/);
  assert(await back.isDisabled());
  assert.deepEqual(
    await page.locator(".game-dialogue-actions button").allTextContents(),
    ["Back", "Continue"],
  );
  assert.equal(await page.locator(".game-voice, .speech-control").count(), 0);
  await next.focus();
  await page.keyboard.press("Enter");
  assert.equal(await next.innerText(), "Continue");
  assert(await next.evaluate((button) => button === document.activeElement));
  const firstLine = await line();
  await page.keyboard.press("Enter");
  assert.notEqual(await line(), firstLine);
  await back.focus();
  await page.keyboard.press("Enter");
  assert.equal(await line(), firstLine);
  assert(await back.isDisabled());
  assert(await next.evaluate((button) => button === document.activeElement));
  await next.click(); // Reveal first line for the screenshot.
  await audit("English briefing");
  await page.screenshot({
    path: `${output}/dialogue-desktop.png`,
    fullPage: true,
  });
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    for (const control of [back, next]) {
      const box = await control.boundingBox();
      assert(
        box.width >= 44 && box.height >= 44,
        "Dialogue targets must be at least 44px",
      );
    }
    if (width === 390) {
      await audit("English briefing mobile");
      await page.screenshot({
        path: `${output}/dialogue-mobile.png`,
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await advance();
  await advance();
  const lastOpening = await line();
  await advance();
  await page.getByRole("button", { name: "Skip launch" }).click();
  const firstArrival = await line();
  await back.click();
  assert.equal(await line(), lastOpening);
  await advance();
  await page.getByRole("button", { name: "Skip launch" }).click();
  assert.equal(await line(), firstArrival);
  await advance();
  await back.click();
  assert.equal(await line(), firstArrival);
  await advance();
  await advance();
  await page.getByRole("heading", { name: "Where should we land?" }).waitFor();
  await page.locator('.mission-globe[data-status="ready"]').waitFor();
  await page.getByRole("button", { name: /^Site B,/ }).click();
  await page.getByRole("button", { name: "Land here" }).click();
  await page.getByRole("button", { name: "Skip landing" }).click();
  await page.getByRole("heading", { name: "Site selected." }).waitFor();
  assert.equal(await page.locator(".game-dialogue-actions button").count(), 2);
  await back.click();
  assert.equal(
    await page
      .getByRole("button", { name: /^Site B,/ })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "About", exact: true }).click();
  assert(
    await page.getByRole("dialog", { name: "About this mission" }).isVisible(),
  );
  assert(
    await page
      .getByRole("link", { name: "Download data and audit (JSON)" })
      .isVisible(),
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  assert.equal(await page.evaluate(() => window.__speechAccesses), 0);
  report.checks.push(
    "Two dialogue controls, reveal-before-advance, backward navigation across scenes, keyboard focus, English copy, and no voice API access verified.",
  );
  report.checks.push(
    "Mobile widths 320/390/768 fit without horizontal overflow; controls retain 44px touch targets; completion returns to the selected site.",
  );
  await context.close();
  assert.deepEqual(report.errors, []);
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
