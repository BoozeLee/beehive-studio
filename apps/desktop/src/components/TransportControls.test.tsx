import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { TransportControls } from "./TransportControls";

describe("TransportControls", () => {
  const defaultProps = {
    isPlaying: false,
    bpm: 140,
    currentBeat: 8,
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onStop: vi.fn(),
    onBpmChange: vi.fn(),
  };

  it("renders play button when not playing", () => {
    render(<TransportControls {...defaultProps} />);
    expect(screen.getByText("▶ Play")).toBeTruthy();
  });

  it("renders pause button when playing", () => {
    render(<TransportControls {...defaultProps} isPlaying={true} />);
    expect(screen.getByText("⏸ Pause")).toBeTruthy();
  });

  it("renders stop button", () => {
    render(<TransportControls {...defaultProps} />);
    expect(screen.getByText("⏹ Stop")).toBeTruthy();
  });

  it("displays BPM value", () => {
    render(<TransportControls {...defaultProps} bpm={142} />);
    const bpmInput = screen.getByDisplayValue("142");
    expect(bpmInput).toBeTruthy();
  });

  it("displays formatted beat position", () => {
    render(<TransportControls {...defaultProps} currentBeat={8.5} />);
    // 8.5 beats = bar 3, beat 1, sixteenth 3 (0-indexed: 8/4=2→bar 3, beat 0.5→1, sixteenth 0.5→3)
    const beatDisplay = screen.getByText(/^\d+\.\d+\.\d+$/);
    expect(beatDisplay).toBeTruthy();
  });

  it("calls onPlay when play button clicked", () => {
    const onPlay = vi.fn();
    render(<TransportControls {...defaultProps} onPlay={onPlay} />);
    fireEvent.click(screen.getByText("▶ Play"));
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it("calls onPause when pause button clicked", () => {
    const onPause = vi.fn();
    render(<TransportControls {...defaultProps} isPlaying={true} onPause={onPause} />);
    fireEvent.click(screen.getByText("⏸ Pause"));
    expect(onPause).toHaveBeenCalledOnce();
  });

  it("calls onStop when stop button clicked", () => {
    const onStop = vi.fn();
    render(<TransportControls {...defaultProps} onStop={onStop} />);
    fireEvent.click(screen.getByText("⏹ Stop"));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("calls onBpmChange when BPM input changes", () => {
    const onBpmChange = vi.fn();
    render(<TransportControls {...defaultProps} onBpmChange={onBpmChange} />);
    const input = screen.getByDisplayValue("140");
    fireEvent.change(input, { target: { value: "150" } });
    expect(onBpmChange).toHaveBeenCalledWith(150);
  });

  it("shows green status indicator when playing", () => {
    const { container } = render(<TransportControls {...defaultProps} isPlaying={true} />);
    const circles = container.querySelectorAll('[style*="border-radius: 50%"]');
    expect(circles.length).toBeGreaterThanOrEqual(1);
    // Should have green background style
    expect(container.innerHTML).toContain("#4ade80");
  });

  it("shows red status indicator when stopped", () => {
    const { container } = render(<TransportControls {...defaultProps} isPlaying={false} />);
    // Should have red background style
    expect(container.innerHTML).toContain("#ef4444");
  });
});
