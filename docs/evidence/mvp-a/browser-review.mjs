import { chromium } from "./node_modules/playwright/index.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
const datasetBytes = await fs.readFile("docs/audits/pr4/result-2026.json");
const dataset = JSON.parse(datasetBytes);
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_EXECUTABLE || "/usr/lib/chromium/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-crash-reporter",
    "--crash-dumps-dir=/tmp/mvp-a-browser/crashes",
  ],
  timeout: 20000,
});
const report = {
  browser: await browser.version(),
  url: "http://127.0.0.1:4173",
  checks: [],
  errors: [],
  warnings: [],
  resources: [],
  screenshots: [],
};
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    timezoneId: "America/Sao_Paulo",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(String(error)));
  page.on("console", (msg) => {
    if (msg.type() === "error")
      report.errors.push({ text: msg.text(), location: msg.location() });
    if (msg.type() === "warning") report.warnings.push(msg.text());
  });
  page.on("requestfailed", (request) =>
    report.resources.push({ url: request.url(), failure: request.failure() }),
  );
  page.on("response", (response) => {
    if (response.status() >= 400)
      report.resources.push({ url: response.url(), status: response.status() });
  });
  await page.goto(report.url, { waitUntil: "networkidle" });
  await page.getByRole("table").waitFor();
  assert(
    await page
      .getByText("Sem validação independente contra JPL Horizons", {
        exact: false,
      })
      .isVisible(),
  );
  assert(
    await page
      .getByText("Latitude planetocêntrica: -89.5°", { exact: true })
      .isVisible(),
  );
  assert(
    await page
      .getByText("Latitude planetocêntrica: -89°", { exact: true })
      .isVisible(),
  );
  assert(
    await page.getByText("Longitude leste: 0°", { exact: true }).isVisible(),
  );
  assert(
    await page.getByText("Longitude leste: 90°", { exact: true }).isVisible(),
  );
  assert(await page.getByRole("img", { name: /Mapa polar sul/ }).isVisible());
  report.checks.push(
    "Both exact demo sites/coordinates, south polar map and visible scientific/Horizons caveats",
  );
  const chart = page.locator("svg.elevation-chart");
  assert.equal(await chart.locator("polyline").count(), 2);
  assert.equal(await chart.locator("circle").count(), 732);
  assert(
    await chart
      .getByText("Horizonte geométrico 0°", { exact: true })
      .isVisible(),
  );
  assert(await chart.getByText("Elevação (°)", { exact: true }).isVisible());
  assert(await page.getByText("● Local A", { exact: true }).isVisible());
  assert(await page.getByText("◆ Local B", { exact: true }).isVisible());
  assert(
    await page
      .getByText(/As linhas apenas conectam pontos calculados/)
      .isVisible(),
  );
  report.checks.push(
    "Elevation chart has 730 discrete points plus selected points, two guide lines, units, UTC axis, zero horizon and legends",
  );
  for (const date of ["2026-01-01", "2026-06-15", "2026-12-31"]) {
    await page.getByLabel("Data da amostra (UTC)").fill(date);
    for (const target of ["SUN", "EARTH"]) {
      await page
        .getByRole("button", {
          name: target === "SUN" ? "Sol" : "Terra",
          exact: true,
        })
        .click();
      const rows = page.getByRole("table").getByRole("row");
      for (const [i, id] of ["south-a", "south-b"].entries()) {
        const sample = dataset.series
          .find((s) => s.site_id === id && s.target === target)
          .samples.find((s) => s.utc === date + "T00:00:00.000Z");
        const cells = rows.nth(i + 1).getByRole("cell");
        assert.equal(
          await cells.nth(0).innerText(),
          sample.azimuth_deg.toFixed(4) + "°",
        );
        assert.equal(
          await cells.nth(1).innerText(),
          sample.elevation_deg.toFixed(4) + "°",
        );
      }
      assert(
        (await page.getByRole("status").innerText()).includes(
          date + "T00:00:00.000Z",
        ),
      );
    }
  }
  report.checks.push(
    "First/middle/last dates, both SUN/EARTH, both sites match all 24 displayed azimuth/elevation numbers from JSON; UTC preserved in America/Sao_Paulo browser timezone",
  );
  await page.getByLabel("Data da amostra (UTC)").fill("2026-01-01");
  await page.getByRole("button", { name: "Sol", exact: true }).click();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: "/tmp/mvp-a-desktop.png", fullPage: true });
  report.screenshots.push("/tmp/mvp-a-desktop.png");
  await page
    .getByText("Versões, kernels e hashes SHA-256", { exact: true })
    .click();
  for (const kernel of dataset.provenance.kernels)
    assert(await page.getByText(kernel.sha256, { exact: true }).isVisible());
  const link = page.getByRole("link", { name: /Baixar JSON completo/ });
  const artifact = await page.request.get(
    new URL(await link.getAttribute("href"), page.url()).href,
  );
  assert.equal(artifact.status(), 200);
  const artifactBytes = await artifact.body();
  assert.equal(
    crypto.createHash("sha256").update(artifactBytes).digest("hex"),
    crypto.createHash("sha256").update(datasetBytes).digest("hex"),
  );
  report.checks.push(
    "Full provenance expands, kernel hashes visible, downloadable static JSON bytes SHA256-identical to audited source",
  );
  await page.getByLabel("Data da amostra (UTC)").fill("2027-01-01");
  assert((await page.getByRole("status").innerText()).includes("Sem amostra"));
  assert.equal(await page.getByRole("table").count(), 0);
  assert.equal(await chart.locator(".selected-point").count(), 0);
  report.checks.push(
    "Out-of-coverage date shows no-data state and no numeric table/selected chart points",
  );
  await page
    .getByRole("button", { name: "Planejamento livre", exact: true })
    .click();
  assert.equal(await page.getByRole("table").count(), 0);
  await page.getByLabel("Nome do local").fill("Local próprio de teste");
  await page.getByLabel("Latitude (°)").fill("10");
  await page.getByLabel("Longitude (°)").fill("-120");
  await page
    .getByRole("button", { name: "+ Adicionar local", exact: true })
    .click();
  assert(
    await page
      .getByRole("checkbox", { name: /Local próprio de teste/ })
      .isChecked(),
  );
  assert.equal(await page.getByRole("table").count(), 0);
  assert(
    await page
      .getByText(/Este modo não utiliza as séries da demonstração/)
      .isVisible(),
  );
  await page
    .getByRole("button", { name: "Demonstração científica 2026", exact: true })
    .click();
  assert(await page.getByRole("table").isVisible());
  assert.equal(
    await page.getByText("Local próprio de teste", { exact: true }).count(),
    0,
  );
  report.checks.push(
    "Free planning accepts own coordinates without scientific results; returning demo restores only actual demonstration series",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Data da amostra (UTC)").fill("2026-06-15");
  await page.getByRole("button", { name: "Terra", exact: true }).click();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.equal(await page.getByRole("table").getByRole("row").count(), 3);
  const chartMetrics = await chart.evaluate((el) => ({
    width: el.getBoundingClientRect().width,
    textPx:
      parseFloat(getComputedStyle(el.querySelector("text")).fontSize) *
      el.getScreenCTM().a,
  }));
  assert(chartMetrics.textPx >= 10);
  const scroller = page.getByRole("region", {
    name: "Gráfico de elevação com rolagem horizontal",
  });
  assert(await scroller.evaluate((el) => el.scrollWidth > el.clientWidth));
  assert(
    await page
      .getByText(
        "Em telas estreitas, deslize o gráfico para explorar o ano completo.",
        { exact: true },
      )
      .isVisible(),
  );
  await scroller.focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(300);
  assert(await scroller.evaluate((el) => el.scrollLeft > 0));
  await scroller.evaluate((el) => (el.scrollLeft = el.scrollWidth));
  assert(await scroller.evaluate((el) => el.scrollLeft > 300));
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  report.checks.push(
    "Mobile chart labels " +
      chartMetrics.textPx.toFixed(1) +
      "px; focusable scroll region responds to ArrowRight and horizontal scrolling reaches year end; swipe hint visible, body remains within viewport",
  );
  await scroller.evaluate((el) => (el.scrollLeft = 0));
  await page.screenshot({ path: "/tmp/mvp-a-mobile.png", fullPage: true });
  report.screenshots.push("/tmp/mvp-a-mobile.png");
  report.checks.push(
    "390 px mobile viewport: no horizontal document overflow, Earth/date selection and scientific table work",
  );
  await context.close();
  report.pass = report.errors.length === 0 && report.resources.length === 0;
} catch (error) {
  report.pass = false;
  report.failure = String(error.stack || error);
} finally {
  await browser.close();
  await fs.writeFile(
    "/tmp/mvp-a-browser-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.pass ? 0 : 1;
}
