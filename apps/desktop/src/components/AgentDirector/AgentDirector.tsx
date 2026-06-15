import { useCallback, useEffect, useRef } from "react";
import { BEEHIVE, panelStyle } from "../../lib/theme";
import { invoke } from "@tauri-apps/api/core";
import { AgentComposer, type AgentOption } from "./AgentComposer";
import { AgentMessageList } from "./AgentMessageList";
import { useWorkbenchStore, type AgentMessage } from "../../lib/workbenchStore";

interface ReasoningStep {
  type: "status" | "reasoning" | "tool_call" | "midi" | "arrangement" | "qa_warning" | "advisory" | "complete" | "error";
  text?: string;
  message?: string;
  name?: string;
  args?: Record<string, unknown>;
  data?: unknown;
  task_id?: string;
  clip_preview?: { notes: Array<{ pitch: number; velocity: number; start: number; duration: number }> };
  proposal?: unknown;
}

const STREAMING_AGENTS = new Set(["rhythm_groove", "melody", "harmony", "arrangement"]);

const AGENTS: AgentOption[] = [
  { id: "rhythm_groove", label: "Rhythm & Groove", color: BEEHIVE.comb, icon: "🎵" },
  { id: "melody", label: "Melody", color: BEEHIVE.honey, icon: "🎶" },
  { id: "harmony", label: "Harmony", color: "#6366f1", icon: "🎹" },
  { id: "drums", label: "Drums", color: "#ef4444", icon: "🥁" },
  { id: "arrangement", label: "Arrangement", color: "#10b981", icon: "📐" },
  { id: "style_reference", label: "Style Ref", color: "#a855f7", icon: "🎨" },
  { id: "texture_atmosphere", label: "Texture", color: "#06b6d4", icon: "🌫️" },
  { id: "mix_master", label: "Mix Master", color: "#f59e0b", icon: "🎛️" },
];

export interface AgentDirectorProps {
  onClipGenerated?: (notes: Array<{ pitch: number; velocity: number; start: number; duration: number }>, reasoning: string[]) => void;
}

function stepToMessages(step: ReasoningStep): AgentMessage[] {
  const base: AgentMessage = { id: crypto.randomUUID(), role: "agent", createdAt: Date.now() };
  switch (step.type) {
    case "status":
      return [{ ...base, role: "system", text: step.message }];
    case "reasoning":
      return [{ ...base, text: step.text }];
    case "tool_call":
      return [{ ...base, role: "tool", toolCall: { name: step.name ?? "tool", args: step.args ?? {} } }];
    case "midi":
      return [{ ...base, text: `MIDI clip generated${step.message ? ` — ${step.message}` : ""}`, clipPreview: step.clip_preview as AgentMessage["clipPreview"] }];
    case "advisory":
      return [{ ...base, role: "agent", proposal: step.proposal }];
    case "complete":
      return [{ ...base, role: "system", text: `Task complete${step.task_id ? ` (${step.task_id.slice(0, 8)})` : ""}`, clipPreview: step.clip_preview as AgentMessage["clipPreview"] }];
    case "error":
      return [{ ...base, role: "system", text: step.message ?? "Unknown agent error" }];
    case "qa_warning":
      return [{ ...base, role: "system", text: step.text }];
    default:
      return [];
  }
}

export function AgentDirector({ onClipGenerated }: AgentDirectorProps) {
  const { chat, addMessage, updateSessionStatus, setActiveSession, createSession } = useWorkbenchStore();
  const session = chat.sessions.find((s) => s.id === chat.activeSessionId) ?? chat.sessions[0];
  const activeAgent = session?.agentId ?? "rhythm_groove";
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (session && session.id !== chat.activeSessionId) {
      setActiveSession(session.id);
    }
  }, [chat.activeSessionId, session, setActiveSession]);

  const pushStep = useCallback((step: ReasoningStep, sessionId: string) => {
    for (const msg of stepToMessages(step)) {
      addMessage(sessionId, msg);
    }
    if (step.type === "complete" && step.clip_preview?.notes) {
      const reasoning = session?.messages.map((m) => m.text ?? "").filter(Boolean) ?? [];
      onClipGenerated?.(step.clip_preview.notes, reasoning);
    }
  }, [addMessage, onClipGenerated, session?.messages]);

  const streamViaHttp = useCallback(async (text: string, sessionId: string) => {
    updateSessionStatus(sessionId, "streaming");
    try {
      const data = await invoke<Record<string, unknown>>("send_agent_request", {
        endpoint: `agents/${activeAgent}`,
        body: { brief: text.trim(), session_context: { bpm: 142 } },
      });
      pushStep({ type: "status", message: `Routing to ${activeAgent}` }, sessionId);
      if (data.clip_preview) pushStep({ type: "midi", data: data.clip_preview, message: "Clip generated" }, sessionId);
      if (data.proposal) pushStep({ type: "advisory", proposal: data.proposal }, sessionId);
      if (data.arrangement) pushStep({ type: "reasoning", text: `Arrangement: ${JSON.stringify(data.arrangement).slice(0, 200)}` }, sessionId);
      const qa = data.qa as { pass?: boolean; score?: number; warnings?: string[] } | undefined;
      if (qa?.score != null) pushStep({ type: "qa_warning", text: `Quality score: ${qa.score.toFixed(0)}/100` }, sessionId);
      if (qa?.warnings) for (const w of qa.warnings.slice(0, 3)) pushStep({ type: "qa_warning", text: w }, sessionId);
      pushStep({ type: "complete", task_id: (data.task_id || crypto.randomUUID()) as string, clip_preview: data.clip_preview as ReasoningStep["clip_preview"] }, sessionId);
      updateSessionStatus(sessionId, "idle");
    } catch (err) {
      pushStep({ type: "error", message: `Backend error: ${String(err).slice(0, 120)}` }, sessionId);
      updateSessionStatus(sessionId, "error");
    }
  }, [activeAgent, pushStep, updateSessionStatus]);

  const streamViaWebSocket = useCallback(async (text: string, sessionId: string) => {
    updateSessionStatus(sessionId, "streaming");
    let completed = false;
    try {
      const ws = new WebSocket("ws://localhost:9876/ws/agent");
      wsRef.current = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: "brief", brief: text, agent_id: activeAgent, session_context: { bpm: 142, swing: 0.68 } }));
      await new Promise<void>((resolve, reject) => {
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as ReasoningStep;
            pushStep(data, sessionId);
            if (data.type === "complete") { completed = true; resolve(); }
            if (data.type === "error") { completed = true; reject(new Error(data.message || "Agent error")); }
          } catch { /* ignore parse errors */ }
        };
        ws.onerror = () => reject(new Error("WebSocket connection failed"));
        ws.onclose = () => { if (!completed) reject(new Error("WebSocket closed unexpectedly")); };
      });
      updateSessionStatus(sessionId, "idle");
    } catch (err) {
      pushStep({ type: "error", message: `WebSocket error: ${String(err).slice(0, 120)}` }, sessionId);
      await streamViaHttp(text, sessionId);
    } finally {
      wsRef.current?.close();
      wsRef.current = null;
    }
  }, [activeAgent, pushStep, streamViaHttp, updateSessionStatus]);

  const handleSend = useCallback((text: string) => {
    if (!session) return;
    addMessage(session.id, { id: crypto.randomUUID(), role: "user", text, createdAt: Date.now() });
    if (STREAMING_AGENTS.has(activeAgent)) {
      streamViaWebSocket(text, session.id);
    } else {
      streamViaHttp(text, session.id);
    }
  }, [activeAgent, addMessage, session, streamViaHttp, streamViaWebSocket]);

  const handleAgentChange = useCallback((agentId: string) => {
    createSession(agentId);
  }, [createSession]);

  const handleIterate = useCallback((text: string) => {
    handleSend(`${text}\n\nMake a variation while keeping the same vibe.`);
  }, [handleSend]);

  const handleTryAlternative = useCallback((direction: string) => {
    if (!session) return;
    handleSend(`Try this alternative direction: ${direction}`);
  }, [handleSend, session]);

  if (!session) return null;

  return (
    <div style={{ ...panelStyle(), display: "flex", flexDirection: "column", height: "100%", padding: 0 }}>
      <div style={{ padding: "10px 12px 0 12px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: BEEHIVE.text }}>Agent Director</div>
        <div style={{ fontSize: 11, color: BEEHIVE.textMuted }}>Natural-language creative collaborator</div>
      </div>
      <AgentMessageList messages={session.messages} onTryAlternative={handleTryAlternative} />
      <AgentComposer
        agents={AGENTS}
        activeAgent={activeAgent}
        onAgentChange={handleAgentChange}
        onSend={handleSend}
        onIterate={handleIterate}
        disabled={session.status === "streaming"}
      />
    </div>
  );
}
