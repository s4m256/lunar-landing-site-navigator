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

function AnimatedText({
  text,
  intervalMs,
  className,
  reducedMotion,
  children,
}: Required<Pick<TypewriterTextProps, "text" | "intervalMs">> & {
  className?: string;
  reducedMotion: boolean;
  children?: ReactNode;
}) {
  // Array.from iterates Unicode code points, preserving surrogate pairs.
  const characters = useMemo(() => Array.from(text), [text]);
  const [visibleCount, setVisibleCount] = useState(0);
  const complete = reducedMotion || visibleCount >= characters.length;
  const delay = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 30;

  useEffect(() => {
    if (reducedMotion) {
      setVisibleCount(characters.length);
      return;
    }
    if (complete) return;
    const timer = window.setInterval(() => {
      setVisibleCount((count) => Math.min(count + 1, characters.length));
    }, delay);
    return () => window.clearInterval(timer);
  }, [characters, complete, delay, reducedMotion]);

  return (
    <div className={className} style={{ font: "inherit" }}>
      {/* One complete accessible copy; visual updates are never live announcements. */}
      <span style={visuallyHidden}>{text}</span>
      <span
        aria-hidden="true"
        style={{ display: "grid", whiteSpace: "pre-wrap" }}
      >
        <span style={{ gridArea: "1 / 1", visibility: "hidden" }}>{text}</span>
        <span style={{ gridArea: "1 / 1" }}>
          {complete ? text : characters.slice(0, visibleCount).join("")}
        </span>
      </span>
      <div className="typewriter-controls">
        {children}
        <button
          type="button"
          style={{ font: "inherit" }}
          aria-disabled={complete}
          onClick={() => {
            if (!complete) setVisibleCount(characters.length);
          }}
        >
          Mostrar texto inteiro
        </button>
      </div>
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
  const reducedMotion = useReducedMotion();
  // A new utterance unmounts its previous animation and cancels its timer.
  return (
    <AnimatedText
      key={text}
      text={text}
      intervalMs={intervalMs}
      className={className}
      reducedMotion={reducedMotion}
    >
      {children}
    </AnimatedText>
  );
}
