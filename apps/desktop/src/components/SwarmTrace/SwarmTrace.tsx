import { useState } from "react";

export interface SwarmStep {
  id: string;
  agentId: string;
  agentLabel: string;
  agentColor: string;
  timestamp: number;
  type: "thinking" | "tool_call" | "result" | "error" | "complete";
  message: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  durationMs?: number;
}

interface SwarmTraceProps {
  steps: SwarmStep[];
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function SwarmTrace({ steps }: SwarmTraceProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div className="jetbee-panel-header">
        <span>Swarm Trace</span>
        <span style={{ fontSize: 10, color: "var(--jb-text-faint)", textTransform: "none", letterSpacing: 0 }}>
          {steps.length} steps
        </span>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
        {steps.length === 0 && (
          <div style={{ color: "var(--jb-text-faint)", fontStyle: "italic", textAlign: "center", paddingTop: 20, fontSize: 12 }}>
            No swarm activity yet.
          </div>
        )}
        {steps.map((step) => {
          const isExpanded = expanded.has(step.id);
          const icon =
            step.type === "thinking"
              ? "💭"
              : step.type === "tool_call"
              ? "🔧"
              : step.type === "result"
              ? "✓"
              : step.type === "error"
              ? "⚠"
              : "●";

          return (
            <div
              key={step.id}
              style={{
                marginBottom: 6,
                padding: "6px 8px",
                borderRadius: 4,
                background: "var(--jb-bg-elevated)",
                borderLeft: `3px solid ${step.agentColor}`,
                cursor: step.toolArgs ? "pointer" : "default",
              }}
              onClick={() => step.toolArgs && toggle(step.id)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 11 }}>{icon}</span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: step.agentColor,
                  }}
                >
                  {step.agentLabel}
                </span>
                <span style={{ fontSize: 10, color: "var(--jb-text-faint)", marginLeft: "auto" }}>
                  {formatTime(step.timestamp)}
                  {step.durationMs !== undefined && (
                    <span style={{ marginLeft: 6 }}>{step.durationMs}ms</span>
                  )}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--jb-text)", lineHeight: 1.4 }}>
                {step.message}
              </div>
              {step.toolName && (
                <div style={{ fontSize: 10, color: "var(--jb-honey)", marginTop: 2, fontFamily: "var(--jb-font-mono)" }}>
                  {step.toolName}()
                </div>
              )}
              {isExpanded && step.toolArgs && (
                <pre
                  style={{
                    margin: "4px 0 0",
                    padding: 6,
                    fontSize: 10,
                    fontFamily: "var(--jb-font-mono)",
                    color: "var(--jb-text-muted)",
                    background: "var(--jb-bg)",
                    borderRadius: 4,
                    overflow: "auto",
                  }}
                >
                  {JSON.stringify(step.toolArgs, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
