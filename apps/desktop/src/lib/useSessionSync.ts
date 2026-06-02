import { useState, useEffect, useCallback, useRef } from "react";

interface SessionState {
  clips: Record<string, unknown>;
  is_playing: boolean;
  current_beat: number;
  bpm: number;
}

interface UseSessionSyncOptions {
  sessionId?: string;
  onClipUpdate?: (clip: Record<string, unknown>) => void;
  onClipDelete?: (clipId: string) => void;
  onPlaybackChange?: (state: { is_playing: boolean; current_beat: number; bpm: number }) => void;
  enabled?: boolean;
}

export function useSessionSync(options: UseSessionSyncOptions = {}) {
  const {
    sessionId = "default",
    onClipUpdate,
    onClipDelete,
    onPlaybackChange,
    enabled = true,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [sessionState, setSessionState] = useState<SessionState | null>(null);

  const sendMessage = useCallback(
    (message: Record<string, unknown>) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(message));
      }
    },
    []
  );

  const sendClipUpdate = useCallback(
    (clip: Record<string, unknown>) => {
      sendMessage({ type: "clip_update", clip });
    },
    [sendMessage]
  );

  const sendClipDelete = useCallback(
    (clipId: string) => {
      sendMessage({ type: "clip_delete", clip_id: clipId });
    },
    [sendMessage]
  );

  const sendPlayback = useCallback(
    (state: { is_playing: boolean; current_beat: number; bpm: number }) => {
      sendMessage({ type: "playback", ...state });
    },
    [sendMessage]
  );

  const requestSync = useCallback(() => {
    sendMessage({ type: "sync_request" });
  }, [sendMessage]);

  useEffect(() => {
    if (!enabled) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = "127.0.0.1:9876";
    const url = `${protocol}//${host}/ws/session`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "session_state":
            setSessionState(data.state);
            if (data.state.clips) {
              Object.values(data.state.clips).forEach((clip) => {
                onClipUpdate?.(clip as Record<string, unknown>);
              });
            }
            break;

          case "clip_update":
            onClipUpdate?.(data.clip);
            break;

          case "clip_delete":
            onClipDelete?.(data.clip_id);
            break;

          case "playback":
            onPlaybackChange?.({
              is_playing: data.is_playing,
              current_beat: data.current_beat,
              bpm: data.bpm,
            });
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
      setConnected(false);
    };
  }, [sessionId, enabled, onClipUpdate, onClipDelete, onPlaybackChange]);

  return {
    connected,
    sessionState,
    sendClipUpdate,
    sendClipDelete,
    sendPlayback,
    requestSync,
  };
}
