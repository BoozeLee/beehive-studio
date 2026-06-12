import React, { useState, useCallback, useEffect, useRef, useLayoutEffect } from "react";
import { BEEHIVE, commonStyles, panelStyle } from "../../lib/theme";
import { useAgentStore, ReasoningStep, HistoryEntry, AdvisoryProposal } from "../../stores/agentStore";

const BACKEND_URL = "http://127.0.0.1:9876";
const PROJECT_ID = "default";

const STREAMING_AGENTS = new Set(["rhythm_groove", "melody", "harmony", "arrangement"]);

const AGENTS = [
  { id: "rhythm_groove", label: "Rhythm & Groove", color: BEEHIVE.comb, icon: "🎵" },
  { id: "melody", label: "Melody", color: BEEHIVE.honey, icon: "🎶" },
  { id: "harmony", label: "Harmony", color: "#6366f1", icon: "🎹" },
  { id: "drums", label: "Drums", color: "#ef4444", icon: "🥁" },
  { id: "arrangement", label: "Arrangement", color: "#10b981", icon: "📐" },
  { id: "style_reference", label: "Style Ref", color: "#a855f7", icon: "🎨" },
  { id: "texture_atmosphere", label: "Texture", color: "#06b6d4", icon: "🌫️" },
  { id: "mix_master", label: "Mix Master", color: "#f59e0b", icon: "🎛️" },
];

export function AgentDirector() {
  useLayoutEffect(() => {
    const id = "beehive-agent-director-styles";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `@keyframes beehive-spin{to{transform:rotate(360deg)}}`;
    document.head.appendChild(style);
  }, []);

  const store = useAgentStore();
  const [brief, setBrief] = useState("");
  const [showContext, setShowContext] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [store.reasoning]);

  const streamViaWebSocket = useCallback(
    async (text: string) => {
      store.setLoading(true);
      store.clearReasoning();
      const steps: ReasoningStep[] = [];
      const pushStep = (s: ReasoningStep) => {
        steps.push(s);
        store.addStep(s);
      };

      try {
        const ws = new WebSocket(`ws://127.0.0.1:9876/projects/${PROJECT_ID}/events`);
        wsRef.current = ws;

        ws.onopen = () => {
          ws.send(JSON.stringify({
            action: "subscribe",
            agent_id: store.activeAgent,
            brief: text,
          }));
        };

        await new Promise<void>((resolve, reject) => {
          ws.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              pushStep(data as ReasoningStep);

              if (data.type === "complete" || data.type === "build.completed") {
                resolve();
              }
              if (data.type === "error" || data.type === "build.failed") {
                reject(new Error(data.message || data.error || "Agent error"));
              }
            } catch (e) {
              // ignore parse errors
            }
          };

          ws.onerror = () => reject(new Error("WebSocket connection failed"));
          ws.onclose = () => {
            if (!steps.some((s) => s.type === "complete")) {
              reject(new Error("WebSocket closed unexpectedly"));
            }
          };
        });

        store.setStatus("Agent complete — review and accept");
        store.pushMemory(text.slice(0, 80));
      } catch (err) {
        pushStep({
          type: "error",
          message: `WebSocket error: ${String(err).slice(0, 120)}`,
        });
        store.setStatus("Streaming failed — trying HTTP fallback...");
        await streamViaHttp(text, steps, pushStep);
      } finally {
        wsRef.current?.close();
        wsRef.current = null;
        store.setLoading(false);
      }
    },
    [store]
  );

  const streamViaHttp = useCallback(
    async (
      text: string,
      steps: ReasoningStep[],
      pushStep: (s: ReasoningStep) => void
    ) => {
      store.setLoading(true);
      store.setStatus(`${AGENTS.find((a) => a.id === store.activeAgent)?.label || "Agent"} working...`);

      try {
        if (store.activeAgent === "mix_master") {
          const res = await fetch(`${BACKEND_URL}/hive999/advise`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ brief: text.trim(), session_context: { bpm: 142 } }),
          });
          const data = await res.json();

          pushStep({ type: "status", message: "Routing to Mix Master agent" });
          pushStep({ type: "reasoning", text: `Mix Master analyzing...` });

          if (data.creative_plan?.summary) {
            pushStep({ type: "reasoning", text: `Plan: ${data.creative_plan.summary}` });
          }
          if (data.creative_plan?.rationale) {
            for (const r of data.creative_plan.rationale.slice(0, 3)) {
              pushStep({ type: "reasoning", text: r });
            }
          }

          pushStep({ type: "complete", task_id: crypto.randomUUID() });
          store.setStatus("Mix analysis complete");
        } else {
          const res = await fetch(`${BACKEND_URL}/projects/${PROJECT_ID}/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: text.trim(),
              backend: "acestep",
              duration: 30,
            }),
          });
          const data = await res.json();

          pushStep({ type: "status", message: `Routing to ${store.activeAgent} agent` });
          pushStep({ type: "reasoning", text: `${AGENTS.find((a) => a.id === store.activeAgent)?.label} processing...` });

          if (data.task_id) {
            pushStep({ type: "midi", message: `Task queued: ${data.task_id}` });
          }
          if (data.proposal) {
            pushStep({ type: "advisory", proposal: data.proposal as AdvisoryProposal });
          }

          pushStep({ type: "complete", task_id: data.task_id || crypto.randomUUID() });
          store.setStatus("Agent complete");
        }
      } catch (err) {
        pushStep({ type: "error", message: `Backend error: ${String(err).slice(0, 120)}` });
        store.setStatus("Agent error — is backend running on port 9876?");
      } finally {
        store.setLoading(false);
      }
    },
    [store]
  );

  const streamAgent = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      store.setLoading(true);
      store.clearReasoning();
      store.setStatus(`${AGENTS.find((a) => a.id === store.activeAgent)?.label || "Agent"} thinking...`);

      if (STREAMING_AGENTS.has(store.activeAgent)) {
        await streamViaWebSocket(text);
      } else {
        const steps: ReasoningStep[] = [];
        const pushStep = (s: ReasoningStep) => {
          steps.push(s);
          store.addStep(s);
        };
        await streamViaHttp(text, steps, pushStep);
      }
    },
    [store, streamViaWebSocket, streamViaHttp]
  );

  const acceptCurrent = useCallback(() => {
    if (store.reasoning.length === 0) return;
    store.pushHistory({
      timestamp: Date.now(),
      agentId: store.activeAgent,
      brief,
      steps: store.reasoning,
      accepted: true,
    });
    store.clearReasoning();
    store.setStatus("Accepted ✓");
  }, [store, brief]);

  const rejectCurrent = useCallback(() => {
    if (store.reasoning.length === 0) return;
    store.pushHistory({
      timestamp: Date.now(),
      agentId: store.activeAgent,
      brief,
      steps: store.reasoning,
      accepted: false,
    });
    store.clearReasoning();
    store.setStatus("Rejected ✕");
  }, [store, brief]);

  const explainLastAction = useCallback(async () => {
    const lastAccepted = [...store.history].reverse().find((h) => h.accepted)?.steps
      .filter((s) => s.text)
      .map((s) => s.text)
      .join("\n");
    if (!lastAccepted) {
      store.setStatus("No accepted actions to explain");
      return;
    }
    store.setStatus("Requesting explanation...");
    streamAgent(`Explain this creative decision briefly: "${lastAccepted.slice(0, 300)}" — what musical logic was applied?`);
  }, [store, streamAgent]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      streamAgent(brief);
    }
  };

  return (
    <div style={{ ...panelStyle(), display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: `linear-gradient(135deg, ${BEEHIVE.comb}, ${BEEHIVE.amber})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, fontWeight: 800, color: "#000",
        }}>B</div>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: BEEHIVE.text }}>Agent Director</h2>
          <p style={{ margin: 0, fontSize: 11, color: BEEHIVE.textMuted }}>AI creative collaborator — reasoning shown in real time</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
        {AGENTS.map((agent) => (
          <button
            key={agent.id}
            onClick={() => store.setActiveAgent(agent.id)}
            style={{
              ...commonStyles.toolBtn,
              background: store.activeAgent === agent.id ? agent.color : "transparent",
              color: store.activeAgent === agent.id ? "#000" : BEEHIVE.text,
              borderColor: agent.color,
              fontWeight: store.activeAgent === agent.id ? 700 : 400,
              fontSize: 10,
            }}
          >
            {agent.icon} {agent.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Describe what you want the ${AGENTS.find((a) => a.id === store.activeAgent)?.label || "agent"} to create...`}
          disabled={store.isLoading}
          style={{ ...commonStyles.input, height: 60, flex: 1 }}
        />
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        <button
          onClick={() => streamAgent(brief)}
          disabled={store.isLoading || !brief.trim()}
          style={{
            ...commonStyles.toolBtn,
            background: store.isLoading ? BEEHIVE.smoke : BEEHIVE.comb,
            color: "#000",
            fontWeight: 700,
            padding: "6px 16px",
            opacity: store.isLoading || !brief.trim() ? 0.5 : 1,
          }}
        >
          {store.isLoading ? "Generating..." : "Generate"}
        </button>
        <button onClick={acceptCurrent} disabled={store.reasoning.length === 0}
          style={{ ...commonStyles.toolBtn, background: BEEHIVE.success, color: "#000", opacity: store.reasoning.length === 0 ? 0.5 : 1 }}>
          ✓ Accept
        </button>
        <button onClick={rejectCurrent} disabled={store.reasoning.length === 0}
          style={{ ...commonStyles.toolBtn, background: BEEHIVE.error, color: "#fff", opacity: store.reasoning.length === 0 ? 0.5 : 1 }}>
          ✕ Reject
        </button>
        <button disabled={store.isLoading || !brief.trim()}
          onClick={() => streamAgent(brief + " (variation, keep the vibe)")}
          style={{ ...commonStyles.toolBtn, opacity: store.isLoading || !brief.trim() ? 0.5 : 1 }}>
          🔄 Iterate
        </button>
        <button onClick={explainLastAction} disabled={store.history.length === 0}
          style={{ ...commonStyles.toolBtn, opacity: store.history.length === 0 ? 0.5 : 1 }}>
          💬 Explain
        </button>
        <button onClick={() => setShowContext(!showContext)}
          style={{ ...commonStyles.toolBtn, background: showContext ? BEEHIVE.glow : "transparent" }}>
          {showContext ? "Hide" : "Show"} Context
        </button>
        <button onClick={() => setShowHistory(!showHistory)}
          style={{ ...commonStyles.toolBtn, background: showHistory ? BEEHIVE.glow : "transparent" }}>
          {showHistory ? "Hide" : "History"} ({store.history.length})
        </button>
      </div>

      {showContext && (
        <div style={{ marginBottom: 10, padding: 8, background: BEEHIVE.bg, borderRadius: 6, maxHeight: 80, overflow: "auto" }}>
          <div style={{ fontSize: 10, color: BEEHIVE.textMuted, marginBottom: 4 }}>Agent Memory (last 10 interactions)</div>
          {store.agentMemory.length === 0 ? (
            <div style={{ fontSize: 10, color: BEEHIVE.textMuted, fontStyle: "italic" }}>No previous interactions in this session</div>
          ) : (
            store.agentMemory.map((mem, i) => (
              <div key={i} style={{ fontSize: 10, color: BEEHIVE.textMuted, marginBottom: 2 }}>• {mem}</div>
            ))
          )}
        </div>
      )}

      <div style={{ padding: "6px 10px", background: BEEHIVE.bg, borderRadius: 6, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: store.isLoading ? BEEHIVE.warning : store.reasoning.some((s) => s.type === "error") ? BEEHIVE.error : BEEHIVE.success,
        }} />
        <span style={{ fontSize: 11, color: BEEHIVE.textMuted }}>{store.status}</span>
      </div>

      <div ref={logRef} style={{
        flex: showHistory ? "0 0 auto" : 1,
        overflow: "auto", background: BEEHIVE.bg, borderRadius: 6,
        padding: 10, fontSize: 12, lineHeight: 1.5,
        minHeight: showHistory ? 80 : 120,
        maxHeight: showHistory ? 200 : "none",
      }}>
        {store.reasoning.length === 0 && !store.isLoading && (
          <div style={{ color: BEEHIVE.textMuted, fontStyle: "italic", textAlign: "center", paddingTop: 20 }}>
            Send a brief to see the agent's reasoning in real time
          </div>
        )}
        {store.reasoning.map((step, i) => {
          switch (step.type) {
            case "status":
              return <div key={i} style={{ color: BEEHIVE.textMuted, marginBottom: 4 }}>⏳ {step.message}</div>;
            case "reasoning":
              return <div key={i} style={{ color: BEEHIVE.text, marginBottom: 4, paddingLeft: 12, borderLeft: `2px solid ${BEEHIVE.comb}22` }}>💭 {step.text}</div>;
            case "tool_call":
              return <div key={i} style={{ color: BEEHIVE.honey, marginBottom: 4, fontFamily: "monospace", fontSize: 11, padding: "3px 8px", background: `${BEEHIVE.honey}11`, borderRadius: 4 }}>
                🔧 <strong>{step.name}</strong>({step.args ? JSON.stringify(step.args).slice(0, 120) : ""})
              </div>;
            case "midi":
              return <div key={i} style={{ color: BEEHIVE.success, marginBottom: 4 }}>🎵 MIDI data generated {step.message ? `— ${step.message}` : ""}</div>;
            case "qa_warning":
              return <div key={i} style={{ color: BEEHIVE.warning, marginBottom: 4, padding: "4px 8px", background: `${BEEHIVE.warning}11`, borderRadius: 4, fontSize: 11 }}>⚠️ {step.text}</div>;
            case "advisory": {
              const proposal = step.proposal;
              const plan = proposal?.creative_plan;
              const attribution = proposal?.attribution;
              const confidence = plan?.confidence?.overall;
              return (
                <details key={i} style={{ marginBottom: 6, padding: "7px 9px", borderRadius: 5, background: proposal?.degraded ? `${BEEHIVE.warning}11` : `${BEEHIVE.comb}11`, borderLeft: `3px solid ${proposal?.degraded ? BEEHIVE.warning : BEEHIVE.comb}` }}>
                  <summary style={{ cursor: "pointer", color: BEEHIVE.text }}>
                    {proposal?.degraded ? "Degraded tools-only proposal" : `${attribution?.model || "Hive 999"} advisory`}
                    {typeof confidence === "number" ? ` · ${Math.round(confidence * 100)}% confidence` : ""}
                    {plan?.summary ? ` · ${plan.summary}` : ""}
                  </summary>
                  <div style={{ marginTop: 7, color: BEEHIVE.textMuted, fontSize: 11 }}>
                    <div>Service: {attribution?.service || "unknown"} · Profile: {attribution?.profile || "unknown"}</div>
                    {plan?.rationale?.map((item: string, index: number) => <div key={index}>Rationale: {item}</div>)}
                    {plan?.warnings?.map((item: string, index: number) => <div key={index} style={{ color: BEEHIVE.warning }}>Warning: {item}</div>)}
                    {plan?.alternatives?.map((item: { direction?: string; delta_summary?: string }, index: number) => (
                      <button key={index} onClick={() => streamAgent(`${brief}\nIteration direction: ${item.direction || item.delta_summary || "alternative"}`)}
                        style={{ ...commonStyles.toolBtn, marginTop: 5, marginRight: 5, fontSize: 10 }}>
                        Try: {item.direction || "alternative"}
                      </button>
                    ))}
                  </div>
                </details>
              );
            }
            case "complete":
              return <div key={i} style={{ color: BEEHIVE.comb, fontWeight: 600, marginTop: 8, padding: "8px 12px", background: BEEHIVE.glow, borderRadius: 6 }}>
                ✓ Task complete{step.task_id ? ` (${step.task_id.slice(0, 8)})` : ""}
                {step.clip_preview?.notes && <span style={{ color: BEEHIVE.textMuted, fontWeight: 400, marginLeft: 8 }}>{step.clip_preview.notes.length} notes generated</span>}
              </div>;
            case "error":
              return <div key={i} style={{ color: BEEHIVE.error, marginBottom: 4, padding: "6px 10px", background: `${BEEHIVE.error}11`, borderRadius: 4 }}>⚠️ {step.message}</div>;
            default:
              return null;
          }
        })}
        {store.isLoading && (
          <div style={{ color: BEEHIVE.warning, marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", border: `2px solid ${BEEHIVE.warning}`, borderTopColor: "transparent", animation: "beehive-spin 0.8s linear infinite", display: "inline-block" }} />
            {AGENTS.find((a) => a.id === store.activeAgent)?.label} processing...
          </div>
        )}
      </div>

      {showHistory && (
        <div style={{ marginTop: 8, flex: 1, overflow: "auto", background: BEEHIVE.bg, borderRadius: 6, padding: 10, fontSize: 11 }}>
          <div style={{ fontWeight: 600, color: BEEHIVE.textMuted, marginBottom: 6, fontSize: 11 }}>Agent Action History ({store.history.length})</div>
          {store.history.length === 0 ? (
            <div style={{ color: BEEHIVE.textMuted, fontStyle: "italic" }}>No actions yet. Accept or reject agent output to record history.</div>
          ) : (
            [...store.history].reverse().map((entry, i) => (
              <div key={i} style={{ padding: "6px 8px", marginBottom: 4, background: entry.accepted ? `${BEEHIVE.success}11` : `${BEEHIVE.error}11`, borderRadius: 4, borderLeft: `3px solid ${entry.accepted ? BEEHIVE.success : BEEHIVE.error}` }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
                  <span style={{ color: entry.accepted ? BEEHIVE.success : BEEHIVE.error, fontWeight: 700 }}>{entry.accepted ? "✓" : "✕"}</span>
                  <span style={{ color: BEEHIVE.text, fontWeight: 600 }}>{AGENTS.find((a) => a.id === entry.agentId)?.label || entry.agentId}</span>
                  <span style={{ color: BEEHIVE.textMuted, marginLeft: "auto", fontSize: 10 }}>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                </div>
                <div style={{ color: BEEHIVE.textMuted, fontSize: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  "{entry.brief.slice(0, 80)}{entry.brief.length > 80 ? "..." : ""}"
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
