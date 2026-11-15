// Run with Playwright and @axe-core/playwright beside this script, as documented
// in docs/guide-voice.md. Browser API simulations do not prove audible output.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const base = process.env.REVIEW_BASE || "http://127.0.0.1:4188";
const output = process.env.REVIEW_OUTPUT || "/tmp/lunar-guide-review";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_EXECUTABLE || "/usr/lib/chromium/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const report = {
  audibleOutputVerified: false,
  native: {},
  checks: [],
  errors: [],
};
try {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 800 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(String(error)));
  const preview = `${base}/Escolher-astronauta.html`;
  await page.route(/^https?:/, (route) =>
    route.request().url() === preview ? route.continue() : route.abort(),
  );
  await page.goto(preview, { waitUntil: "networkidle" });
  const skip = page.locator(".game-dialogue-next");
  await skip.focus();
  await page.keyboard.press("Enter");
  assert(await skip.evaluate((button) => button === document.activeElement));
  assert.equal(await skip.innerText(), "Continuar");
  assert(
    await page
      .locator(".game-scene-guide")
      .evaluate(
        (image) =>
          image.complete &&
          image.naturalWidth === 539 &&
          image.naturalHeight === 1024,
      ),
  );
  await page.locator(".game-voice > summary").click();
  report.native = await page.evaluate(() => ({
    supported: "speechSynthesis" in window,
    voices:
      window.speechSynthesis?.getVoices().map((voice) => voice.lang) ?? [],
    feedback: document.querySelector(".speech-control__status")?.textContent,
  }));
  if (!report.native.voices.some((lang) => /^pt(?:-|$)/i.test(lang))) {
    assert(await page.getByRole("button", { name: "Ouvir fala" }).isDisabled());
    assert.match(
      report.native.feedback,
      /não está disponível|Nenhuma voz em português/,
    );
  }
  assert.equal(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations.length,
    0,
  );
  await page.locator(".game-voice > summary").click();
  await page.screenshot({ path: `${output}/guia.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.equal(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations.length,
    0,
  );
  report.checks.push(
    "Existing asset embeds without network; keyboard focus survives text completion; native speech availability is honestly reported; desktop/mobile axe checks pass.",
  );
  await context.close();

  const simulated = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 1440, height: 1000 },
  });
  await simulated.addInitScript(() => {
    const state = { utterances: [], cancellations: 0 };
    window.__speechReview = state;
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: class {
        constructor(text) {
          this.text = text;
        }
      },
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        getVoices: () => [
          { lang: "pt-BR", name: "Test voice", localService: true },
        ],
        addEventListener() {},
        removeEventListener() {},
        speak(utterance) {
          state.utterances.push(utterance);
          utterance.onstart?.();
        },
        cancel() {
          state.cancellations += 1;
        },
      },
    });
  });
  const mission = await simulated.newPage();
  mission.on("pageerror", (error) => report.errors.push(String(error)));
  await mission.goto(`${base}/Lunar-Missao.html`, { waitUntil: "networkidle" });
  assert.equal(
    await mission.evaluate(() => window.__speechReview.utterances.length),
    0,
  );
  if (
    !(await mission.locator(".game-voice").getAttribute("open")) &&
    !(await mission.getByRole("button", { name: "Ouvir fala" }).isVisible())
  )
    await mission.locator(".game-voice > summary").click();
  await mission.getByRole("button", { name: "Ouvir fala" }).click();
  assert.equal(
    await mission.locator(".speech-control__status").innerText(),
    "Reproduzindo fala.",
  );
  const spoken = await mission.evaluate(() => {
    const utterance = window.__speechReview.utterances.at(-1);
    return { text: utterance.text, language: utterance.lang };
  });
  assert.match(
    spoken.text,
    /As missões CLPS são robóticas: não levam astronautas/,
  );
  assert.equal(spoken.language, "pt-BR");
  await mission.getByRole("button", { name: "Parar fala" }).click();
  if (
    !(await mission.locator(".game-voice").getAttribute("open")) &&
    !(await mission.getByRole("button", { name: "Ouvir fala" }).isVisible())
  )
    await mission.locator(".game-voice > summary").click();
  await mission.getByRole("button", { name: "Ouvir fala" }).click();
  const beforeModal = await mission.evaluate(
    () => window.__speechReview.cancellations,
  );
  await mission.getByRole("button", { name: "Sobre a missão" }).click();
  assert.equal(
    await mission.evaluate(() => window.__speechReview.cancellations),
    beforeModal + 1,
  );
  assert(await mission.getByRole("link", { name: "CC BY 2.0" }).isVisible());
  await mission.getByRole("button", { name: "Fechar janela" }).click();
  if (
    !(await mission.locator(".game-voice").getAttribute("open")) &&
    !(await mission.getByRole("button", { name: "Ouvir fala" }).isVisible())
  )
    await mission.locator(".game-voice > summary").click();
  await mission.getByRole("button", { name: "Ouvir fala" }).click();
  const beforeMap = await mission.evaluate(
    () => window.__speechReview.cancellations,
  );
  await mission.getByRole("button", { name: "Pular conversa" }).click();
  assert.equal(
    await mission.evaluate(() => window.__speechReview.cancellations),
    beforeMap + 1,
  );
  await mission.getByRole("button", { name: /^Local B,/ }).click();
  await mission.getByRole("button", { name: "Pousar neste local" }).click();
  await mission.getByRole("heading", { name: "Escolha registrada." }).waitFor();
  if (
    !(await mission.locator(".game-voice").getAttribute("open")) &&
    !(await mission.getByRole("button", { name: "Ouvir fala" }).isVisible())
  )
    await mission.locator(".game-voice > summary").click();
  await mission.getByRole("button", { name: "Ouvir fala" }).click();
  assert.match(
    await mission.evaluate(() => window.__speechReview.utterances.at(-1).text),
    /^Boa!/,
  );
  await mission.evaluate(() =>
    window.__speechReview.utterances.at(-1).onerror?.(),
  );
  await mission
    .getByText(
      "Não foi possível reproduzir a fala. Leia o texto acima ou tente novamente.",
      { exact: true },
    )
    .waitFor();
  assert.match(
    await mission.locator(".speech-control__status").innerText(),
    /Não foi possível reproduzir/,
  );
  report.checks.push(
    "Simulated voice: explicit start/stop, complete Portuguese text, modal/navigation cancellation, final dialogue, and error recovery pass. This checks the API integration, not sound.",
  );
  await simulated.close();
  assert.deepEqual(report.errors, []);
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
