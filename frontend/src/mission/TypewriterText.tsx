import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

export interface TypewriterTextProps {
  text: string;
  intervalMs?: number;
  className?: string;
  children?: ReactNode;
}

const visuallyHidden: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
};

function useReducedMotion() {
  const [query] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null,
  );
  const [reduced, setReduced] = useState(() => query?.matches ?? false);

  useEffect(() => {
    if (!query) return;
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [query]);

  return reduced;
}

/** Shared animation state for dialogue controls that remain mounted across lines. */
export function useTypewriter(text: string, intervalMs = 30, active = true) {
  const reducedMotion = useReducedMotion();
  const characters = useMemo(() => Array.from(text), [text]);
  const [progress, setProgress] = useState({ text, count: 0 });
  const [previousText, setPreviousText] = useState(text);
  if (previousText !== text) {
    setPreviousText(text);
    setProgress({ text, count: 0 });
  }
  const count = progress.text === text ? progress.count : 0;
  const complete = reducedMotion || count >= characters.length;
  const delay = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 30;

  useEffect(() => {
    if (reducedMotion) {
      setProgress({ text, count: characters.length });
      return;
    }
    if (!active || complete) return;
    const timer = window.setInterval(() => {
      setProgress((previous) => ({
        text,
        count: Math.min(
          (previous.text === text ? previous.count : 0) + 1,
          characters.length,
        ),
      }));
    }, delay);
    return () => window.clearInterval(timer);
  }, [active, characters, complete, delay, reducedMotion, text]);

  return {
    complete,
    visibleText: complete ? text : characters.slice(0, count).join(""),
    reveal: () => setProgress({ text, count: characters.length }),
  };
}

/** A stable layout with one accessible copy and a non-announced visual copy. */
export function TypewriterContent({
  text,
  visibleText,
}: {
  text: string;
  visibleText: string;
}) {
  return (
    <>
      <span style={visuallyHidden}>{text}</span>
      <span
        aria-hidden="true"
        style={{ display: "grid", whiteSpace: "pre-wrap" }}
      >
        <span style={{ gridArea: "1 / 1", visibility: "hidden" }}>{text}</span>
        <span style={{ gridArea: "1 / 1" }}>{visibleText}</span>
      </span>
    </>
  );
}

function AnimatedText({
  text,
  intervalMs,
  className,
  children,
}: Required<Pick<TypewriterTextProps, "text" | "intervalMs">> & {
  className?: string;
  children?: ReactNode;
}) {
  const { visibleText } = useTypewriter(text, intervalMs);

  return (
    <div className={className} style={{ font: "inherit" }}>
      <TypewriterContent text={text} visibleText={visibleText} />
      {children}
    </div>
  );
}

/** Self-contained text animation; navigation must remain independent of completion. */
export function TypewriterText({
  text,
  intervalMs = 30,
  className,
  children,
}: TypewriterTextProps) {
  // A new utterance unmounts its previous animation and cancels its timer.
  return (
    <AnimatedText
      key={text}
      text={text}
      intervalMs={intervalMs}
      className={className}
    >
      {children}
    </AnimatedText>
  );
}
