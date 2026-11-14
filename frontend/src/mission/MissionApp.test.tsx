import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MissionSite } from "./types";

const dataControl = vi.hoisted(() => ({ mode: "valid", lookup: vi.fn() }));

vi.mock("./mission-data", () => {
  const sites = ["a", "b", "c", "d"].map((name, index) => ({
    id: `mission-${name}`,
    label: `Local ${name.toUpperCase()}`,
    latitudeDeg: -85,
    longitudeDeg: index * 90,
  }));
  return {
    MISSION_SITES: sites,
    DEFAULT_MISSION_DATE: "2026-03-24",
    MISSION_DATES: [
      { value: "2026-03-24", label: "24 de março de 2026 — 00h UTC" },
      { value: "2026-04-28", label: "28 de abril de 2026 — 00h UTC" },
    ],
    MISSION_PROVENANCE: {
      summary: "Dados SPICE",
      model: "DE421",
      source: "Auditoria de teste",
      limitation: "Horizonte idealizado",
    },
    MISSION_AUDIT: { manifest: { model: "DE421" }, results: [] },
    getMissionAnalysis(id: string, date: string) {
      dataControl.lookup(id, date);
      if (dataControl.mode === "throw") throw new Error("Invalid fixture");
      if (dataControl.mode === "missing") return undefined;
      const good =
        date === "2026-03-24"
          ? id === "mission-b" || id === "mission-c"
          : id === "mission-a";
      const elevation =
        dataControl.mode === "invalid" ? Number.NaN : good ? 5 : -3;
      return {
        site: sites.find((site) => site.id === id),
        utc: `${date}T00:00:00Z`,
        sun: {
          azimuthDeg: 90,
          elevationDeg: elevation,
          state: good ? "above" : "below",
        },
        earth: { azimuthDeg: 20, elevationDeg: 2, state: "above" },
        // The UI must enforce the angle criterion even if this flag is wrong.
        meetsGoal: true,
      };
    },
  };
});

vi.mock("./MissionArt", () => ({
  GuidePortrait: () => <div aria-label="Guia ilustrada" />,
  RocketIllustration: ({ phase }: { phase: string }) => (
    <div data-testid="rocket" data-phase={phase} />
  ),
  PolarMissionMap: ({
    sites,
    selectedSiteId,
    onSelect,
    onDiscover,
  }: {
    sites: MissionSite[];
    selectedSiteId?: string;
    onSelect: (id: string) => void;
    onDiscover: () => void;
  }) => (
    <div>
      {sites.map((site) => (
        <button
          key={site.id}
          aria-pressed={selectedSiteId === site.id}
          onClick={() => onSelect(site.id)}
        >
          {site.label}
        </button>
      ))}
      <button onClick={onDiscover}>Descobrir bônus</button>
    </div>
  ),
}));

vi.mock("./HorizonDiagram", () => ({
  HorizonDiagram: ({
    target,
    analysis,
  }: {
    target: string;
    analysis: { site: MissionSite };
  }) => (
    <div data-testid="horizon">
      {analysis.site.id} / {target}
    </div>
  ),
}));

import { MissionApp } from "./MissionApp";

function directMap() {
  render(<MissionApp />);
  fireEvent.click(screen.getByRole("button", { name: "Ir direto ao mapa" }));
}

function selectSite(label = "Local B") {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

beforeEach(() => {
  dataControl.mode = "valid";
  dataControl.lookup.mockClear();
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: 1024,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(() => "blob:mission-audit"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("guided lunar mission", () => {
  it("explains the robotic mission and opens the map directly with no preselected result", () => {
    render(<MissionApp />);
    expect(screen.getByText(/Sou uma astronauta fictícia/)).toHaveTextContent(
      /CLPS/,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ir direto ao mapa" }));
    expect(
      screen.getByRole("heading", { name: "Onde vamos pousar?" }),
    ).toHaveFocus();
    expect(screen.getByText("Sua descoberta começa no mapa.")).toBeVisible();
    expect(screen.queryByTestId("horizon")).not.toBeInTheDocument();
    expect(dataControl.lookup).not.toHaveBeenCalled();
  });

  it("offers a skippable launch and cleans up its transition timer", () => {
    vi.useFakeTimers();
    const schedule = vi.spyOn(window, "setTimeout");
    const cancel = vi.spyOn(window, "clearTimeout");
    const view = render(<MissionApp />);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar missão" }));
    const transitionIndex = schedule.mock.calls.findIndex(
      ([, delay]) => delay === 1600,
    );
    expect(transitionIndex).toBeGreaterThanOrEqual(0);
    const transitionTimer = schedule.mock.results[transitionIndex].value;
    expect(screen.getByTestId("rocket")).toHaveAttribute(
      "data-phase",
      "launch",
    );
    fireEvent.click(screen.getByRole("button", { name: "Pular decolagem" }));
    expect(
      screen.getByRole("heading", { name: "Onde vamos pousar?" }),
    ).toHaveFocus();
    expect(cancel).toHaveBeenCalledWith(transitionTimer);
    view.unmount();
  });

  it("advances a short launch automatically", () => {
    vi.useFakeTimers();
    render(<MissionApp />);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar missão" }));
    act(() => vi.advanceTimersByTime(1600));
    expect(
      screen.getByRole("heading", { name: "Onde vamos pousar?" }),
    ).toHaveFocus();
  });

  it("explains an unsuitable choice and allows another point without replaying the briefing", () => {
    directMap();
    selectSite("Local A");
    expect(screen.getByRole("status")).toHaveTextContent(
      "O Sol está no horizonte ou abaixo dele",
    );
    expect(
      screen.getByRole("button", { name: "Pousar neste local" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Escolher outro ponto" }),
    );
    expect(
      screen.getByRole("heading", { name: "Explore os locais" }),
    ).toHaveFocus();
    selectSite();
    expect(
      screen.getByRole("button", { name: "Pousar neste local" }),
    ).toBeEnabled();
    expect(screen.getByText("2 de 4 explorados")).toBeVisible();
  });

  it("recalculates on date changes and switches which target the diagram explains", () => {
    directMap();
    selectSite();
    fireEvent.click(screen.getByRole("button", { name: /^Terra/ }));
    expect(screen.getByRole("button", { name: /^Terra/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("horizon")).toHaveTextContent(
      "mission-b / earth",
    );
    fireEvent.change(screen.getByLabelText(/Data da observação/), {
      target: { value: "2026-04-28" },
    });
    expect(dataControl.lookup).toHaveBeenLastCalledWith(
      "mission-b",
      "2026-04-28",
    );
    expect(screen.getByRole("button", { name: /^Sol/ })).toHaveTextContent(
      "-3,0°",
    );
    expect(
      screen.getByRole("button", { name: "Pousar neste local" }),
    ).toBeDisabled();
    selectSite("Local A");
    expect(
      screen.getByRole("button", { name: "Pousar neste local" }),
    ).toBeEnabled();
  });

  it("lets mobile explorers return to the map while preserving date, target, and chosen point", () => {
    window.innerWidth = 390;
    directMap();
    fireEvent.change(screen.getByLabelText(/Data da observação/), {
      target: { value: "2026-04-28" },
    });
    const point = screen.getByRole("button", { name: "Local A" });
    point.focus();
    fireEvent.click(point);
    expect(point).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: /^Terra/ }));
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao mapa" }));
    expect(
      screen.getByRole("heading", { name: "Explore os locais" }),
    ).toHaveFocus();
    expect(point).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/Data da observação/)).toHaveValue(
      "2026-04-28",
    );
    expect(screen.getByRole("button", { name: /^Terra/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Pousar neste local" }),
    ).toBeEnabled();
    selectSite("Local B");
    expect(
      screen.getByRole("button", { name: "Pousar neste local" }),
    ).toBeDisabled();
    expect(screen.getByTestId("horizon")).toHaveTextContent(
      "mission-b / earth",
    );
    expect(screen.getByLabelText(/Data da observação/)).toHaveValue(
      "2026-04-28",
    );
  });

  it("finishes either suitable choice, skips landing, and keeps exploration available", () => {
    directMap();
    selectSite("Local C");
    fireEvent.click(screen.getByRole("button", { name: "Pousar neste local" }));
    expect(screen.getByTestId("rocket")).toHaveAttribute(
      "data-phase",
      "landing",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Pular pouso e ver resumo" }),
    );
    expect(
      screen.getByRole("heading", { name: "Escolha registrada." }),
    ).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Local C" })).toBeVisible();
    expect(
      screen.getByText(/Pouso ilustrativo em um local hipotético/),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Explorar outra opção" }),
    );
    expect(screen.getByRole("button", { name: "Local C" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    selectSite("Local B");
    expect(
      screen.getByRole("button", { name: "Pousar neste local" }),
    ).toBeEnabled();
  });

  it("respects reduced motion for both launch and landing", () => {
    window.matchMedia = vi
      .fn()
      .mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });
    render(<MissionApp />);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar missão" }));
    expect(
      screen.getByRole("heading", { name: "Onde vamos pousar?" }),
    ).toHaveFocus();
    expect(screen.queryByText("Pular decolagem")).not.toBeInTheDocument();
    selectSite();
    fireEvent.click(screen.getByRole("button", { name: "Pousar neste local" }));
    expect(
      screen.getByRole("heading", { name: "Escolha registrada." }),
    ).toHaveFocus();
  });

  it("opens the optional bonus without selecting a point or blocking the mission", () => {
    directMap();
    const bonus = screen.getByRole("button", { name: "Descobrir bônus" });
    bonus.focus();
    fireEvent.click(bonus);
    const dialog = screen.getByRole("dialog", {
      name: "Na Lua, o silêncio é diferente.",
    });
    expect(dialog).toHaveTextContent(/O som precisa de um meio/);
    const close = within(dialog).getByRole("button", { name: "Fechar janela" });
    const back = within(dialog).getByRole("button", {
      name: "Voltar à exploração",
    });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(back).toHaveFocus();
    fireEvent.keyDown(back, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(bonus).toHaveFocus();
    selectSite();
    expect(
      screen.getByRole("button", { name: "Pousar neste local" }),
    ).toBeEnabled();
  });

  it("shows provenance in a keyboard-contained dialog and restores focus", () => {
    render(<MissionApp />);
    const about = screen.getByRole("button", { name: "Sobre a missão" });
    about.focus();
    fireEvent.click(about);
    const dialog = screen.getByRole("dialog", { name: "Sobre esta missão" });
    const close = within(dialog).getByRole("button", { name: "Fechar janela" });
    const download = within(dialog).getByRole("link", {
      name: "Baixar dados e auditoria (JSON)",
    });
    expect(dialog).toHaveTextContent("DE421");
    expect(dialog).toHaveTextContent(/não medem obstruções por montanhas/);
    expect(close).toHaveFocus();
    expect(download).toHaveAttribute("href", "blob:mission-audit");
    expect(download).toHaveAttribute("download", "auditoria-missao-lunar.json");
    expect(document.body.style.overflow).toBe("hidden");
    expect(about.closest(".mission-content")).toHaveAttribute("inert");
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(download).toHaveFocus();
    fireEvent.keyDown(download, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(about).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("releases the audit download URL on unmount", () => {
    const view = render(<MissionApp />);
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mission-audit");
  });

  it.each(["missing", "throw", "invalid"])(
    "fails closed for %s data and recovers with a new selection",
    (mode) => {
      directMap();
      dataControl.mode = mode;
      selectSite();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Não foi possível carregar os dados",
      );
      expect(screen.queryByTestId("horizon")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Pousar neste local" }),
      ).not.toBeInTheDocument();
      dataControl.mode = "valid";
      selectSite("Local C");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Pousar neste local" }),
      ).toBeEnabled();
    },
  );
});
