import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BuildConsole } from "../BuildConsole/BuildConsole";

describe("BuildConsole", () => {
  it("renders empty state", () => {
    render(<BuildConsole logs={[]} />);
    expect(screen.getByText(/No build output yet/i)).toBeInTheDocument();
  });

  it("renders logs with timestamps", () => {
    const logs = [
      { id: "1", timestamp: Date.now(), level: "info" as const, message: "Build started" },
      { id: "2", timestamp: Date.now(), level: "error" as const, message: "Build failed" },
    ];
    render(<BuildConsole logs={logs} />);
    expect(screen.getByText("Build started")).toBeInTheDocument();
    expect(screen.getByText("Build failed")).toBeInTheDocument();
  });

  it("filters by level", () => {
    const logs = [
      { id: "1", timestamp: Date.now(), level: "info" as const, message: "Build started" },
      { id: "2", timestamp: Date.now(), level: "error" as const, message: "Build failed" },
    ];
    render(<BuildConsole logs={logs} />);
    fireEvent.click(screen.getByText(/error \(1\)/i));
    expect(screen.queryByText("Build started")).not.toBeInTheDocument();
    expect(screen.getByText("Build failed")).toBeInTheDocument();
  });

  it("calls onClear", () => {
    const onClear = vi.fn();
    const logs = [{ id: "1", timestamp: Date.now(), level: "info" as const, message: "Build started" }];
    render(<BuildConsole logs={logs} onClear={onClear} />);
    fireEvent.click(screen.getByText(/Clear/i));
    expect(onClear).toHaveBeenCalled();
  });
});
