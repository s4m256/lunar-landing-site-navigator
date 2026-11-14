import { useEffect, useRef, type ReactNode } from "react";
import { GuideIcon } from "./GuideIcon";

export function GuidePanel({
  id,
  title,
  children,
  onClose,
  modal = false,
  position = "right",
}: {
  id: string;
  title: string;
  children: ReactNode;
  onClose: () => void;
  modal?: boolean;
  position?: "left" | "right" | "time" | "help";
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("h2")?.focus();
  }, []);
  return (
    <section
      ref={ref}
      id={`guide-panel-${id}`}
      className={`lg-panel lg-panel-${position}`}
      role={modal ? "dialog" : "region"}
      aria-modal={modal || undefined}
      aria-labelledby={`guide-title-${id}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
        if (modal && e.key === "Tab") {
          const controls = Array.from(
            ref.current!.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,a[href],[tabindex="0"]',
            ),
          ).filter((n) => !n.closest("[hidden]") && n.getClientRects().length);
          const first = controls[0],
            last = controls.at(-1);
          if (
            e.shiftKey &&
            (document.activeElement === first ||
              document.activeElement?.tagName === "H2")
          ) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <div className="lg-panel-head">
        <h2 id={`guide-title-${id}`} tabIndex={-1}>
          {title}
        </h2>
        <button
          type="button"
          className="lg-icon-button"
          aria-label={`Fechar ${title}`}
          onClick={onClose}
        >
          <GuideIcon name="close" />
        </button>
      </div>
      <div className="lg-panel-body">{children}</div>
    </section>
  );
}
