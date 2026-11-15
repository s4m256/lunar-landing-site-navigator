import { useLayoutEffect, useRef, type ReactNode } from "react";
import { TypewriterContent, useTypewriter } from "./TypewriterText";

export interface GameDialogueProps {
  text: string;
  speaker?: string;
  onNext: () => void;
  onBack?: () => void;
  nextLabel?: string;
  active?: boolean;
  onSkip?: () => void;
  children?: ReactNode;
}

/** Dialogue advances through an explicit, consistently focused control. */
export function GameDialogue({
  text,
  speaker = "Lua",
  onNext,
  onBack,
  nextLabel = "Continue",
  active = true,
  onSkip,
  children,
}: GameDialogueProps) {
  const { complete, visibleText, reveal } = useTypewriter(text, 30, active);
  const backRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const backFocused = useRef(false);
  const backDisabled = !active || !onBack;

  useLayoutEffect(() => {
    if (backDisabled && active && backFocused.current) {
      nextRef.current?.focus();
      backFocused.current = false;
    }
  }, [active, backDisabled]);

  return (
    <div
      className="game-dialogue"
      role="group"
      aria-label={`Dialogue from ${speaker}`}
    >
      <div className="game-dialogue-speaker">{speaker}</div>
      <div className="game-dialogue-text">
        <TypewriterContent text={text} visibleText={visibleText} />
      </div>
      <div className="game-dialogue-actions">
        <button
          ref={backRef}
          className="game-dialogue-back"
          type="button"
          disabled={backDisabled}
          onFocus={() => {
            backFocused.current = true;
          }}
          onBlur={() => {
            backFocused.current = false;
          }}
          onClick={onBack}
        >
          Back
        </button>
        <button
          ref={nextRef}
          className="game-dialogue-next"
          type="button"
          disabled={!active}
          onClick={complete ? onNext : reveal}
        >
          {nextLabel}
        </button>
        {onSkip && (
          <button
            className="game-dialogue-skip"
            type="button"
            disabled={!active}
            onClick={onSkip}
          >
            Skip intro
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
