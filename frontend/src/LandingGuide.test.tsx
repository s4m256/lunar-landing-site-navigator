import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LandingGuide } from "./LandingGuide";
import { loadGuideDataset } from "./guide-model";

const initialWidth = window.innerWidth;

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", {
    value: 1280,
    configurable: true,
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 0),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "innerWidth", {
    value: initialWidth,
    configurable: true,
  });
});

function startGuide(props: Parameters<typeof LandingGuide>[0] = {}) {
  render(<LandingGuide {...props} />);
  fireEvent.click(screen.getByRole("button", { name: /^Start$/ }));
}

function openSelection() {
  fireEvent.click(screen.getByRole("button", { name: "Seleção A/B" }));
  return screen.getByRole("region", { name: "Escolher locais" });
}

function openData() {
  fireEvent.click(screen.getByRole("button", { name: /^Dados/ }));
  return screen.getByRole("region", { name: "Dados dos locais" });
}

function openTime() {
  fireEvent.click(screen.getByRole("button", { name: "Tempo" }));
  return screen.getByRole("region", { name: "Tempo da missão" });
}

function siteData(slot: "A" | "B") {
  return screen.getByRole("region", { name: `Dados do local ${slot}` });
}

describe("Landing Guide first-use flow", () => {
  it("starts with a clear landing action, then exposes the Moon while data panels stay closed", () => {
    render(<LandingGuide />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "LandingGuide.",
    );
    expect(screen.getByRole("button", { name: /^Start$/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "How it works" })).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "Dados dos locais" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Start$/ }));
    expect(screen.getByRole("group", { name: /Lua em 3D/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /^Dados/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByLabelText("Resultados disponíveis: A/B")).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "Gráficos" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Tempo da missão" }),
    ).not.toBeInTheDocument();
    openData();
    expect(within(siteData("A")).getByText("+0,55°")).toBeVisible();
    expect(within(siteData("B")).getByText("-0,54°")).toBeVisible();
  });

  it("offers short help with Escape dismissal and focus restored to its trigger", async () => {
    render(<LandingGuide />);
    const helpButton = screen.getByRole("button", { name: "How it works" });
    helpButton.focus();
    fireEvent.click(helpButton);
    const help = screen.getByRole("dialog", {
      name: "How it works · Como funciona",
    });
    expect(
      within(help).getByRole("heading", { name: "Escolha dois lugares" }),
    ).toBeVisible();
    expect(
      within(help).getByRole("heading", { name: "Compare o mesmo instante" }),
    ).toBeVisible();
    expect(
      within(help).getByRole("heading", { name: "Mude a amostra" }),
    ).toBeVisible();
    expect(within(help).getByRole("heading", { level: 2 })).toHaveFocus();
    fireEvent.keyDown(help, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(helpButton).toHaveFocus());
  });
});

describe("shared view and scientific identity", () => {
  it("preserves selected sites, target, hourly dataset, mission period and exact UTC through 2D/3D", () => {
    startGuide();
    let selection = openSelection();
    fireEvent.click(
      within(selection).getByRole("button", {
        name: /^Usar −89° · 90° E em A/,
      }),
    );
    let data = openData();
    fireEvent.click(within(data).getByRole("button", { name: "Terra" }));
    let time = openTime();
    fireEvent.change(within(time).getByLabelText("Conjunto de amostras"), {
      target: { value: "hourly" },
    });
    fireEvent.change(within(time).getByLabelText("Início da missão (UTC)"), {
      target: { value: "2026-11-16" },
    });
    fireEvent.change(within(time).getByLabelText("Duração (dias)"), {
      target: { value: "2" },
    });
    fireEvent.change(
      within(time).getByLabelText("Instante selecionado (UTC)"),
      { target: { value: "2026-11-16T06:00" } },
    );
    const views = screen.getByRole("group", { name: "Visualização lunar" });
    fireEvent.click(within(views).getByRole("button", { name: "2D" }));
    expect(screen.getByRole("group", { name: /Lua em 2D/ })).toBeVisible();
    fireEvent.click(within(views).getByRole("button", { name: "3D" }));
    expect(screen.getByRole("group", { name: /Lua em 3D/ })).toBeVisible();
    time = screen.getByRole("region", { name: "Tempo da missão" });
    expect(within(time).getByLabelText("Conjunto de amostras")).toHaveValue(
      "hourly",
    );
    expect(within(time).getByLabelText("Início da missão (UTC)")).toHaveValue(
      "2026-11-16",
    );
    expect(within(time).getByLabelText("Duração (dias)")).toHaveValue(2);
    expect(
      within(time).getByLabelText("Instante selecionado (UTC)"),
    ).toHaveValue("2026-11-16T06:00");
    data = openData();
    expect(within(data).getByRole("button", { name: "Terra" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      within(siteData("A")).getByText("Local calculado: south-b"),
    ).toBeVisible();
    expect(
      within(siteData("B")).getByText("Local calculado: south-b"),
    ).toBeVisible();
  });

  it("substitutes visual slot A with south-b data instead of retaining the old south-a series", () => {
    startGuide();
    const selection = openSelection();
    fireEvent.click(
      within(selection).getByRole("button", {
        name: /^Usar −89° · 90° E em A/,
      }),
    );
    openData();
    expect(within(siteData("A")).getByText("-0,54°")).toBeVisible();
    expect(within(siteData("A")).queryByText("+0,55°")).not.toBeInTheDocument();
    expect(
      within(siteData("A")).getByText("Local calculado: south-b"),
    ).toBeVisible();
  });

  it("does not grant science to manually entered coordinates even when they match a demo site", () => {
    startGuide();
    const selection = openSelection();
    fireEvent.click(within(selection).getByText("Informar coordenadas"));
    fireEvent.change(
      within(selection).getByLabelText("Latitude planetocêntrica (°)"),
      { target: { value: "-89.5" } },
    );
    fireEvent.change(within(selection).getByLabelText("Longitude leste (°)"), {
      target: { value: "0" },
    });
    fireEvent.click(
      within(selection).getByRole("button", {
        name: "Selecionar coordenadas como A",
      }),
    );
    expect(screen.getByLabelText("Resultados disponíveis: B")).toBeVisible();
    openData();
    expect(
      within(siteData("A")).getByText(/Sem resultados para estas coordenadas/),
    ).toBeVisible();
    expect(within(siteData("A")).queryByText("+0,55°")).not.toBeInTheDocument();
    expect(within(siteData("B")).getByText("-0,54°")).toBeVisible();
  });

  it("removes a slot without removing the other site, then restores the calculated pair explicitly", () => {
    startGuide();
    let selection = openSelection();
    fireEvent.click(
      within(selection).getByRole("button", { name: "Remover A" }),
    );
    openData();
    expect(
      within(siteData("A")).getByText("Selecione um lugar para A."),
    ).toBeVisible();
    expect(within(siteData("B")).getByText("-0,54°")).toBeVisible();
    selection = openSelection();
    fireEvent.click(
      within(selection).getByRole("button", {
        name: "Restaurar os dois locais calculados",
      }),
    );
    openData();
    expect(within(siteData("A")).getByText("+0,55°")).toBeVisible();
    expect(within(siteData("B")).getByText("-0,54°")).toBeVisible();
  });

  it("requires an explicit confirmation in center mode and labels its free selection as uncovered", () => {
    startGuide();
    const selection = openSelection();
    fireEvent.click(
      within(selection).getByRole("button", { name: "Centro · mira" }),
    );
    expect(screen.getByLabelText("Resultados disponíveis: A/B")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar mira como A" }),
    );
    openData();
    expect(
      within(siteData("A")).getByText(/Sem resultados para estas coordenadas/),
    ).toBeVisible();
    expect(within(siteData("B")).getByText("-0,54°")).toBeVisible();
  });
});

describe("exact sample timeline and errors", () => {
  it("exposes 721 hourly timestamps over 720 steps and includes only the last midnight", () => {
    startGuide();
    const time = openTime();
    fireEvent.change(within(time).getByLabelText("Conjunto de amostras"), {
      target: { value: "hourly" },
    });
    expect(
      within(time).getByText("721 amostras no período · passo de 1 hora."),
    ).toBeVisible();
    const timeline = within(time).getByRole("slider", {
      name: /Linha do tempo/,
    });
    expect(timeline).toHaveAttribute("max", "720");
    fireEvent.change(timeline, { target: { value: "720" } });
    expect(
      within(time).getByLabelText("Instante selecionado (UTC)"),
    ).toHaveValue("2026-12-15T00:00");
    expect(
      within(time).getByRole("button", { name: "Próxima amostra" }),
    ).toBeDisabled();
    fireEvent.click(
      within(time).getByRole("button", { name: "Amostra anterior" }),
    );
    expect(
      within(time).getByLabelText("Instante selecionado (UTC)"),
    ).toHaveValue("2026-12-14T23:00");
    fireEvent.click(
      within(time).getByRole("button", { name: "Próxima amostra" }),
    );
    expect(
      within(time).getByLabelText("Instante selecionado (UTC)"),
    ).toHaveValue("2026-12-15T00:00");
  });

  it("shows absence for an uncomputed daily hour and removes the previous numeric comparison", () => {
    startGuide();
    const time = openTime();
    fireEvent.change(
      within(time).getByLabelText("Instante selecionado (UTC)"),
      { target: { value: "2026-09-01T12:00" } },
    );
    expect(within(time).getByText(/Sem amostra neste instante/)).toBeVisible();
    expect(
      within(time).getByRole("button", { name: "Reproduzir amostras" }),
    ).toBeDisabled();
    openData();
    expect(
      within(siteData("A")).getByText(
        "Sem amostra para estas coordenadas e este instante.",
      ),
    ).toBeVisible();
    expect(
      within(siteData("B")).getByText(
        "Sem amostra para estas coordenadas e este instante.",
      ),
    ).toBeVisible();
    expect(within(siteData("A")).queryByText("+0,55°")).not.toBeInTheDocument();
    const restoredTime = openTime();
    fireEvent.click(within(restoredTime).getByRole("button", {name:"Usar primeira amostra disponível"}));
    expect(within(restoredTime).getByLabelText("Instante selecionado (UTC)")).toHaveValue("2026-09-01T00:00");
  });

  it("fails closed when the supplied scientific dataset cannot be validated", () => {
    startGuide({ daily: loadGuideDataset("daily", "{}") });
    expect(
      screen.queryByLabelText("Resultados disponíveis: A/B"),
    ).not.toBeInTheDocument();
    const data = openData();
    expect(within(data).getByRole("alert")).toHaveTextContent(
      "Dados científicos indisponíveis",
    );
    expect(
      within(data).getByText("Nenhum número substituto será apresentado."),
    ).toBeVisible();
    expect(within(data).queryByText("+0,55°")).not.toBeInTheDocument();
    expect(within(data).queryByText("-0,54°")).not.toBeInTheDocument();
  });

  it("does not show an existing annual sample outside the selected mission period", () => {
    startGuide();
    const time = openTime();
    fireEvent.change(
      within(time).getByLabelText("Instante selecionado (UTC)"),
      { target: { value: "2026-01-01T00:00" } },
    );
    expect(
      screen.queryByLabelText("Resultados disponíveis: A/B"),
    ).not.toBeInTheDocument();
    const data = openData();
    expect(
      within(data).getByText(/Sem amostra neste instante dentro do período/),
    ).toBeVisible();
    expect(within(siteData("A")).queryByText("+1,77°")).not.toBeInTheDocument();
    expect(within(siteData("B")).queryByText("+1,88°")).not.toBeInTheDocument();
  });

  it("keeps the desktop help modal behavior consistent with its declared semantics", () => {
    startGuide();
    fireEvent.click(
      screen.getByRole("button", { name: "Como explorar e limites do modelo" }),
    );
    expect(
      screen.getByRole("dialog", { name: "How it works · Como funciona" }),
    ).toHaveAttribute("aria-modal", "true");
    expect(document.querySelector(".lg-explorer")).toHaveAttribute("inert");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(document.querySelector(".lg-explorer")).not.toHaveAttribute("inert");
  });

  it("reproduces real timestamps in discrete steps, pauses, and stops at the mission endpoint", () => {
    vi.useFakeTimers();
    startGuide();
    const time = openTime();
    const instant = within(time).getByLabelText("Instante selecionado (UTC)");
    fireEvent.click(
      within(time).getByRole("button", { name: "Reproduzir amostras" }),
    );
    act(() => vi.advanceTimersByTime(1199));
    expect(instant).toHaveValue("2026-09-01T00:00");
    act(() => vi.advanceTimersByTime(1));
    expect(instant).toHaveValue("2026-09-02T00:00");
    fireEvent.click(
      within(time).getByRole("button", { name: "Pausar reprodução" }),
    );
    act(() => vi.advanceTimersByTime(5000));
    expect(instant).toHaveValue("2026-09-02T00:00");
    fireEvent.change(instant, { target: { value: "2026-09-30T00:00" } });
    fireEvent.click(
      within(time).getByRole("button", { name: "Reproduzir amostras" }),
    );
    act(() => vi.advanceTimersByTime(1200));
    expect(instant).toHaveValue("2026-10-01T00:00");
    expect(
      within(time).getByRole("button", { name: "Reproduzir amostras" }),
    ).toBeDisabled();
    act(() => vi.advanceTimersByTime(5000));
    expect(instant).toHaveValue("2026-10-01T00:00");
  });
});
