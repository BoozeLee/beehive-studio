import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { rt, rustTransportEnabled } from "../lib/rustTransport";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("rustTransport client", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue(undefined);
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it("maps transport ops to the right commands", async () => {
    await rt.play();
    await rt.pause();
    await rt.stop();
    await rt.seek(8);
    await rt.setBpm(128);
    await rt.clear();

    const calls = vi.mocked(invoke).mock.calls.map((c) => c[0]);
    expect(calls).toEqual([
      "transport_play",
      "transport_pause",
      "transport_stop",
      "transport_seek",
      "transport_set_bpm",
      "transport_clear_clips",
    ]);
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("transport_seek", { beat: 8 });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("transport_set_bpm", { bpm: 128 });
  });

  it("schedules a clip with its notes/instrument", async () => {
    await rt.scheduleClip({
      notes: [{ pitch: 45, velocity: 110, start: 0, duration: 1 }],
      startBeat: 4,
      channel: 0,
      instrument: "bass",
      gain: 1,
      pan: 0,
    });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("transport_schedule_clip", {
      clip: {
        notes: [{ pitch: 45, velocity: 110, start: 0, duration: 1 }],
        startBeat: 4,
        channel: 0,
        instrument: "bass",
        gain: 1,
        pan: 0,
      },
    });
  });

  it("is off by default and opt-in via localStorage", () => {
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k];
      },
    });
    expect(rustTransportEnabled()).toBe(false);
    localStorage.setItem("beehive.rustTransport", "1");
    expect(rustTransportEnabled()).toBe(true);
    vi.unstubAllGlobals();
  });
});
