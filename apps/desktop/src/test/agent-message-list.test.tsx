import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AgentMessageList } from "../components/AgentDirector/AgentMessageList";

Element.prototype.scrollIntoView = vi.fn();

describe("AgentMessageList", () => {
  it("renders a user message", () => {
    const messages = [{ id: "1", role: "user" as const, text: "hello", createdAt: 0 }];
    render(<AgentMessageList messages={messages} />);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("fires alternative callback", () => {
    const onTry = vi.fn();
    const messages = [
      {
        id: "1",
        role: "agent" as const,
        createdAt: 0,
        proposal: { creative_plan: { alternatives: [{ direction: "faster" }] } },
      },
    ];
    render(<AgentMessageList messages={messages} onTryAlternative={onTry} />);
    fireEvent.click(screen.getByText("Try: faster"));
    expect(onTry).toHaveBeenCalledWith("faster");
  });
});
