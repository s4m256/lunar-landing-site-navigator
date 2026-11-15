import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MissionDialogue, WELCOME_DIALOGUE } from "./MissionDialogue";

describe("MissionDialogue", () => {
  it("presents the guide's introduction without voice controls", () => {
    render(<MissionDialogue text={WELCOME_DIALOGUE} />);
    expect(screen.getByRole("group", { name: "Guide dialogue" })).toHaveTextContent(
      "NASA’s CLPS program",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
