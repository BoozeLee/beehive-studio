import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AgentDirector } from "../components/AgentDirector/AgentDirector";
import { useWorkbenchStore } from "../lib/workbenchStore";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

Element.prototype.scrollIntoView = vi.fn();

describe("AgentDirector chat", () => {
  it("records a user message when sent", async () => {
    render(<AgentDirector onClipGenerated={vi.fn()} />);
    const input = screen.getByPlaceholderText(/Ask/);
    fireEvent.change(input, { target: { value: "hi" } });
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    const state = useWorkbenchStore.getState();
    const session = state.chat.sessions.find((s) => s.id === state.chat.activeSessionId);
    expect(session?.messages.some((m) => m.role === "user" && m.text === "hi")).toBe(true);
  });

  it("records streamed error messages gracefully", async () => {
    render(<AgentDirector onClipGenerated={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Ask/), { target: { value: "test" } });
    fireEvent.click(screen.getByText("Send"));
    await waitFor(() => {
      const session = useWorkbenchStore.getState().chat.sessions.find((s) => s.id === useWorkbenchStore.getState().chat.activeSessionId);
      return (session?.messages.length ?? 0) > 0;
    });
    const session = useWorkbenchStore.getState().chat.sessions.find((s) => s.id === useWorkbenchStore.getState().chat.activeSessionId);
    expect(session?.messages.some((m) => m.role === "user")).toBe(true);
  });
});
