import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TypewriterText } from "./TypewriterText";

let motion: MediaQueryList;
let motionListeners: Set<() => void>;

function changeMotion(matches: boolean) {
  Object.defineProperty(motion, "matches", {
    configurable: true,
    value: matches,
  });
  act(() => motionListeners.forEach((listener) => listener()));
}

function visualText(container: HTMLElement) {
  return container.querySelector('[aria-hidden="true"]')?.lastElementChild;
}

beforeEach(() => {
  vi.useFakeTimers();
  motionListeners = new Set();
  motion = {
    matches: false,
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: vi.fn((_event, listener: () => void) =>
      motionListeners.add(listener),
    ),
    removeEventListener: vi.fn((_event, listener: () => void) =>
      motionListeners.delete(listener),
    ),
  } as unknown as MediaQueryList;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => motion),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("TypewriterText", () => {
  it("reveals Unicode code points at the default interval with a single full accessible copy", () => {
    const text = "A🌖é";
    const { container } = render(
      <TypewriterText text={text} className="dialogue" />,
    );
    expect(container.firstChild).toHaveClass("dialogue");
    expect(visualText(container)?.textContent).toBe("");
    const accessibleCopy = container.querySelector(
      "div > span:not([aria-hidden])",
    );
    expect(accessibleCopy).toHaveTextContent(text);
    expect(container.querySelector("[aria-live]")).toBeNull();
    act(() => vi.advanceTimersByTime(29));
    expect(visualText(container)?.textContent).toBe("");
    act(() => vi.advanceTimersByTime(1));
    expect(visualText(container)).toHaveTextContent("A");
    act(() => vi.advanceTimersByTime(30));
    expect(visualText(container)).toHaveTextContent("A🌖");
    expect(accessibleCopy).toHaveTextContent(text);
    act(() => vi.advanceTimersByTime(30));
    expect(visualText(container)).toHaveTextContent(text);
    expect(
      screen.getByRole("button", { name: "Mostrar texto inteiro" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      container.querySelectorAll("div > span:not([aria-hidden])"),
    ).toHaveLength(1);
  });

  it("allows skipping immediately without removing the focused control", () => {
    const cancel = vi.spyOn(window, "clearInterval");
    const schedule = vi.spyOn(window, "setInterval");
    const { container } = render(
      <TypewriterText text="Texto completo." intervalMs={100} />,
    );
    const timer = schedule.mock.results[0].value;
    const skip = screen.getByRole("button", { name: "Mostrar texto inteiro" });
    skip.focus();
    fireEvent.click(skip);
    expect(visualText(container)).toHaveTextContent("Texto completo.");
    expect(skip).toHaveAttribute("aria-disabled", "true");
    expect(skip).toHaveFocus();
    expect(cancel).toHaveBeenCalledWith(timer);
    act(() => vi.advanceTimersByTime(1000));
    expect(visualText(container)).toHaveTextContent("Texto completo.");
  });

  it("cancels an earlier utterance and starts the new text at its own interval", () => {
    const cancel = vi.spyOn(window, "clearInterval");
    const schedule = vi.spyOn(window, "setInterval");
    const { container, rerender } = render(
      <TypewriterText text="Antigo" intervalMs={100} />,
    );
    const oldTimer = schedule.mock.results[0].value;
    act(() => vi.advanceTimersByTime(100));
    expect(visualText(container)).toHaveTextContent("A");
    rerender(<TypewriterText text="Novo" intervalMs={40} />);
    expect(cancel).toHaveBeenCalledWith(oldTimer);
    expect(container).not.toHaveTextContent("Antigo");
    expect(visualText(container)?.textContent).toBe("");
    act(() => vi.advanceTimersByTime(39));
    expect(visualText(container)?.textContent).toBe("");
    act(() => vi.advanceTimersByTime(1));
    expect(visualText(container)).toHaveTextContent("N");
    act(() => vi.advanceTimersByTime(120));
    expect(visualText(container)).toHaveTextContent("Novo");
  });

  it("shows full text immediately when reduced motion is already enabled", () => {
    changeMotion(true);
    const schedule = vi.spyOn(window, "setInterval");
    const { container, rerender } = render(
      <TypewriterText text="Sem animação." />,
    );
    expect(visualText(container)).toHaveTextContent("Sem animação.");
    expect(schedule).not.toHaveBeenCalled();
    rerender(<TypewriterText text="Outra fala." />);
    expect(visualText(container)).toHaveTextContent("Outra fala.");
    expect(
      screen.getByRole("button", { name: "Mostrar texto inteiro" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("observes preference changes, cancels animation and keeps the completed text", () => {
    const cancel = vi.spyOn(window, "clearInterval");
    const schedule = vi.spyOn(window, "setInterval");
    const { container } = render(<TypewriterText text="Uma fala longa." />);
    const timer = schedule.mock.results[0].value;
    act(() => vi.advanceTimersByTime(30));
    expect(visualText(container)).toHaveTextContent("U");
    changeMotion(true);
    expect(visualText(container)).toHaveTextContent("Uma fala longa.");
    expect(cancel).toHaveBeenCalledWith(timer);
    changeMotion(false);
    expect(visualText(container)).toHaveTextContent("Uma fala longa.");
  });

  it("releases its own timer and preference listener on unmount", () => {
    const cancel = vi.spyOn(window, "clearInterval");
    const schedule = vi.spyOn(window, "setInterval");
    const view = render(<TypewriterText text="Ainda digitando." />);
    const timer = schedule.mock.results[0].value;
    expect(motionListeners.size).toBe(1);
    view.unmount();
    expect(cancel).toHaveBeenCalledWith(timer);
    expect(motionListeners.size).toBe(0);
  });

  it("handles empty text without starting a timer", () => {
    const schedule = vi.spyOn(window, "setInterval");
    const { container } = render(<TypewriterText text="" />);
    expect(visualText(container)?.textContent).toBe("");
    expect(
      screen.getByRole("button", { name: "Mostrar texto inteiro" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(schedule).not.toHaveBeenCalled();
  });
});
