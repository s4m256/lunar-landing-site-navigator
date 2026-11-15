import type { ReactNode } from "react";
import { TypewriterContent, useTypewriter } from "./TypewriterText";

export interface GameDialogueProps {
  text: string;
  speaker?: string;
  onNext: () => void;
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
  nextLabel = "Continuar",
  active = true,
  onSkip,
  children,
}: GameDialogueProps) {
  const { complete, visibleText, reveal } = useTypewriter(text, 30, active);

  return (
    <div
      className="game-dialogue"
      role="group"
      aria-label={`Fala de ${speaker}`}
    >
      <div className="game-dialogue-speaker">{speaker}</div>
      <div className="game-dialogue-text">
        <TypewriterContent text={text} visibleText={visibleText} />
      </div>
      <div className="game-dialogue-actions">
        <button
          className="game-dialogue-next"
          type="button"
          disabled={!active}
          onClick={complete ? onNext : reveal}
        >
          {complete ? nextLabel : "Mostrar fala"}
        </button>
        {onSkip && (
          <button
            className="game-dialogue-skip"
            type="button"
            disabled={!active}
            onClick={onSkip}
          >
            Pular conversa
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
