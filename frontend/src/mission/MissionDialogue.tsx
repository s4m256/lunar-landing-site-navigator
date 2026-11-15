import { TypewriterText } from "./TypewriterText";

export const WELCOME_DIALOGUE =
  "Hello, I’m Lua, your fictional mission guide. NASA’s CLPS program works with companies to deliver science and technology to the Moon using robotic landers. Let’s choose a landing site.";

export function MissionDialogue({
  text,
}: {
  text: string;
  active?: boolean;
}) {
  return (
    <div className="mission-dialogue" role="group" aria-label="Guide dialogue">
      <TypewriterText text={text} />
    </div>
  );
}
