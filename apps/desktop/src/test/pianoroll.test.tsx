import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PianoRoll } from "../components/PianoRoll/PianoRoll";

describe("PianoRoll", () => {
  it("quantize snaps all note starts to the grid", () => {
    const onChange = vi.fn();
    render(
      <PianoRoll
        notes={[
          { id: "n1", pitch: 60, velocity: 100, start: 1.3, duration: 0.5 },
          { id: "n2", pitch: 62, velocity: 90, start: 2.1, duration: 0.5 },
        ]}
        onChange={onChange}
        snapToGrid
        gridDivision={1}
      />
    );
    fireEvent.click(screen.getByTitle("Snap all notes to the grid"));
    expect(onChange).toHaveBeenCalledWith([
      { id: "n1", pitch: 60, velocity: 100, start: 1, duration: 0.5 },
      { id: "n2", pitch: 62, velocity: 90, start: 2, duration: 0.5 },
    ]);
  });
});
