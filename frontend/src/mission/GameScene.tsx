import type { ReactNode } from "react";
import astronautUrl from "../assets/poly-astronaut.webp";
import { RocketIllustration } from "./MissionArt";
import "./game-scene.css";

export const CINEMATIC_DURATION_MS = 3200;

export type GameScenePhase =
  | "briefing"
  | "launch"
  | "arrival"
  | "selection"
  | "landing"
  | "complete";

interface GameSceneProps {
  phase: GameScenePhase;
  children?: ReactNode;
}

/** The scene is illustrative; mission selection and measurements remain separate. */
export function GameScene({ phase, children }: GameSceneProps) {
  const cinematic = phase === "launch" || phase === "landing";
  return (
    <section className={`game-scene game-scene--${phase}`}>
      <div className="game-scene-world" aria-hidden="true">
        <div className="game-scene-stars" />
        <div className="game-scene-terrain" />
        {cinematic ? (
          <div className="game-scene-craft">
            <RocketIllustration phase={phase} />
          </div>
        ) : (
          <img className="game-scene-guide" src={astronautUrl} alt="" />
        )}
      </div>
      {children && <div className="game-scene-overlay">{children}</div>}
    </section>
  );
}
