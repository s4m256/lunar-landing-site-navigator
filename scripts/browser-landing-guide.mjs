// Optional browser acceptance runner; production needs only the static Vite build.
// Start `vite preview` on 4174. Supply PLAYWRIGHT_PATH and CHROMIUM_PATH when needed.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || "playwright");
const base = process.env.LANDING_GUIDE_URL || "http://127.0.0.1:4174";
const output =
  process.env.LANDING_GUIDE_EVIDENCE || "/tmp/landing-guide-evidence";
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/lib/chromium/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const report = {
  browser: await browser.version(),
  base,
  timezone: "America/Sao_Paulo",
  checks: [],
  layouts: [],
};
const check = (name) => report.checks.push(name);
const pause = (page) => page.waitForTimeout(180); // Finish the short UI opacity transition before capturing.
async function shot(page, name) {
  await pause(page);
  await page.screenshot({
    path: path.join(output, name + ".png"),
    fullPage: true,
  });
}
async function close(page, title) {
  await page
    .getByRole("button", { name: "Fechar " + title, exact: true })
    .click();
}
async function openTime(page) {
  await page.getByRole("button", { name: "Tempo", exact: true }).click();
  return page.locator("#guide-panel-time");
}
try {
  for (const [size, width, height] of [
    ["desktop", 1440, 1000],
    ["tablet", 768, 1000],
    ["mobile", 390, 844],
    ["narrow", 320, 844],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      locale: "pt-BR",
      timezoneId: report.timezone,
      reducedMotion: "reduce",
    });
    const errors = [],
      consoleErrors = [],
      external = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("request", (r) => {
      if (!r.url().startsWith(base)) external.push(r.url());
    });
    await page.goto(base);
    await page.getByRole("button", { name: "Start", exact: true }).waitFor();
    await shot(page, size + "-landing");
    const home = await page.locator("h1").boundingBox();
    assert(
      home.x >= 0 && home.x + home.width <= width + 1,
      "Landing title fits",
    );
    await page
      .getByRole("button", { name: "How it works", exact: true })
      .click();
    assert.equal(await page.locator(".lg-landing").getAttribute("inert"), "");
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      (button) => document.activeElement === button,
      await page
        .getByRole("button", { name: "How it works", exact: true })
        .elementHandle(),
    );
    assert.equal(
      await page
        .getByRole("button", { name: "How it works", exact: true })
        .evaluate((e) => e === document.activeElement),
      true,
    );
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page
      .locator('.lg-surface-terrain[data-loaded="true"]')
      .waitFor({ timeout: 30000 });
    const surface = page.locator(".lg-surface-terrain");
    const canvas = await surface.locator("canvas").boundingBox();
    assert.deepEqual(canvas, { x: 0, y: 0, width, height });
    assert.equal(await page.locator(".lg-panel").count(), 0);
    await shot(page, size + "-explore");
    const dock = await page.evaluate(() => {
      const names = [
        ".lg-view-toggle",
        ".lg-time-dock .lg-tool",
        ".lg-tool-data",
      ];
      return names.map((s) => {
        const r = document.querySelector(s).getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
    });
    const overlap = (a, b) =>
      Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
      Math.max(
        0,
        Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
      );
    assert.equal(overlap(dock[0], dock[1]), 0);
    assert.equal(overlap(dock[1], dock[2]), 0);
    const touch = await page
      .getByRole("button", { name: "2D", exact: true })
      .boundingBox();
    assert(touch.width >= 48 && touch.height >= 48);
    check(
      size +
        ": landing/help/Escape/focus, panels initially closed, footer targets fit",
    );
    await page.getByRole("button", { name: /^Dados/ }).click();
    let data = page.locator("#guide-panel-data");
    assert(
      (
        await data.locator('[aria-label="Dados do local A"]').innerText()
      ).includes("+0,55°"),
    );
    assert(
      (
        await data.locator('[aria-label="Dados do local B"]').innerText()
      ).includes("-0,54°"),
    );
    await data.getByRole("button", { name: "Terra", exact: true }).click();
    assert((await data.innerText()).includes("+5,84°"));
    assert((await data.innerText()).includes("+5,26°"));
    await shot(page, size + "-data");
    await close(page, "Dados dos locais");
    await page
      .getByRole("button", { name: "Aproximar mapa", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Girar mapa 15 graus", exact: true })
      .click();
    const cameraBefore = await surface.evaluate((e) => [
      e.dataset.centerLatitude,
      e.dataset.centerLongitude,
      e.dataset.zoom,
      e.dataset.bearing,
    ]);
    await page.getByRole("button", { name: "2D", exact: true }).click();
    await shot(page, size + "-2d");
    for (const marker of await page.locator(".lg-surface-marker").all()) {
      const bounds = await marker.boundingBox();
      assert(
        bounds.x >= 0 && bounds.x + bounds.width <= width,
        "Marker label stays in viewport",
      );
    }
    await page.getByRole("button", { name: "3D", exact: true }).click();
    assert.deepEqual(
      await surface.evaluate((e) => [
        e.dataset.centerLatitude,
        e.dataset.centerLongitude,
        e.dataset.zoom,
        e.dataset.bearing,
      ]),
      cameraBefore,
    );
    await page
      .getByRole("button", { name: "Afastar mapa", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Restaurar orientação da projeção",
        exact: true,
      })
      .click();
    check(
      size +
        ": terrain fills viewport; 2D/3D preserves camera, zoom and bearing",
    );
    await page.getByRole("button", { name: /^Dados/ }).click();
    data = page.locator("#guide-panel-data");
    assert.equal(
      await data
        .getByRole("button", { name: "Terra", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    assert((await data.innerText()).includes("+5,84°"));
    await close(page, "Dados dos locais");
    check(
      size + ": exact source values, target and A/B preserved through 2D/3D",
    );
    await page
      .getByRole("button", { name: "Seleção A/B", exact: true })
      .click();
    const selection = page.locator("#guide-panel-selection");
    await selection
      .getByRole("button", { name: "Local A", exact: true })
      .click();
    await selection
      .locator("summary")
      .filter({ hasText: "Informar coordenadas" })
      .click();
    await selection.getByLabel("Latitude planetocêntrica (°)").fill("-85");
    await selection.getByLabel("Longitude leste (°)").fill("42");
    await selection
      .getByRole("button", {
        name: "Selecionar coordenadas como A",
        exact: true,
      })
      .click();
    await close(page, "Escolher locais");
    await page.getByRole("button", { name: /^Dados/ }).click();
    data = page.locator("#guide-panel-data");
    assert(
      (
        await data.locator('[aria-label="Dados do local A"]').innerText()
      ).includes("Sem resultados para estas coordenadas"),
    );
    assert(
      (
        await data.locator('[aria-label="Dados do local B"]').innerText()
      ).includes("+5,26°"),
    );
    await close(page, "Dados dos locais");
    await page
      .getByRole("button", { name: "Seleção A/B", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Restaurar os dois locais calculados",
        exact: true,
      })
      .click();
    await close(page, "Escolher locais");
    check(
      size +
        ": free location cannot inherit science; other slot remains correct; restore works",
    );
    await page
      .getByRole("button", { name: "Seleção A/B", exact: true })
      .click();
    await page
      .locator("#guide-panel-selection")
      .getByRole("button", { name: "Local A", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Centro · mira", exact: true })
      .click();
    await close(page, "Escolher locais");
    await surface.focus();
    await page.keyboard.press("ArrowRight");
    await page
      .getByRole("button", { name: "Confirmar mira como A", exact: true })
      .waitFor();
    await page.waitForFunction(
      () => !document.querySelector(".lg-confirm-center").disabled,
    );
    await page
      .getByRole("button", { name: "Confirmar mira como A", exact: true })
      .click();
    await page.getByRole("button", { name: /^Dados/ }).click();
    assert(
      (
        await page
          .locator('#guide-panel-data [aria-label="Dados do local A"]')
          .innerText()
      ).includes("Sem resultados para estas coordenadas"),
    );
    assert(
      (
        await page
          .locator('#guide-panel-data [aria-label="Dados do local A"]')
          .innerText()
      ).includes("MOON_ME_DE421"),
    );
    await close(page, "Dados dos locais");
    await page
      .getByRole("button", { name: "Seleção A/B", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Restaurar os dois locais calculados",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Cursor · clique", exact: true })
      .click();
    await close(page, "Escolher locais");
    check(
      size +
        ": center selection uses actual terrain intersection in MOON_ME without inheriting IAU science",
    );
    let time = await openTime(page);
    await time.getByLabel("Conjunto de amostras").selectOption("hourly");
    assert((await time.innerText()).includes("721 amostras no período"));
    const range = time.getByRole("slider");
    assert.equal(await range.getAttribute("max"), "720");
    await range.focus();
    await page.keyboard.press("End");
    assert.equal(
      await time.getByLabel("Instante selecionado (UTC)").inputValue(),
      "2026-12-15T00:00",
    );
    await time
      .getByLabel("Instante selecionado (UTC)")
      .fill("2026-12-15T01:00");
    assert((await time.innerText()).includes("Sem amostra neste instante"));
    await time
      .getByRole("button", {
        name: "Usar primeira amostra disponível",
        exact: true,
      })
      .click();
    assert.equal(
      await time.getByLabel("Instante selecionado (UTC)").inputValue(),
      "2026-11-15T00:00",
    );
    await shot(page, size + "-time");
    await close(page, "Tempo da missão");
    await page.waitForFunction(
      () =>
        document.querySelector(".lg-surface-terrain").dataset.renderedUtc ===
        "2026-11-15T00:00:00.000Z",
    );
    if (size === "desktop") {
      const clip = { x: 400, y: 300, width: 800, height: 400 };
      await pause(page);
      await page.screenshot({ path: path.join(output, "shadow-on.png"), clip });
      await page
        .getByRole("checkbox", { name: "Sombras do Sol", exact: true })
        .uncheck();
      await pause(page);
      await page.screenshot({
        path: path.join(output, "shadow-off.png"),
        clip,
      });
      await page
        .getByRole("checkbox", { name: "Sombras do Sol", exact: true })
        .check();
      await pause(page);
      await page.screenshot({ path: path.join(output, "time-00.png"), clip });
      const clock = await openTime(page);
      await clock
        .getByLabel("Instante selecionado (UTC)")
        .fill("2026-11-15T20:00");
      await close(page, "Tempo da missão");
      await pause(page);
      await page.waitForFunction(
        () =>
          document.querySelector(".lg-surface-terrain").dataset.renderedUtc ===
          "2026-11-15T20:00:00.000Z",
      );
      assert.equal(
        await surface.getAttribute("data-solar-utc"),
        "2026-11-15T20:00:00.000Z",
      );
      await page.screenshot({ path: path.join(output, "time-20.png"), clip });
      const reset = await openTime(page);
      await reset
        .getByLabel("Instante selecionado (UTC)")
        .fill("2026-11-15T00:00");
      await close(page, "Tempo da missão");
      check(
        "desktop: shadow toggle and exact hourly Sun frames produce exported GPU comparison captures",
      );
    }
    await page.getByRole("button", { name: "Gráficos", exact: true }).click();
    const charts = page.locator("#guide-panel-charts");
    await charts.getByRole("button", { name: "Sol", exact: true }).click();
    await charts
      .getByText("Consultar amostras em tabela", { exact: true })
      .click();
    assert.equal(await charts.locator("tbody tr").count(), 721);
    await shot(page, size + "-chart");
    if (width <= 700) await close(page, "Gráficos");
    await openTime(page);
    const count = await page.locator(".lg-panel").count();
    assert.equal(count, width <= 700 ? 1 : 2);
    if (width > 700) {
      const a = await charts.boundingBox(),
        b = await page.locator("#guide-panel-time").boundingBox();
      assert.equal(overlap(a, b), 0);
    }
    await close(page, "Tempo da missão");
    if (width > 700) await close(page, "Gráficos");
    check(
      size +
        ": 721 timestamps/720 intervals, exact endpoint, no neighbor fallback, full chart table, panels fit",
    );
    await page
      .getByRole("button", {
        name: "Como explorar e limites do modelo",
        exact: true,
      })
      .click();
    assert.equal(await page.locator(".lg-explorer").getAttribute("inert"), "");
    await page.keyboard.press("Escape");
    assert.equal(
      await page.locator(".lg-explorer").getAttribute("inert"),
      null,
    );
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      bodyWidth: document.body.scrollWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    assert(layout.bodyWidth <= width && layout.documentWidth <= width);
    report.layouts.push({ size, ...layout, dock });
    assert.deepEqual(errors, []);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(external, []);
    check(
      size +
        ": modal background inert, reduced motion, no page/console errors, no external runtime requests, no overflow",
    );
    await page.close();
  }
  report.status = "PASS";
} catch (error) {
  report.status = "FAIL";
  report.failure = error.stack;
  throw error;
} finally {
  await fs.writeFile(
    path.join(output, "browser-results.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
  console.log(
    `${report.status}: ${report.checks.length} scenario groups; evidence ${output}`,
  );
}
