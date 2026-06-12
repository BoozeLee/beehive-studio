import { useEffect, useRef, useState, useCallback } from "react";

export type SocketMessage =
  | { type: "generation_status"; backend: string; task_id: string; status: number; status_text: string; progress: number; result?: unknown; error?: string }
  | { type: "agent_trace"; step: unknown }
  | { type: "pong"; time?: number }
  | { type: string; [key: string]: unknown };

interface UseProjectSocketReturn {
  connected: boolean;
  reconnecting: boolean;
  send: (msg: Record<string, unknown>) => void;
  lastMessage: SocketMessage | null;
}

const BACKEND_WS = import.meta.env.VITE_JETBEE_WS_URL ?? "ws://127.0.0.1:9000";
const MAX_RETRIES = 5;
const RECONNECT_BASE_MS = 1000;
const HEARTBEAT_INTERVAL_MS = 30000;

export function useProjectSocket(projectId: string): UseProjectSocketReturn {
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [lastMessage, setLastMessage] = useState<SocketMessage | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shouldConnectRef = useRef(true);

  const cleanup = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!shouldConnectRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const url = `${BACKEND_WS}/projects/${encodeURIComponent(projectId)}/events`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      retryCountRef.current = 0;
      setConnected(true);
      setReconnecting(false);

      heartbeatTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: "ping", time: Date.now() }));
        }
      }, HEARTBEAT_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SocketMessage;
        setLastMessage(data);
      } catch {
        // Ignore non-JSON messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }

      if (shouldConnectRef.current && retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++;
        setReconnecting(true);
        const delay = RECONNECT_BASE_MS * Math.pow(2, retryCountRef.current - 1);
        reconnectTimerRef.current = setTimeout(connect, delay);
      } else if (retryCountRef.current >= MAX_RETRIES) {
        setReconnecting(false);
      }
    };

    ws.onerror = () => {
      // Let onclose handle reconnection logic
    };
  }, [projectId]);

  useEffect(() => {
    shouldConnectRef.current = true;
    connect();
    return () => {
      shouldConnectRef.current = false;
      cleanup();
    };
  }, [connect, cleanup]);

  const send = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { connected, reconnecting, send, lastMessage };
}
