"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentPill } from "./AgentPill";
import { ThinkingDots } from "./ThinkingDots";

type AgentTier = "queen" | "worker" | "drone" | "forager" | "arrange";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  tier: AgentTier;
  agentId: string;
  content: string;
}

const COLORS: Record<AgentTier, string> = {
  queen: "var(--bh-agent-queen)",
  worker: "var(--bh-agent-worker)",
  drone: "var(--bh-agent-drone)",
  forager: "var(--bh-agent-forager)",
  arrange: "var(--bh-agent-arrange)",
};

function makeId() {
  return Math.random().toString(36).slice(2);
}

interface AgentMeta { id: string; label: string; tier: string; }

const WORKER_AGENTS = [
  { id: "rhythm_groove", label: "Rhythm & Groove" },
  { id: "melody", label: "Melody" },
  { id: "harmony", label: "Harmony" },
  { id: "drums", label: "Drums" },
];

const DRONE_AGENTS = [
  { id: "arrangement", label: "Arrangement" },
  { id: "style_reference", label: "Style Reference" },
  { id: "texture_atmosphere", label: "Texture & Atmosphere" },
  { id: "mix_master", label: "Mix & Master" },
];

const FORAGER_AGENTS = [
  { id: "taste_graph", label: "Taste Graph" },
  { id: "research", label: "Research" },
];

export function HiveChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [tier, setTier] = useState<AgentTier>("queen");
  const [workerAgent, setWorkerAgent] = useState("rhythm_groove");
  const [droneAgent, setDroneAgent] = useState("arrangement");
  const [foragerAgent, setForagerAgent] = useState("taste_graph");
  const [agentList, setAgentList] = useState<AgentMeta[]>([]);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [thinking, setThinking] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1000);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch("/tools/agents")
      .then((r) => r.json())
      .then((j) => setAgentList(j.agents ?? []))
      .catch(() => {});
  }, []);

  const agentId = useMemo(() => {
    if (tier === "queen") return "orchestrator";
    if (tier === "worker") return workerAgent;
    if (tier === "drone") return droneAgent;
    if (tier === "forager") return foragerAgent;
    if (tier === "arrange") return "arrangement";
    return "orchestrator";
  }, [tier, workerAgent, droneAgent, foragerAgent]);

  const scrollToBottom = () => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  const connect = useCallback(() => {
    if (wsRef.current || connecting) return;
    setConnecting(true);
    const ws = new WebSocket("ws://127.0.0.1:8000/ws/agent");
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setConnecting(false);
      backoffRef.current = 1000;
    };
    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      setThinking(false);
      setTimeout(connect, backoffRef.current);
      backoffRef.current = Math.min(backoffRef.current * 2, 15000);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "token") {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant") {
            return [...prev, { id: makeId(), role: "assistant", tier, agentId: data.agent, content: data.content }];
          }
          return [...prev.slice(0, -1), { ...last, content: last.content + data.content }];
        });
        setThinking(true);
        scrollToBottom();
      } else if (data.type === "done") {
        setThinking(false);
      }
    };
  }, [connecting, tier]);

  useEffect(() => {
    connect();
    return () => { wsRef.current?.close(); };
  }, [connect]);

  const send = () => {
    if (!input.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setMessages((prev) => [...prev, { id: makeId(), role: "user", tier, agentId, content: input }]);
    scrollToBottom();
    const historyPayload = messages.slice(-20).map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    }));
    wsRef.current.send(JSON.stringify({ type: "chat", agent: agentId, message: input, history: historyPayload, context: {} }));
    setInput("");
    setThinking(true);
  };

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--bh-panel)", borderLeft: "1px solid var(--bh-border)" }}>
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "var(--bh-border)" }}>
        <div className="flex items-center gap-2 flex-wrap">
          {(["queen", "worker", "drone", "forager", "arrange"] as AgentTier[]).map((t) => (
            <AgentPill
              key={t}
              tier={t}
              label={t === "queen" ? "Orchestrator" : t === "worker" ? "Workers" : t === "drone" ? "Drones" : t === "forager" ? "Foragers" : "Arrangement"}
              active={tier === t}
              onClick={() => setTier(t)}
            />
          ))}
          {tier === "worker" && (
            <select className="bh-select" value={workerAgent} onChange={(e) => setWorkerAgent(e.target.value)}>
              {WORKER_AGENTS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          )}
          {tier === "drone" && (
            <select className="bh-select" value={droneAgent} onChange={(e) => setDroneAgent(e.target.value)}>
              {DRONE_AGENTS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          )}
          {tier === "forager" && (
            <select className="bh-select" value={foragerAgent} onChange={(e) => setForagerAgent(e.target.value)}>
              {FORAGER_AGENTS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--bh-text-muted)" }}>
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"}`} />
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-y-auto bh-scrollable px-3 py-3 space-y-3 text-sm">
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "text-right" : "text-left"}>
            <div
              className="inline-block max-w-[90%] rounded-lg px-3 py-2 border text-left whitespace-pre-wrap"
              style={{
                borderColor: COLORS[m.tier],
                backgroundColor: m.role === "user" ? "var(--bh-bg)" : "var(--bh-bg-elevated)",
                color: "var(--bh-text)",
              }}
            >
              {m.content}
            </div>
          </div>
        ))}
        {thinking && <div className="mt-2"><ThinkingDots color={COLORS[tier]} /></div>}
      </div>

      <div className="border-t px-3 py-2" style={{ borderColor: "var(--bh-border)" }}>
        <div className="flex gap-2">
          <textarea
            className="bh-input flex-1 resize-none"
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask the hive..."
          />
          <button type="button" onClick={send} className="bh-btn bh-btn-accent self-end">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
