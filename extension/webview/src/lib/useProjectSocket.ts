import { useEffect, useRef, useCallback } from "react";
import { useProjectStore } from "../stores/projectStore";
import type { BuildEvent } from "../../../src/services/types";

export function useProjectSocket(projectId: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const { addBuildJob, updateBuildJob } = useProjectStore();

  const connect = useCallback(() => {
    if (!projectId) {
      return;
    }
    if (wsRef.current) {
      wsRef.current.close();
    }
    const ws = new WebSocket(`ws://127.0.0.1:9000/projects/${encodeURIComponent(projectId)}/events`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[Beehive WS] connected to project events", projectId);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as BuildEvent;
        if (msg.type === "build.created") {
          const job = msg.payload?.job as Record<string, unknown> | undefined;
          if (job && typeof job === "object") {
            addBuildJob(job as any);
          }
        } else if (msg.type === "build.status") {
          const job = msg.payload?.job as Record<string, unknown> | undefined;
          if (job && typeof job === "object") {
            updateBuildJob(job as any);
          }
        } else if (msg.type === "build.completed" || msg.type === "build.failed") {
          const job = msg.payload?.job as Record<string, unknown> | undefined;
          if (job && typeof job === "object") {
            updateBuildJob(job as any);
          }
        }
      } catch (err) {
        console.error("[Beehive WS] failed to parse event", err);
      }
    };

    ws.onerror = (err) => {
      console.error("[Beehive WS] error", err);
    };

    ws.onclose = () => {
      console.log("[Beehive WS] closed");
    };
  }, [projectId, addBuildJob, updateBuildJob]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { reconnect: connect };
}
