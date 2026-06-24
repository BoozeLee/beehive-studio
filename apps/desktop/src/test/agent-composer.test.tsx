import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AgentComposer } from "../components/AgentDirector/AgentComposer";

const AGENTS = [{ id: "rhythm", label: "Rhythm", icon: "🎵", color: "#ff8c42" }];

describe("AgentComposer", () => {
  it("sends on Ctrl+Enter", () => {
    const onSend = vi.fn();
    render(<AgentComposer agents={AGENTS} activeAgent="rhythm" onAgentChange={vi.fn()} onSend={onSend} />);
    fireEvent.change(screen.getByPlaceholderText(/Ask/), { target: { value: "make a kick" } });
    fireEvent.keyDown(screen.getByPlaceholderText(/Ask/), { key: "Enter", ctrlKey: true });
    expect(onSend).toHaveBeenCalledWith("make a kick");
  });

  it("switches agents", () => {
    const onAgentChange = vi.fn();
    const agents = [
      { id: "rhythm", label: "Rhythm", icon: "🎵", color: "#ff8c42" },
      { id: "melody", label: "Melody", icon: "🎶", color: "#ffd166" },
    ];
    render(<AgentComposer agents={agents} activeAgent="rhythm" onAgentChange={onAgentChange} onSend={vi.fn()} />);
    fireEvent.click(screen.getByText("🎶 Melody"));
    expect(onAgentChange).toHaveBeenCalledWith("melody");
  });
});
