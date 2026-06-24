import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { AgentDirector } from "../components/AgentDirector/AgentDirector";
import { useTimelineStore } from "../lib/timelineStore";
import type { Clip as TimelineClip, Track } from "../../../../packages/core-models/index";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const TEST_BRIEF =
  "Generate a rolling 130 BPM acid techno bassline in C minor, 4 bars, swing 0.15, density 0.75, darkness 0.6";

const DEMO_NOTES = [
  { pitch: 48, velocity: 107, start: 0.3375, duration: 0.25 },
  { pitch: 36, velocity: 89, start: 3.3375, duration: 0.25 },
];

class MockWebSocket {
  static lastInstance: MockWebSocket | null = null;
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: unknown[] = [];
  readyState = 0;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.lastInstance = this;
  }

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.readyState = 3;
  }

  simulateComplete() {
    this.readyState = 1;
    this.onopen?.();
    this.onmessage?.({
      data: JSON.stringify({
        type: "complete",
        clip_preview: { notes: DEMO_NOTES },
        reasoning: ["Analyzed brief", "Generated 4-bar pattern"],
      }),
    });
  }
}

function inferClipDuration(
  notes: Array<{ pitch: number; velocity: number; start: number; duration: number }>
): number {
  if (notes.length === 0) return 4;
  const endBeat = Math.max(...notes.map((n) => n.start + n.duration));
  return Math.max(4, Math.ceil(endBeat / 4) * 4);
}

function handleClipGenerated(
  notes: Array<{ pitch: number; velocity: number; start: number; duration: number }>,
  _reasoning: string[]
) {
  const state = useTimelineStore.getState();
  let targetTrack = state.tracks.find(
    (t) => t.type === "midi" && t.name.toLowerCase().includes("bass")
  );
  if (!targetTrack) {
    const trackId = crypto.randomUUID();
    targetTrack = {
      id: trackId,
      name: "Bass",
      type: "midi",
      color: "#ff8c42",
      volume: 0.8,
      pan: 0,
      muted: false,
      solo: false,
      arm: false,
      clips: [],
      automationLanes: [],
      instrument: { type: "tonejs", preset: "bass" },
    };
    useTimelineStore.getState().addTrack(targetTrack);
  }

  const clipId = crypto.randomUUID();
  const duration = inferClipDuration(notes);
  const now = Date.now() / 1000;
  const timelineClip: TimelineClip = {
    id: clipId,
    name: "Rolling Acid Bass",
    type: "midi",
    trackId: targetTrack.id,
    start: state.cursorPosition,
    duration,
    loop: false,
    midiData: { notes },
    playback: { instrument: "bass", preset: "acid" },
    metadata: {
      generative: true,
      agentId: "rhythm_groove",
      reasoningTrace: _reasoning.join("\n"),
      confidence: 0.95,
      tags: ["acid", "techno", "bassline"],
    },
    createdAt: now,
    updatedAt: now,
  };
  useTimelineStore.getState().addClip(timelineClip);
}

describe("Chat -> Clip -> Playback smoke", () => {
  beforeEach(() => {
    useTimelineStore.setState({
      tracks: [],
      clips: {},
      selectedTrackId: null,
      selectedClipId: null,
      cursorPosition: 4,
      zoom: 16,
      scrollOffset: { x: 0, y: 0 },
      snapToGrid: true,
      gridDivision: 1,
    });
    MockWebSocket.lastInstance = null;
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  it("streams a brief to the agent and creates a Bass track + clip in the timeline", async () => {
    render(<AgentDirector bpm={130} onClipGenerated={handleClipGenerated} />);

    // Enter the brief into the workbench composer and send it.
    const briefArea = screen.getByPlaceholderText(/Ctrl\+Enter to send/i);
    fireEvent.change(briefArea, { target: { value: TEST_BRIEF } });
    fireEvent.click(screen.getByText("Send"));

    await waitFor(() => {
      expect(MockWebSocket.lastInstance).not.toBeNull();
    });
    const ws = MockWebSocket.lastInstance!;
    expect(ws.url).toBe("ws://localhost:9876/ws/agent");

    // Wait for the component to attach the open handler, then simulate connection
    await waitFor(() => {
      expect(typeof ws.onopen).toBe("function");
    });
    await act(async () => {
      ws.onopen?.();
    });

    expect(ws.sent).toEqual([
      expect.objectContaining({
        type: "brief",
        brief: TEST_BRIEF,
        agent_id: "rhythm_groove",
        session_context: { bpm: 130, swing: 0.68 },
      }),
    ]);

    await act(async () => {
      ws.simulateComplete();
    });

    await waitFor(() => {
      const state = useTimelineStore.getState();
      expect(state.tracks.length).toBe(1);
      expect(state.tracks[0].name).toBe("Bass");
      expect(state.tracks[0].type).toBe("midi");

      const clipIds = state.tracks[0].clips;
      expect(clipIds.length).toBe(1);

      const clip = state.clips[clipIds[0]];
      expect(clip).toBeDefined();
      expect(clip.name).toBe("Rolling Acid Bass");
      expect(clip.trackId).toBe(state.tracks[0].id);
      expect(clip.start).toBe(4);
      expect(clip.duration).toBe(4);
      expect(clip.midiData?.notes).toEqual(DEMO_NOTES);
      expect(clip.playback?.instrument).toBe("bass");
      expect(clip.metadata?.generative).toBe(true);
    });
  });
});
