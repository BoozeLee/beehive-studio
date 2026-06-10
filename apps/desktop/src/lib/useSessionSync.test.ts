import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionSync } from "./useSessionSync";

// Mock WebSocket
class MockWebSocket {
  url: string;
  readyState: number = WebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      this.onopen?.();
    }, 0);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.();
  }

  // Helper to simulate receiving a message
  receive(data: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

describe("useSessionSync", () => {
  let mockWs: MockWebSocket | undefined;

  beforeEach(() => {
    vi.stubGlobal("WebSocket", vi.fn((url: string) => {
      const ws = new MockWebSocket(url);
      mockWs = ws;
      return ws;
    }));
    Object.defineProperty(window, "location", {
      value: { protocol: "http:" },
      writable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockWs = undefined;
  });

  it("starts with connected=false", () => {
    const { result } = renderHook(() => useSessionSync({ enabled: false }));
    expect(result.current.connected).toBe(false);
  });

  it("establishes a WebSocket connection", () => {
    renderHook(() => useSessionSync({ enabled: true }));
    expect(mockWs).toBeDefined();
    expect(mockWs!.url).toContain("/ws/session");
  });

  it("does not connect when disabled", () => {
    renderHook(() => useSessionSync({ enabled: false }));
    expect(mockWs).toBeUndefined();
  });

  it("sendClipUpdate sends correct message", () => {
    const { result } = renderHook(() => useSessionSync({ enabled: true }));
    act(() => {
      result.current.sendClipUpdate({ id: "clip-1", name: "test" });
    });
    expect(mockWs!.sentMessages).toHaveLength(1);
    const msg = JSON.parse(mockWs!.sentMessages[0]);
    expect(msg.type).toBe("clip_update");
    expect(msg.clip.id).toBe("clip-1");
  });

  it("sendClipDelete sends correct message", () => {
    const { result } = renderHook(() => useSessionSync({ enabled: true }));
    act(() => {
      result.current.sendClipDelete("clip-42");
    });
    expect(mockWs!.sentMessages).toHaveLength(1);
    const msg = JSON.parse(mockWs!.sentMessages[0]);
    expect(msg.type).toBe("clip_delete");
    expect(msg.clip_id).toBe("clip-42");
  });

  it("sendPlayback sends correct message", () => {
    const { result } = renderHook(() => useSessionSync({ enabled: true }));
    act(() => {
      result.current.sendPlayback({ is_playing: true, current_beat: 16, bpm: 140 });
    });
    expect(mockWs!.sentMessages).toHaveLength(1);
    const msg = JSON.parse(mockWs!.sentMessages[0]);
    expect(msg.type).toBe("playback");
    expect(msg.is_playing).toBe(true);
    expect(msg.current_beat).toBe(16);
  });

  it("calls onClipUpdate when receiving clip_update message", () => {
    const onClipUpdate = vi.fn();
    renderHook(() => useSessionSync({ enabled: true, onClipUpdate }));
    act(() => {
      mockWs!.receive({ type: "clip_update", clip: { id: "clip-5", name: "updated" } });
    });
    expect(onClipUpdate).toHaveBeenCalledWith({ id: "clip-5", name: "updated" });
  });

  it("calls onPlaybackChange when receiving playback message", () => {
    const onPlaybackChange = vi.fn();
    renderHook(() => useSessionSync({ enabled: true, onPlaybackChange }));
    act(() => {
      mockWs!.receive({ type: "playback", is_playing: true, current_beat: 8, bpm: 150 });
    });
    expect(onPlaybackChange).toHaveBeenCalledWith({ is_playing: true, current_beat: 8, bpm: 150 });
  });

  it("cleanup closes WebSocket on unmount", () => {
    const { unmount } = renderHook(() => useSessionSync({ enabled: true }));
    const ws = mockWs!;
    unmount();
    expect(ws.readyState).toBe(WebSocket.CLOSED);
  });
});
