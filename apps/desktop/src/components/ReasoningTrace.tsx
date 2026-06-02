import React, { useState, useCallback } from "react";

const COLORS = {
  bg: "#0f0f12",
  panel: "#18181c",
  border: "#2a2a30",
  accent: "#ff8c42",
  text: "#e0e0e0",
  textMuted: "#888",
  reasoningStep: "#2d4a3e",
  toolCall: "#3d2d4a",
  error: "#4a2d2d",
  success: "#2d4a2d",
};

export interface ReasoningStep {
  type: "reasoning" | "tool_call" | "status" | "error" | "complete";
  text?: string;
  name?: string;
  args?: Record<string, unknown>;
  message?: string;
}

interface ReasoningTraceProps {
  steps: ReasoningStep[];
  title?: string;
  maxHeight?: number;
}

export const ReasoningTrace: React.FC<ReasoningTraceProps> = ({
  steps,
  title = "Agent Reasoning",
  maxHeight = 300,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  const toggleStep = useCallback((index: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const stepStyle = useCallback((type: ReasoningStep["type"]): React.CSSProperties => {
    switch (type) {
      case "tool_call":
        return { background: COLORS.toolCall };
      case "error":
        return { background: COLORS.error };
      case "complete":
        return { background: COLORS.success };
      default:
        return { background: COLORS.reasoningStep };
    }
  }, []);

  const stepIcon = useCallback((type: ReasoningStep["type"]): string => {
    switch (type) {
      case "reasoning":
        return "◆";
      case "tool_call":
        return "⚙";
      case "status":
        return "○";
      case "error":
        return "✕";
      case "complete":
        return "✓";
      default:
        return "•";
    }
  }, []);

  const formatToolArgs = useCallback((args?: Record<string, unknown>): string => {
    if (!args) return "";
    try {
      return JSON.stringify(args, null, 2);
    } catch {
      return String(args);
    }
  }, []);

  return (
    <div
      style={{
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        background: COLORS.bg,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: `1px solid ${COLORS.border}`,
          background: COLORS.panel,
          cursor: "pointer",
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span
          style={{
            fontSize: 12,
            color: COLORS.accent,
            transition: "transform 0.2s",
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
            display: "inline-block",
            width: 12,
          }}
        >
          ▼
        </span>
        <span style={{ fontSize: 11, color: COLORS.text, fontWeight: 600 }}>
          {title}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: COLORS.textMuted }}>
          {steps.length} steps
        </span>
      </div>

      {!collapsed && (
        <div
          style={{
            maxHeight,
            overflow: "auto",
            padding: 8,
          }}
        >
          {steps.length === 0 ? (
            <div
              style={{
                fontSize: 11,
                color: COLORS.textMuted,
                fontStyle: "italic",
                padding: 8,
                textAlign: "center",
              }}
            >
              No reasoning steps yet
            </div>
          ) : (
            steps.map((step, index) => (
              <div key={index}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "6px 8px",
                    marginBottom: 4,
                    borderRadius: 4,
                    ...stepStyle(step.type),
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      color: COLORS.accent,
                      minWidth: 16,
                      textAlign: "center",
                    }}
                  >
                    {stepIcon(step.type)}
                  </span>

                  <div style={{ flex: 1 }}>
                    {step.type === "tool_call" && step.name ? (
                      <div>
                        <span
                          style={{ fontSize: 11, color: COLORS.text, fontWeight: 600 }}
                        >
                          {step.name}
                        </span>
                        {step.args && Object.keys(step.args).length > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleStep(index);
                            }}
                            style={{
                              marginLeft: 8,
                              padding: "1px 6px",
                              fontSize: 9,
                              background: "rgba(255,255,255,0.1)",
                              border: "none",
                              borderRadius: 3,
                              color: COLORS.textMuted,
                              cursor: "pointer",
                            }}
                          >
                            {expandedSteps.has(index) ? "hide" : "args"}
                          </button>
                        )}
                        {expandedSteps.has(index) && step.args && (
                          <pre
                            style={{
                              fontSize: 10,
                              color: COLORS.textMuted,
                              marginTop: 4,
                              padding: 4,
                              background: "rgba(0,0,0,0.3)",
                              borderRadius: 3,
                              overflow: "auto",
                              maxHeight: 100,
                            }}
                          >
                            {formatToolArgs(step.args)}
                          </pre>
                        )}
                      </div>
                    ) : step.type === "error" ? (
                      <span style={{ fontSize: 11, color: "#ff6b6b" }}>
                        {step.message || step.text}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: COLORS.text }}>
                        {step.text || step.message}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export function useStreamingReasoning(onComplete?: (steps: ReasoningStep[]) => void) {
  const [steps, setSteps] = useState<ReasoningStep[]>([]);
  const [currentText, setCurrentText] = useState("");

  const addStep = useCallback((step: ReasoningStep) => {
    setSteps((prev) => [...prev, step]);
  }, []);

  const appendReasoning = useCallback((text: string) => {
    setCurrentText((prev) => prev + text);
    if (text.trim()) {
      addStep({ type: "reasoning", text });
    }
  }, [addStep]);

  const complete = useCallback(() => {
    addStep({ type: "complete", text: "Processing complete" });
    onComplete?.(steps);
  }, [steps, addStep, onComplete]);

  const clear = useCallback(() => {
    setSteps([]);
    setCurrentText("");
  }, []);

  return {
    steps,
    currentText,
    addStep,
    appendReasoning,
    complete,
    clear,
  };
}