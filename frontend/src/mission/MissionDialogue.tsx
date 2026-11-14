import { SpeechControl } from "./SpeechControl";
import { TypewriterText } from "./TypewriterText";

export const WELCOME_DIALOGUE =
  "Oi, eu sou a Lua! Sou uma astronauta fictícia e vou te ajudar por aqui. A nossa nave é robótica: as missões CLPS não levam astronautas. A NASA contrata empresas para levar equipamentos científicos à Lua. Bora escolher onde pousar?";

export function MissionDialogue({
  text,
  active = true,
}: {
  text: string;
  active?: boolean;
}) {
  return (
    <div className="mission-dialogue" role="group" aria-label="Fala da guia">
      <TypewriterText text={text}>
        {active && <SpeechControl text={text} />}
      </TypewriterText>
    </div>
  );
}
