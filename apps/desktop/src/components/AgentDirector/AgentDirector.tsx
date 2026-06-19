import React, { useState, useCallback, useEffect, useRef, useLayoutEffect } from "react";
import { BEEHIVE, commonStyles, panelStyle } from "../../lib/theme";
import { invoke } from "@tauri-apps/api/core";
import { ScrollablePanel } from "../Layout/ScrollablePanel";

interface ReasoningStep {
  type: "status" | "reasoning" | "tool_call" | "midi" | "arrangement" | "qa_warning" | "advisory" | "complete" | "error";
  text?: string;
  message?: string;
  name?: string;
  args?: Record<string, unknown>;
  data?: unknown;
  task_id?: string;
  clip_preview?: { notes: Array<{ pitch: number; velocity: number; start: number; duration: number }> };
  proposal?: AdvisoryProposal;
}

interface AdvisoryProposal {
  status?: string;
  degraded?: boolean;
  attribution?: {
    service?: string;
    model?: string;
    profile?: string;
    prompt_versions?: Record<string, string>;
    latency_ms?: number;
  };
  creative_plan?: {
    summary?: string;
    rationale?: string[];
    confidence?: Record<string, number>;
    alternatives?: Array<{ direction?: string; why?: string; delta_summary?: string }>;
    warnings?: string[];
    evidence?: string[];
  };
}

interface HistoryEntry {
  timestamp: number;
  agentId: string;
  brief: string;
  steps: ReasoningStep[];
  accepted: boolean | null;
}

interface AgentDirectorProps {
  bpm?: number;
  onClipGenerated?: (notes: Array<{ pitch: number; velocity: number; start: number; duration: number }>, reasoning: string[]) => void;
}

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

export function AgentDirector({ bpm = 142, onClipGenerated }: AgentDirectorProps) {
  useLayoutEffect(() => {
    const id = "beehive-agent-director-styles";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `@keyframes beehive-spin{to{transform:rotate(360deg)}}`;
    document.head.appendChild(style);
  }, []);

  const [brief, setBrief] = useState(
    "Generate a rolling 130 BPM acid techno bassline in C minor, 4 bars, swing 0.15, density 0.75, darkness 0.6"
  );
  const [isLoading, setIsLoading] = useState(false);
  const [activeAgent, setActiveAgent] = useState("rhythm_groove");
  const [reasoning, setReasoning] = useState<ReasoningStep[]>([]);
  const [status, setStatus] = useState("Ready");
  const logRef = useRef<HTMLDivElement>(null);
  const [showContext, setShowContext] = useState(false);
  const [agentMemory, setAgentMemory] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [reasoning]);

  const streamViaWebSocket = useCallback(
    async (text: string) => {
      setIsLoading(true);
      setReasoning([]);
      const steps: ReasoningStep[] = [];
      const pushStep = (s: ReasoningStep) => {
        steps.push(s);
        setReasoning([...steps]);
      };

      try {
        const ws = new WebSocket("ws://localhost:9876/ws/agent");
        wsRef.current = ws;

        ws.onopen = () => {
          ws.send(JSON.stringify({
            type: "brief",
            brief: text,
            agent_id: activeAgent,
            session_context: { bpm, swing: 0.15 },
          }));
        };

        await new Promise<void>((resolve, reject) => {
          ws.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              pushStep(data as ReasoningStep);

              if (data.type === "complete") {
                if (data.clip_preview?.notes && onClipGenerated) {
                  onClipGenerated(data.clip_preview.notes, (data.reasoning as string[]) || []);
                }
                resolve();
              }
              if (data.type === "error") {
                reject(new Error(data.message || "Agent error"));
              }
            } catch (e) {
              // ignore parse errors
            }
          };

          ws.onerror = () => reject(new Error("WebSocket connection failed"));
          ws.onclose = () => {
            // Check if we got a complete event already
            if (!steps.some((s) => s.type === "complete")) {
              reject(new Error("WebSocket closed unexpectedly"));
            }
          };
        });

        setStatus("Agent complete — review and accept");
        setAgentMemory((prev) => [...prev.slice(-9), text.slice(0, 80)]);
      } catch (err) {
        pushStep({
          type: "error",
          message: `WebSocket error: ${String(err).slice(0, 120)}`,
        });
        setStatus("Streaming failed — is backend running?");
        // Try HTTP fallback
        await streamViaHttp(text, steps, pushStep);
      } finally {
        wsRef.current?.close();
        wsRef.current = null;
        setIsLoading(false);
      }
    },
    [activeAgent, bpm, onClipGenerated]
  );

  const streamViaHttp = useCallback(
    async (
      text: string,
      steps: ReasoningStep[],
      pushStep: (s: ReasoningStep) => void
    ) => {
      setIsLoading(true);
      setStatus(`${AGENTS.find((a) => a.id === activeAgent)?.label || "Agent"} working...`);

      try {
        if (activeAgent === "mix_master") {
          const data = await invoke<Record<string, unknown>>("send_agent_request", {
            endpoint: "agents/mix_master",
            body: { brief: text.trim(), session_context: { bpm, swing: 0.15 } },
          });

          pushStep({ type: "status", message: "Routing to Mix Master agent" });
          pushStep({ type: "reasoning", text: `Mix Master analyzing...` });

          const report = data.mix_report as Record<string, unknown> | undefined;
          if (report?.master) {
            const master = report.master as Record<string, unknown>;
            pushStep({ type: "reasoning", text: `Master level: ${master.master_level}dBFS` });
            pushStep({ type: "reasoning", text: `Compression: ${master.compression}` });
            pushStep({ type: "reasoning", text: `Reverb: ${master.reverb}` });
          }
          if (report?.tracks) {
            const tracks = report.tracks as Array<Record<string, unknown>>;
            for (const t of tracks.slice(0, 4)) {
              pushStep({ type: "reasoning", text: `Track "${t.track}": ${t.level_range}, ${t.eq}` });
            }
          }

          pushStep({ type: "complete", task_id: (data.task_id || crypto.randomUUID()) as string });
          setStatus("Mix analysis complete");
        } else {
          const data = await invoke<Record<string, unknown>>("send_agent_request", {
            endpoint: `agents/${activeAgent}`,
            body: {
              brief: text.trim(),
              session_context: { bpm, swing: 0.15 },
            },
          });

          pushStep({ type: "status", message: `Routing to ${activeAgent} agent` });
          pushStep({ type: "reasoning", text: `${AGENTS.find((a) => a.id === activeAgent)?.label} processing...` });

          if (data.clip_preview) {
            pushStep({ type: "midi", data: data.clip_preview, message: "Clip generated" });
          }
          if (data.proposal) {
            pushStep({ type: "advisory", proposal: data.proposal as AdvisoryProposal });
          }
          if (data.arrangement) {
            pushStep({ type: "reasoning", text: `Arrangement: ${JSON.stringify(data.arrangement).slice(0, 200)}` });
          }

          const qa = data.qa as { pass?: boolean; score?: number; warnings?: string[] } | undefined;
          if (qa) {
            const qaScore = typeof qa.score === "number" ? qa.score : null;
            if (qaScore !== null) {
              pushStep({ type: "qa_warning", text: `Quality score: ${qaScore.toFixed(0)}/100` });
            }
            if (qa.warnings && qa.warnings.length > 0) {
              for (const w of qa.warnings.slice(0, 3)) {
                pushStep({ type: "qa_warning", text: w });
              }
            }
          }

          pushStep({ type: "complete", task_id: (data.task_id || crypto.randomUUID()) as string });
          setStatus("Agent complete");

          const cp = data.clip_preview as { notes?: Array<{ pitch: number; velocity: number; start: number; duration: number }> } | undefined;
          if (cp?.notes && onClipGenerated) {
            onClipGenerated(cp.notes, steps.filter((s) => s.text).map((s) => s.text!));
          }
        }
      } catch (err) {
        pushStep({ type: "error", message: `Backend error: ${String(err).slice(0, 120)}` });
        setStatus("Agent error — is backend running on port 9876?");
      }
    },
    [activeAgent, bpm, onClipGenerated]
  );

  const streamAgent = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setIsLoading(true);
      setReasoning([]);
      setStatus(`${AGENTS.find((a) => a.id === activeAgent)?.label || "Agent"} thinking...`);

      if (STREAMING_AGENTS.has(activeAgent)) {
        await streamViaWebSocket(text);
      } else {
        const steps: ReasoningStep[] = [];
        const pushStep = (s: ReasoningStep) => {
          steps.push(s);
          setReasoning([...steps]);
        };
        await streamViaHttp(text, steps, pushStep);
      }
    },
    [activeAgent, streamViaWebSocket, streamViaHttp]
  );

  const acceptCurrent = useCallback(() => {
    if (reasoning.length === 0) return;
    setHistory((prev) => [
      ...prev,
      {
        timestamp: Date.now(),
        agentId: activeAgent,
        brief,
        steps: reasoning,
        accepted: true,
      },
    ]);
    setReasoning([]);
    setStatus("Accepted ✓");
  }, [reasoning, activeAgent, brief]);

  const rejectCurrent = useCallback(() => {
    if (reasoning.length === 0) return;
    setHistory((prev) => [
      ...prev,
      {
        timestamp: Date.now(),
        agentId: activeAgent,
        brief,
        steps: reasoning,
        accepted: false,
      },
    ]);
    setReasoning([]);
    setStatus("Rejected ✕");
  }, [reasoning, activeAgent, brief]);

  const explainLastAction = useCallback(async () => {
    const lastAccepted = [...history].reverse().find((h) => h.accepted)?.steps
      .filter((s) => s.text)
      .map((s) => s.text)
      .join("\n");
    if (!lastAccepted) {
      setStatus("No accepted actions to explain");
      return;
    }
    setStatus("Requesting explanation...");
    streamAgent(`Explain this creative decision briefly: "${lastAccepted.slice(0, 300)}" — what musical logic was applied?`);
  }, [history, streamAgent]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      streamAgent(brief);
    }
  };

  return (
    <div style={{ ...panelStyle(), display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: `linear-gradient(135deg, ${BEEHIVE.comb}, ${BEEHIVE.amber})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            fontWeight: 800,
            color: "#000",
          }}
        >
          B
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: BEEHIVE.text }}>
            Agent Director
          </h2>
          <p style={{ margin: 0, fontSize: 11, color: BEEHIVE.textMuted }}>
            AI creative collaborator — reasoning shown in real time
          </p>
        </div>
      </div>

      <ScrollablePanel ref={logRef} gap={8} style={{ flex: 1, paddingRight: 4 }}>
        {/* Agent selector */}
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 10,
            flexWrap: "wrap",
          }}
        >
        {AGENTS.map((agent) => (
          <button
            key={agent.id}
            onClick={() => setActiveAgent(agent.id)}
            style={{
              ...commonStyles.toolBtn,
              background: activeAgent === agent.id ? agent.color : "transparent",
              color: activeAgent === agent.id ? "#000" : BEEHIVE.text,
              borderColor: agent.color,
              fontWeight: activeAgent === agent.id ? 700 : 400,
              fontSize: 10,
            }}
          >
            {agent.icon} {agent.label}
          </button>
        ))}
      </div>

      {/* Brief input */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Describe what you want the ${AGENTS.find((a) => a.id === activeAgent)?.label || "agent"} to create...`}
          disabled={isLoading}
          style={{
            ...commonStyles.input,
            height: 60,
            flex: 1,
          }}
        />
      </div>

      {/* Action buttons */}
      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => streamAgent(brief)}
          disabled={isLoading || !brief.trim()}
          style={{
            ...commonStyles.toolBtn,
            background: isLoading ? BEEHIVE.smoke : BEEHIVE.comb,
            color: "#000",
            fontWeight: 700,
            padding: "6px 16px",
            opacity: isLoading || !brief.trim() ? 0.5 : 1,
          }}
        >
          {isLoading ? "Generating..." : "Generate"}
        </button>
        <button
          onClick={acceptCurrent}
          disabled={reasoning.length === 0}
          style={{
            ...commonStyles.toolBtn,
            background: BEEHIVE.success,
            color: "#000",
            opacity: reasoning.length === 0 ? 0.5 : 1,
          }}
        >
          ✓ Accept
        </button>
        <button
          onClick={rejectCurrent}
          disabled={reasoning.length === 0}
          style={{
            ...commonStyles.toolBtn,
            background: BEEHIVE.error,
            color: "#fff",
            opacity: reasoning.length === 0 ? 0.5 : 1,
          }}
        >
          ✕ Reject
        </button>
        <button
          disabled={isLoading || !brief.trim()}
          onClick={() => streamAgent(brief + " (variation, keep the vibe)")}
          style={{
            ...commonStyles.toolBtn,
            opacity: isLoading || !brief.trim() ? 0.5 : 1,
          }}
        >
          🔄 Iterate
        </button>
        <button
          onClick={explainLastAction}
          disabled={history.length === 0}
          style={{
            ...commonStyles.toolBtn,
            opacity: history.length === 0 ? 0.5 : 1,
          }}
          title="Explain the last accepted action"
        >
          💬 Explain
        </button>
        <button
          onClick={() => setShowContext(!showContext)}
          style={{
            ...commonStyles.toolBtn,
            background: showContext ? BEEHIVE.glow : "transparent",
          }}
        >
          {showContext ? "Hide" : "Show"} Context
        </button>
        <button
          onClick={() => setShowHistory(!showHistory)}
          style={{
            ...commonStyles.toolBtn,
            background: showHistory ? BEEHIVE.glow : "transparent",
          }}
        >
          {showHistory ? "Hide" : "History"} ({history.length})
        </button>
      </div>

      {/* Agent memory / context */}
      {showContext && (
        <div
          style={{
            marginBottom: 10,
            padding: 8,
            background: BEEHIVE.bg,
            borderRadius: 6,
            maxHeight: 80,
            overflow: "auto",
          }}
        >
          <div style={{ fontSize: 10, color: BEEHIVE.textMuted, marginBottom: 4 }}>
            Agent Memory (last 10 interactions)
          </div>
          {agentMemory.length === 0 ? (
            <div style={{ fontSize: 10, color: BEEHIVE.textMuted, fontStyle: "italic" }}>
              No previous interactions in this session
            </div>
          ) : (
            agentMemory.map((mem, i) => (
              <div key={i} style={{ fontSize: 10, color: BEEHIVE.textMuted, marginBottom: 2 }}>
                • {mem}
              </div>
            ))
          )}
        </div>
      )}

      {/* Status bar */}
      <div
        style={{
          padding: "6px 10px",
          background: BEEHIVE.bg,
          borderRadius: 6,
          marginBottom: 8,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: isLoading ? BEEHIVE.warning : reasoning.some((s) => s.type === "error") ? BEEHIVE.error : BEEHIVE.success,
          }}
        />
        <span style={{ fontSize: 11, color: BEEHIVE.textMuted }}>{status}</span>
      </div>

      {/* Reasoning stream */}
      <div
        style={{
          flex: showHistory ? "0 0 auto" : 1,
          background: BEEHIVE.bg,
          borderRadius: 6,
          padding: 10,
          fontSize: 12,
          lineHeight: 1.5,
          minHeight: showHistory ? 80 : 120,
        }}
      >
        {reasoning.length === 0 && !isLoading && (
          <div style={{ color: BEEHIVE.textMuted, fontStyle: "italic", textAlign: "center", paddingTop: 20 }}>
            Send a brief to see the agent's reasoning in real time
          </div>
        )}
        {reasoning.map((step, i) => {
          switch (step.type) {
            case "status":
              return (
                <div key={i} style={{ color: BEEHIVE.textMuted, marginBottom: 4 }}>
                  ⏳ {step.message}
                </div>
              );
            case "reasoning":
              return (
                <div key={i} style={{ color: BEEHIVE.text, marginBottom: 4, paddingLeft: 12, borderLeft: `2px solid ${BEEHIVE.comb}22` }}>
                  💭 {step.text}
                </div>
              );
            case "tool_call":
              return (
                <div key={i} style={{ color: BEEHIVE.honey, marginBottom: 4, fontFamily: "monospace", fontSize: 11, padding: "3px 8px", background: `${BEEHIVE.honey}11`, borderRadius: 4 }}>
                  🔧 <strong>{step.name}</strong>({step.args ? JSON.stringify(step.args).slice(0, 120) : ""})
                </div>
              );
            case "midi":
              return (
                <div key={i} style={{ color: BEEHIVE.success, marginBottom: 4 }}>
                  🎵 MIDI data generated {step.message ? `— ${step.message}` : ""}
                </div>
              );
            case "qa_warning":
              return (
                <div key={i} style={{ color: BEEHIVE.warning, marginBottom: 4, padding: "4px 8px", background: `${BEEHIVE.warning}11`, borderRadius: 4, fontSize: 11 }}>
                  ⚠️ {step.text}
                </div>
              );
            case "advisory": {
              const proposal = step.proposal;
              const plan = proposal?.creative_plan;
              const attribution = proposal?.attribution;
              const confidence = plan?.confidence?.overall;
              return (
                <details
                  key={i}
                  style={{
                    marginBottom: 6,
                    padding: "7px 9px",
                    borderRadius: 5,
                    background: proposal?.degraded ? `${BEEHIVE.warning}11` : `${BEEHIVE.comb}11`,
                    borderLeft: `3px solid ${proposal?.degraded ? BEEHIVE.warning : BEEHIVE.comb}`,
                  }}
                >
                  <summary style={{ cursor: "pointer", color: BEEHIVE.text }}>
                    {proposal?.degraded ? "Degraded tools-only proposal" : `${attribution?.model || "Hive 999"} advisory`}
                    {typeof confidence === "number" ? ` · ${Math.round(confidence * 100)}% confidence` : ""}
                    {plan?.summary ? ` · ${plan.summary}` : ""}
                  </summary>
                  <div style={{ marginTop: 7, color: BEEHIVE.textMuted, fontSize: 11 }}>
                    <div>
                      Service: {attribution?.service || "unknown"} · Profile: {attribution?.profile || "unknown"} ·
                      Latency: {attribution?.latency_ms ?? 0}ms
                    </div>
                    {plan?.rationale?.map((item, index) => <div key={`r-${index}`}>Rationale: {item}</div>)}
                    {plan?.warnings?.map((item, index) => <div key={`w-${index}`} style={{ color: BEEHIVE.warning }}>Warning: {item}</div>)}
                    {plan?.alternatives?.map((item, index) => (
                      <button
                        key={`a-${index}`}
                        onClick={() => streamAgent(`${brief}\nIteration direction: ${item.direction || item.delta_summary || "alternative"}`)}
                        style={{ ...commonStyles.toolBtn, marginTop: 5, marginRight: 5, fontSize: 10 }}
                      >
                        Try: {item.direction || "alternative"}
                      </button>
                    ))}
                    {plan?.evidence?.length ? <div style={{ marginTop: 5 }}>Evidence: {plan.evidence.join(" · ")}</div> : null}
                  </div>
                </details>
              );
            }
            case "complete":
              return (
                <div
                  key={i}
                  style={{
                    color: BEEHIVE.comb,
                    fontWeight: 600,
                    marginTop: 8,
                    padding: "8px 12px",
                    background: BEEHIVE.glow,
                    borderRadius: 6,
                  }}
                >
                  ✓ Task complete{step.task_id ? ` (${step.task_id.slice(0, 8)})` : ""}
                  {step.clip_preview?.notes && (
                    <span style={{ color: BEEHIVE.textMuted, fontWeight: 400, marginLeft: 8 }}>
                      {step.clip_preview.notes.length} notes generated
                    </span>
                  )}
                </div>
              );
            case "error":
              return (
                <div key={i} style={{ color: BEEHIVE.error, marginBottom: 4, padding: "6px 10px", background: `${BEEHIVE.error}11`, borderRadius: 4 }}>
                  ⚠️ {step.message}
                </div>
              );
            default:
              return null;
          }
        })}
        {isLoading && (
          <div style={{ color: BEEHIVE.warning, marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: 12, height: 12, borderRadius: "50%",
              border: `2px solid ${BEEHIVE.warning}`,
              borderTopColor: "transparent",
              animation: "beehive-spin 0.8s linear infinite",
              display: "inline-block",
            }} />
            {AGENTS.find((a) => a.id === activeAgent)?.label} processing...
          </div>
        )}
      </div>

      {/* Action History */}
      {showHistory && (
        <div
          style={{
            marginTop: 8,
            flex: 1,
            overflow: "auto",
            background: BEEHIVE.bg,
            borderRadius: 6,
            padding: 10,
            fontSize: 11,
          }}
        >
          <div style={{ fontWeight: 600, color: BEEHIVE.textMuted, marginBottom: 6, fontSize: 11 }}>
            Agent Action History ({history.length})
          </div>
          {history.length === 0 ? (
            <div style={{ color: BEEHIVE.textMuted, fontStyle: "italic" }}>
              No actions yet. Accept or reject agent output to record history.
            </div>
          ) : (
            [...history].reverse().map((entry, i) => (
              <div
                key={i}
                style={{
                  padding: "6px 8px",
                  marginBottom: 4,
                  background: entry.accepted ? `${BEEHIVE.success}11` : `${BEEHIVE.error}11`,
                  borderRadius: 4,
                  borderLeft: `3px solid ${entry.accepted ? BEEHIVE.success : BEEHIVE.error}`,
                }}
              >
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
                  <span style={{ color: entry.accepted ? BEEHIVE.success : BEEHIVE.error, fontWeight: 700 }}>
                    {entry.accepted ? "✓" : "✕"}
                  </span>
                  <span style={{ color: BEEHIVE.text, fontWeight: 600 }}>
                    {AGENTS.find((a) => a.id === entry.agentId)?.label || entry.agentId}
                  </span>
                  <span style={{ color: BEEHIVE.textMuted, marginLeft: "auto", fontSize: 10 }}>
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div style={{ color: BEEHIVE.textMuted, fontSize: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  "{entry.brief.slice(0, 80)}{entry.brief.length > 80 ? "..." : ""}"
                </div>
              </div>
            ))
          )}
        </div>
      )}
      </ScrollablePanel>
    </div>
  );
}
