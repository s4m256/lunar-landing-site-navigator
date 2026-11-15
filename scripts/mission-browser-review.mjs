// Run from the repository root, with Playwright and @axe-core/playwright beside this script.
// See docs/guided-mission.md. The preview is local; no production deployment is made.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const url = process.env.REVIEW_URL || "http://127.0.0.1:4174";
const output = process.env.REVIEW_OUTPUT || "/tmp/lunar-mission-review";
await mkdir(output, { recursive: true });
const selected = JSON.parse(
  await readFile("docs/audits/mission/selected-samples.json", "utf8"),
);
const originalResults = await Promise.all(
  ["ab", "cd"].map(async (pair) =>
    JSON.parse(
      await readFile(`docs/audits/mission/result-${pair}-2026.json`, "utf8"),
    ),
  ),
);
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_EXECUTABLE || "/usr/lib/chromium/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const report = {
  url,
  checks: [],
  errors: [],
  requestFailures: [],
  accessibility: [],
};
const angle = (value) => `${value.toFixed(1).replace(".", ",")}°`;

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "America/Sao_Paulo",
    reducedMotion: "reduce",
    acceptDownloads: true,
  });
  if (process.env.OFFLINE_REVIEW === "1") {
    await context.route(/^https?:/, (route) =>
      route.request().url() === url ? route.continue() : route.abort(),
    );
  }
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(String(error)));
  page.on("requestfailed", (request) =>
    report.requestFailures.push({
      url: request.url(),
      failure: request.failure(),
    }),
  );
  const audit = async (name) => {
    const findings = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    report.accessibility.push({
      name,
      violations: findings.violations.map((item) => ({
        id: item.id,
        impact: item.impact,
        nodes: item.nodes.map((node) => node.target),
      })),
    });
    assert.equal(
      findings.violations.length,
      0,
      `${name}: automated accessibility violations`,
    );
  };
  await page.goto(url, { waitUntil: "networkidle" });
  await page.locator(".game-scene--briefing").waitFor();
  assert.equal(
    await page.evaluate(() => document.activeElement?.tagName),
    "BODY",
  );
  assert(
    (await page.locator(".game-dialogue-text").innerText()).includes(
      "As missões CLPS são robóticas",
    ),
  );
  await audit("briefing");
  await page.screenshot({ path: `${output}/briefing.png`, fullPage: true });
  await page.getByRole("button", { name: /Sobre a missão/ }).click();
  await page.getByRole("dialog", { name: "Sobre esta missão" }).waitFor();
  assert(
    await page.locator(".mission-content").evaluate((element) => element.inert),
  );
  assert.equal(
    await page.locator(":focus").getAttribute("aria-label"),
    "Fechar janela",
  );
  await page.keyboard.press("Shift+Tab");
  assert((await page.locator(":focus").innerText()).includes("Baixar dados"));
  await page.keyboard.press("Tab");
  assert.equal(
    await page.locator(":focus").getAttribute("aria-label"),
    "Fechar janela",
  );
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: /Baixar dados/ }).click();
  const download = await downloadEvent;
  const downloaded = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.deepEqual(downloaded.results, originalResults);
  await audit("about-dialog");
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert((await page.locator(":focus").innerText()).includes("Sobre a missão"));
  report.checks.push(
    "Briefing explains robotic CLPS; dialog isolates background, traps/restores focus and downloads the exact scientific result objects.",
  );

  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Vamos nessa", exact: true }).click();
  await page.locator(".game-scene--arrival").waitFor();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page
    .getByRole("button", { name: "Escolher um local", exact: true })
    .click();
  await page.getByRole("heading", { name: "Onde vamos pousar?" }).waitFor();
  assert.equal(await page.locator(".mission-map-site").count(), 4);
  assert.equal(await page.locator(".mission-map-bonus").count(), 1);
  const dateSelect = page.getByLabel(/Data da observação/);
  for (const date of selected) {
    await dateSelect.selectOption(date.date);
    for (const site of date.sites) {
      const letter = site.site_id.slice(-1).toUpperCase();
      await page
        .getByRole("button", { name: new RegExp(`^Local ${letter},`) })
        .click();
      for (const [index, name] of ["sun", "earth"].entries()) {
        const card = page.locator(".target-card").nth(index);
        assert.equal(
          await card.locator(".target-elevation").innerText(),
          angle(site[name].elevation_deg),
        );
        assert.equal(
          await card.locator(".target-status").innerText(),
          site[name].elevation_deg > 0
            ? "Acima do horizonte"
            : "Abaixo do horizonte",
        );
        await card.click();
        assert.equal(await card.getAttribute("aria-pressed"), "true");
        const title = await page
          .locator(".mission-horizon title")
          .textContent();
        assert(
          title.includes(site[name].elevation_deg.toFixed(2).replace(".", ",")),
        );
        assert(
          title.includes(site[name].azimuth_deg.toFixed(2).replace(".", ",")),
        );
      }
      assert.equal(
        await page
          .getByRole("button", { name: /Pousar neste local/ })
          .isEnabled(),
        site.meets_goal,
      );
    }
  }
  report.checks.push(
    "All 24 centre elevations, 24 diagram azimuths and 12 decisions match four scientific sites in three UTC dates; no stale result or single hard-coded winner.",
  );
  await dateSelect.selectOption("2026-03-24");
  await page.getByRole("button", { name: /^Local A,/ }).click();
  await page.locator(".target-card").first().click();
  assert.equal(
    await page.getByRole("button", { name: /Pousar neste local/ }).isEnabled(),
    false,
  );
  await page.screenshot({ path: `${output}/selection-a.png`, fullPage: true });
  await page.getByRole("button", { name: /^Local B,/ }).click();
  await audit("selection");
  await page.screenshot({ path: `${output}/selection-b.png`, fullPage: true });
  await page.getByRole("button", { name: /Pousar neste local/ }).click();
  await page.getByRole("heading", { name: "Escolha registrada." }).waitFor();
  await audit("complete");
  await page.screenshot({ path: `${output}/complete.png`, fullPage: true });
  report.checks.push(
    "Reduced-motion launches and landings advance without animation; landing succeeds before discovering the optional bonus.",
  );
  await page.getByRole("button", { name: /Explorar outra opção/ }).click();
  await page
    .getByRole("button", { name: /Sinal desconhecido, bônus educativo/ })
    .click();
  await page
    .getByRole("dialog", { name: "Na Lua, o silêncio é diferente." })
    .waitFor();
  await audit("bonus-dialog");
  await page.keyboard.press("Escape");
  assert.equal(
    await page.locator(".mission-map-bonus").getAttribute("aria-label"),
    "Reabrir bônus educativo",
  );

  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole("button", { name: /^Local D,/ }).click();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Overflow at ${width}px`,
    );
    if (width < 760) {
      const panel = await page.locator(".mission-analysis-panel").boundingBox();
      assert(
        panel.y >= -2 && panel.y < 40,
        `Mobile selection should reveal analysis at ${width}px`,
      );
      await page.getByRole("button", { name: "Voltar ao mapa" }).click();
      assert.equal(await dateSelect.inputValue(), "2026-03-24");
      assert(
        (await page.locator(":focus").innerText()).includes(
          "Explore os locais",
        ),
      );
    }
    const buttons = await page
      .locator(".mission-map-site")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect();
          return { width: box.width, height: box.height };
        }),
      );
    assert(buttons.every((box) => box.width >= 44 && box.height >= 44));
    if (width === 390) {
      await page.getByRole("button", { name: /^Local B,/ }).click();
      await audit("mobile-selection");
      await page.screenshot({
        path: `${output}/mobile-selection.png`,
        fullPage: true,
      });
    }
  }
  report.checks.push(
    "320/390/768 px have no horizontal overflow; map hit areas are at least 44px; mobile selection reveals results and return preserves the date.",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  await audit("mobile-briefing");
  await page.screenshot({
    path: `${output}/mobile-briefing.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Pular conversa" }).click();
  await page.getByRole("button", { name: /^Local A,/ }).focus();
  await page.keyboard.press("Enter");
  assert.equal(
    await page
      .getByRole("button", { name: /^Local A,/ })
      .getAttribute("aria-pressed"),
    "true",
  );
  report.checks.push(
    "The introduction can be skipped; map selection works by keyboard.",
  );

  const animated = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "no-preference",
  });
  if (process.env.OFFLINE_REVIEW === "1") {
    await animated.route(/^https?:/, (route) =>
      route.request().url() === url ? route.continue() : route.abort(),
    );
  }
  const flightPage = await animated.newPage();
  await flightPage.goto(url, { waitUntil: "networkidle" });
  for (const label of ["Continuar", "Continuar", "Vamos nessa"]) {
    const reveal = flightPage.getByRole("button", {
      name: "Mostrar fala",
      exact: true,
    });
    if (await reveal.count()) await reveal.click();
    await flightPage.getByRole("button", { name: label, exact: true }).click();
  }
  await flightPage.locator(".game-scene--launch").waitFor();
  await flightPage.waitForFunction(() => {
    const craft = document.querySelector(".game-scene-craft");
    return craft
      ?.getAnimations()
      .some(
        (animation) =>
          animation.playState === "running" &&
          Number(animation.currentTime) > 500,
      );
  });
  await flightPage.screenshot({ path: `${output}/launch.png`, fullPage: true });
  await flightPage.getByRole("button", { name: "Pular decolagem" }).click();
  await flightPage.locator(".game-scene--arrival").waitFor();
  await flightPage.getByRole("button", { name: "Pular conversa" }).click();
  await flightPage.getByRole("button", { name: /^Local B,/ }).click();
  await flightPage.getByRole("button", { name: /Pousar neste local/ }).click();
  await flightPage.locator(".game-scene--landing").waitFor();
  await flightPage.waitForFunction(() =>
    document
      .querySelector(".game-scene-craft")
      ?.getAnimations()
      .some(
        (animation) =>
          animation.playState === "running" &&
          Number(animation.currentTime) > 500,
      ),
  );
  await flightPage.screenshot({
    path: `${output}/landing.png`,
    fullPage: true,
  });
  await flightPage.getByRole("button", { name: "Pular pouso" }).click();
  await flightPage
    .getByRole("heading", { name: "Escolha registrada." })
    .waitFor();
  await animated.close();
  report.checks.push(
    "Normal-motion launch and landing both offer working skip controls.",
  );
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
  process.exitCode = report.pass ? 0 : 1;
}
