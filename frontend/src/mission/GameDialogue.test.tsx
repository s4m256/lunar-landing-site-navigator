import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameDialogue } from "./GameDialogue";

let motion: MediaQueryList;
let listeners: Set<() => void>;

beforeEach(() => {
  vi.useFakeTimers();
  listeners = new Set();
  motion = {
    matches: false,
    addEventListener: vi.fn((_event, listener: () => void) =>
      listeners.add(listener),
    ),
    removeEventListener: vi.fn((_event, listener: () => void) =>
      listeners.delete(listener),
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

function visualText(container: HTMLElement) {
  return container.querySelector('.game-dialogue-text [aria-hidden="true"]')
    ?.lastElementChild;
}

describe("GameDialogue", () => {
  it("types Unicode characters while exposing the full accessible line, then advances", () => {
    const next = vi.fn();
    const { container } = render(<GameDialogue text="A🌖!" onNext={next} />);
    expect(
      screen.getByRole("group", { name: "Fala de Lua" }),
    ).toHaveTextContent("A🌖!");
    expect(visualText(container)?.textContent).toBe("");
    act(() => vi.advanceTimersByTime(60));
    expect(visualText(container)?.textContent).toBe("A🌖");
    act(() => vi.advanceTimersByTime(30));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(next).toHaveBeenCalledOnce();
  });

  it("reveals immediately and retains the same focused button when the next line arrives", () => {
    const next = vi.fn();
    const { container, rerender } = render(
      <GameDialogue text="Primeira" onNext={next} />,
    );
    const button = screen.getByRole("button", { name: "Mostrar fala" });
    button.focus();
    fireEvent.click(button);
    expect(visualText(container)?.textContent).toBe("Primeira");
    expect(button).toHaveTextContent("Continuar");
    expect(button).toHaveFocus();
    expect(next).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(next).toHaveBeenCalledOnce();
    rerender(<GameDialogue text="Segunda" onNext={next} nextLabel="Ir" />);
    expect(button).toHaveFocus();
    expect(button).toHaveTextContent("Mostrar fala");
    expect(visualText(container)?.textContent).toBe("");
    fireEvent.click(button);
    expect(button).toHaveTextContent("Ir");
  });

  it("cancels the previous line and pauses while inactive", () => {
    const clear = vi.spyOn(window, "clearInterval");
    const set = vi.spyOn(window, "setInterval");
    const { container, rerender, unmount } = render(
      <GameDialogue text="Antiga" onNext={vi.fn()} />,
    );
    const timer = set.mock.results[0].value;
    rerender(<GameDialogue text="Nova" active={false} onNext={vi.fn()} />);
    expect(clear).toHaveBeenCalledWith(timer);
    act(() => vi.advanceTimersByTime(100));
    expect(visualText(container)?.textContent).toBe("");
    expect(screen.getByRole("button", { name: "Mostrar fala" })).toBeDisabled();
    rerender(<GameDialogue text="Nova" onNext={vi.fn()} />);
    act(() => vi.advanceTimersByTime(30));
    expect(visualText(container)?.textContent).toBe("N");
    unmount();
    expect(listeners.size).toBe(0);
  });

  it("honors reduced motion and offers an optional skip", () => {
    Object.defineProperty(motion, "matches", {
      configurable: true,
      value: true,
    });
    const skip = vi.fn();
    const { container } = render(
      <GameDialogue
        text="Sem espera"
        speaker="Guia"
        onNext={vi.fn()}
        onSkip={skip}
      />,
    );
    expect(visualText(container)?.textContent).toBe("Sem espera");
    expect(
      screen.getByRole("group", { name: "Fala de Guia" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Pular conversa" }));
    expect(skip).toHaveBeenCalledOnce();
  });
});
