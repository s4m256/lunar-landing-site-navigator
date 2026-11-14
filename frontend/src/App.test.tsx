import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlanningApp } from "./LegacyApp";
import { parseScienceStatus } from "./contract";
import example from "../../contracts/examples/science-status.json";

afterEach(cleanup);

describe("mission planner", () => {
  it("renders the application and clearly labels the scientific placeholder", () => {
    render(<PlanningApp />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Lunar Landing Site Navigator",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Ainda não implementado",
    );
    expect(screen.getByText(/Nenhum cálculo ou dado científico/)).toBeVisible();
  });
  function addSite(name = "Local A", latitude = "-80", longitude = "30") {
    fireEvent.change(screen.getByLabelText("Nome do local"), {
      target: { value: name },
    });
    fireEvent.change(screen.getByLabelText("Latitude (°)"), {
      target: { value: latitude },
    });
    fireEvent.change(screen.getByLabelText("Longitude (°)"), {
      target: { value: longitude },
    });
    fireEvent.click(screen.getByRole("button", { name: "+ Adicionar local" }));
  }
  it("adds, selects and removes user locations across the map and comparison", () => {
    render(<PlanningApp />);
    addSite();
    addSite("Local B", "10", "-180");
    expect(screen.getByText("2 selecionados")).toBeVisible();
    expect(
      screen.getByText("Locais prontos para uma futura comparação"),
    ).toBeVisible();
    const map = screen.getByRole("img", { name: /Mapa lunar/ });
    expect(map.querySelectorAll("circle")).toHaveLength(4);
    expect(map.querySelector("circle")).toHaveAttribute("cx", "420");
    expect(map.querySelector("circle")).toHaveAttribute("cy", "340");
    fireEvent.click(
      screen.getByRole("button", { name: "Local A · -80°, 30°" }),
    );
    expect(screen.getByText("1 selecionados")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: /Local A/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: /Local A/ }));
    expect(screen.getByText("2 selecionados")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Remover Local A" }));
    expect(
      screen.queryByRole("checkbox", { name: /Local A/ }),
    ).not.toBeInTheDocument();
    expect(map.querySelectorAll("circle")).toHaveLength(2);
    expect(
      screen.getByLabelText("Locais em comparação").textContent,
    ).not.toContain("Local A");
  });
  it("rejects missing names, missing coordinates and out of range coordinates", () => {
    render(<PlanningApp />);
    addSite("");
    expect(screen.getByRole("alert")).toHaveTextContent("Informe um nome");
    addSite("A", "", "");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Informe latitude e longitude",
    );
    addSite("A", "91", "0");
    expect(screen.getByRole("alert")).toHaveTextContent("latitude");
    addSite("A", "0", "-181");
    expect(screen.getByRole("alert")).toHaveTextContent("longitude");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    addSite("A", "0", "0");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeChecked();
  });
  it("validates the planning interval without claiming computed conditions", () => {
    render(<PlanningApp />);
    fireEvent.change(screen.getByLabelText("Data inicial"), {
      target: { value: "2026-12-10" },
    });
    fireEvent.change(screen.getByLabelText("Data final"), {
      target: { value: "2026-12-09" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("A data final");
    expect(screen.getByLabelText("Data final")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    fireEvent.change(screen.getByLabelText("Data final"), {
      target: { value: "2026-12-10" },
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Data final")).toHaveAttribute(
      "min",
      "2026-12-10",
    );
  });
  it("switches comparison formats while keeping the unavailable-data state", () => {
    render(<PlanningApp />);
    fireEvent.click(screen.getByRole("button", { name: "Linhas" }));
    expect(screen.getByRole("button", { name: "Linhas" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("Linhas · aguardando dados")).toBeVisible();
    expect(
      screen.getByText(/Nenhum gráfico científico foi gerado/),
    ).toBeVisible();
  });
  it("accepts the shared fixture", () => {
    expect(parseScienceStatus(example)).toEqual(example);
  });
  it.each([
    { ...example, schema_version: "2.0.0" },
    { ...example, status: "completed" },
    { ...example, message: "" },
    { ...example, score: 1 },
    {},
  ])("rejects incompatible payloads: %j", (payload) => {
    expect(() => parseScienceStatus(payload)).toThrow(/contrato/);
  });
});
