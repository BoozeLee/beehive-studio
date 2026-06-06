import { beforeEach, describe, expect, it } from "vitest";
import type { Track } from "../../../../packages/core-models/index";
import {
  createDefaultPattern,
  resolvePatternTargetTrack,
  usePatternBankStore,
} from "../lib/patternBankStore";

function track(id: string, type: Track["type"] = "midi"): Track {
  return {
    id,
    name: id,
    type,
    color: "#ff8c42",
    volume: 0.8,
    pan: 0,
    muted: false,
    solo: false,
    arm: false,
    clips: [],
    automationLanes: [],
  };
}

describe("pattern bank store", () => {
  beforeEach(() => {
    usePatternBankStore.setState({ patterns: [], selectedPatternId: null });
  });

  it("creates, renames, duplicates, selects, and deletes patterns", () => {
    const first = { ...createDefaultPattern("A"), id: "pattern-1" };
    usePatternBankStore.getState().addPattern(first);
    usePatternBankStore.getState().updatePattern(first.id, { name: "Renamed" });
    usePatternBankStore.getState().duplicatePattern(first.id, "pattern-2");

    expect(usePatternBankStore.getState().patterns.map((pattern) => pattern.name)).toEqual([
      "Renamed",
      "Renamed Copy",
    ]);
    expect(usePatternBankStore.getState().selectedPatternId).toBe("pattern-2");

    usePatternBankStore.getState().selectPattern("pattern-1");
    usePatternBankStore.getState().removePattern("pattern-1");
    expect(usePatternBankStore.getState().selectedPatternId).toBe("pattern-2");
  });

  it("prefers the selected MIDI track and falls back to the first MIDI track", () => {
    const tracks = [track("audio", "audio"), track("midi-1"), track("midi-2")];

    expect(resolvePatternTargetTrack(tracks, "midi-2")?.id).toBe("midi-2");
    expect(resolvePatternTargetTrack(tracks, "audio")?.id).toBe("midi-1");
    expect(resolvePatternTargetTrack([track("audio", "audio")], null)).toBeUndefined();
  });
});
