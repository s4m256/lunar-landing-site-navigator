import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpeechControl } from "./SpeechControl";

let voices: SpeechSynthesisVoice[];
let listeners: Set<EventListener>;
let utterances: MockUtterance[];
let speak: ReturnType<typeof vi.fn>;
let cancel: ReturnType<typeof vi.fn>;

class MockUtterance {
  lang = "";
  voice: SpeechSynthesisVoice | null = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {
    utterances.push(this);
  }
}

const pt = { lang: "pt-PT", name: "Português" } as SpeechSynthesisVoice;
const br = { lang: "pt-BR", name: "Brasil" } as SpeechSynthesisVoice;

beforeEach(() => {
  voices = [pt, br];
  listeners = new Set();
  utterances = [];
  speak = vi.fn();
  cancel = vi.fn();
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      getVoices: () => voices,
      addEventListener: (_event: string, callback: EventListener) =>
        listeners.add(callback),
      removeEventListener: (_event: string, callback: EventListener) =>
        listeners.delete(callback),
      speak,
      cancel,
    },
  });
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true,
    value: MockUtterance,
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "speechSynthesis");
  Reflect.deleteProperty(window, "SpeechSynthesisUtterance");
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("SpeechControl", () => {
  it("speaks only after a click, prefers Brazilian Portuguese and resets when finished", () => {
    render(<SpeechControl text="Olá, explorador!" />);
    expect(speak).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ouvir fala" }));
    expect(speak).toHaveBeenCalledOnce();
    expect(utterances[0]).toMatchObject({
      text: "Olá, explorador!",
      lang: "pt-BR",
      voice: br,
    });
    expect(screen.getByRole("status")).toHaveTextContent("Preparando fala");
    act(() => utterances[0].onstart?.());
    expect(screen.getByRole("status")).toHaveTextContent("Reproduzindo fala");
    act(() => utterances[0].onend?.());
    expect(screen.getByRole("button", { name: "Ouvir fala" })).toBeEnabled();
  });

  it("offers a Portuguese fallback and reports synthesis errors", () => {
    voices = [pt];
    render(<SpeechControl text="Olá" />);
    fireEvent.click(screen.getByRole("button", { name: "Ouvir fala" }));
    expect(utterances[0].voice).toBe(pt);
    act(() => utterances[0].onerror?.());
    expect(screen.getByRole("status")).toHaveTextContent(
      "Não foi possível reproduzir a fala",
    );
    expect(screen.getByRole("button", { name: "Ouvir fala" })).toBeEnabled();
  });

  it("stops on click, dialogue change and unmount, ignoring stale events", () => {
    const view = render(<SpeechControl text="Primeira" />);
    fireEvent.click(screen.getByRole("button", { name: "Ouvir fala" }));
    fireEvent.click(screen.getByRole("button", { name: "Parar fala" }));
    act(() => utterances[0].onerror?.());
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole("button", { name: "Ouvir fala" }));
    const beforeChange = cancel.mock.calls.length;
    view.rerender(<SpeechControl text="Segunda" />);
    expect(cancel).toHaveBeenCalledTimes(beforeChange + 1);
    expect(screen.getByRole("button", { name: "Ouvir fala" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Ouvir fala" }));
    expect(utterances[2].text).toBe("Segunda");
    const beforeUnmount = cancel.mock.calls.length;
    view.unmount();
    expect(cancel).toHaveBeenCalledTimes(beforeUnmount + 1);
    expect(listeners.size).toBe(0);
  });

  it("times out if speech never starts and ignores a late start", () => {
    vi.useFakeTimers();
    render(<SpeechControl text="Olá" />);
    fireEvent.click(screen.getByRole("button", { name: "Ouvir fala" }));
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Não foi possível iniciar a fala",
    );
    expect(screen.getByRole("button", { name: "Ouvir fala" })).toBeEnabled();
    expect(cancel).toHaveBeenCalledTimes(2);
    act(() => utterances[0].onstart?.());
    expect(screen.getByRole("status")).toHaveTextContent(
      "Não foi possível iniciar a fala",
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the start timer on start, stop, text change, unmount and synchronous failure", () => {
    vi.useFakeTimers();
    const view = render(<SpeechControl text="Primeira" />);
    fireEvent.click(screen.getByRole("button", { name: "Ouvir fala" }));
    act(() => utterances[0].onstart?.());
    expect(vi.getTimerCount()).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Parar fala" }));
    fireEvent.click(screen.getByRole("button", { name: "Ouvir fala" }));
    fireEvent.click(screen.getByRole("button", { name: "Parar fala" }));
    expect(vi.getTimerCount()).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Ouvir fala" }));
    view.rerender(<SpeechControl text="Segunda" />);
    expect(vi.getTimerCount()).toBe(0);
    speak.mockImplementationOnce(() => {
      throw new Error("speech unavailable");
    });
    fireEvent.click(screen.getByRole("button", { name: "Ouvir fala" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Não foi possível reproduzir a fala",
    );
    expect(vi.getTimerCount()).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Ouvir fala" }));
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports unavailable browser support", () => {
    Reflect.deleteProperty(window, "speechSynthesis");
    render(<SpeechControl text="Olá" />);
    expect(screen.getByRole("button", { name: "Ouvir fala" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "não está disponível neste navegador",
    );
  });

  it("reports missing Portuguese voices and enables speech when voices arrive", () => {
    voices = [];
    render(<SpeechControl text="Olá" />);
    expect(screen.getByRole("button", { name: "Ouvir fala" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Nenhuma voz em português disponível",
    );
    voices = [br];
    act(() =>
      listeners.forEach((listener) => listener(new Event("voiceschanged"))),
    );
    expect(screen.getByRole("button", { name: "Ouvir fala" })).toBeEnabled();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole("button", { name: "Ouvir fala" }));
    expect(speak).toHaveBeenCalledOnce();
  });
});
