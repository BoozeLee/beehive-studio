import React from "react";
import type { HiveProposal } from "../../lib/useHiveAdvisor";

interface ProposalPanelProps {
  proposal: HiveProposal | null;
  isLoading?: boolean;
  error?: string | null;
  onApply?: () => void;
  onDismiss?: () => void;
}

export function ProposalPanel({ proposal, isLoading, error, onApply, onDismiss }: ProposalPanelProps) {
  if (isLoading) {
    return (
      <div style={{ padding: 16, color: "var(--jb-text-muted)", fontSize: 13 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ animation: "beehive-spin 1s linear infinite", display: "inline-block" }}>🐝</span>
          Consulting Hive 999 Marco-o1…
        </div>
      </div>
    );
  }

  if (error && !proposal) {
    return (
      <div style={{ padding: 16, color: "var(--jb-error)", fontSize: 13 }}>
        <strong>Hive 999 Error</strong>
        <div style={{ marginTop: 4 }}>{error}</div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div style={{ padding: 16, color: "var(--jb-text-muted)", fontSize: 13, fontStyle: "italic" }}>
        No advisory proposal yet. Generate music to receive a Hive 999 creative plan.
      </div>
    );
  }

  const plan = proposal.creative_plan;
  const degraded = proposal.degraded;
  const overallConfidence = plan?.confidence?.overall ?? 0;

  return (
    <div style={{ padding: 12, fontSize: 13, color: "var(--jb-text)", overflow: "auto", height: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>🐝</span>
          <span style={{ fontWeight: 700, color: degraded ? "var(--jb-warning)" : "var(--jb-accent)" }}>
            Hive 999 {degraded ? "(Degraded)" : "Advisory"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {onApply && (
            <button className="jetbee-toolbtn" onClick={onApply} title="Apply proposal parameters">
              Apply
            </button>
          )}
          {onDismiss && (
            <button className="jetbee-toolbtn" onClick={onDismiss} title="Dismiss proposal">
              Dismiss
            </button>
          )}
        </div>
      </div>

      {/* Confidence bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--jb-text-muted)", marginBottom: 4 }}>
          <span>Confidence</span>
          <span>{Math.round(overallConfidence * 100)}%</span>
        </div>
        <div style={{ height: 4, background: "var(--jb-border)", borderRadius: 2, overflow: "hidden" }}>
          <div
            style={{
              width: `${Math.round(overallConfidence * 100)}%`,
              height: "100%",
              background: overallConfidence >= 0.8 ? "var(--jb-success)" : overallConfidence >= 0.5 ? "var(--jb-warning)" : "var(--jb-error)",
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>

      {/* Summary */}
      {plan?.summary && (
        <div style={{ marginBottom: 12, padding: 10, background: "var(--jb-bg)", borderRadius: 6, border: "1px solid var(--jb-border)" }}>
          <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 12, textTransform: "uppercase", color: "var(--jb-text-muted)", letterSpacing: 0.5 }}>
            Summary
          </div>
          <div style={{ lineHeight: 1.5 }}>{plan.summary}</div>
        </div>
      )}

      {/* Rationale */}
      {plan?.rationale && plan.rationale.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12, textTransform: "uppercase", color: "var(--jb-text-muted)", letterSpacing: 0.5 }}>
            Rationale
          </div>
          {plan.rationale.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4, lineHeight: 1.5 }}>
              <span style={{ color: "var(--jb-accent)", flexShrink: 0 }}>→</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}

      {/* Warnings */}
      {plan?.warnings && plan.warnings.length > 0 && (
        <div style={{ marginBottom: 12, padding: 10, background: "rgba(239,68,68,0.08)", borderRadius: 6, border: "1px solid var(--jb-error)" }}>
          <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 12, textTransform: "uppercase", color: "var(--jb-error)", letterSpacing: 0.5 }}>
            Warnings
          </div>
          {plan.warnings.map((w, i) => (
            <div key={i} style={{ color: "var(--jb-error)", marginBottom: 2 }}>• {w}</div>
          ))}
        </div>
      )}

      {/* Alternatives */}
      {plan?.alternatives && plan.alternatives.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12, textTransform: "uppercase", color: "var(--jb-text-muted)", letterSpacing: 0.5 }}>
            Alternatives
          </div>
          {plan.alternatives.map((alt, i) => (
            <div key={i} style={{ padding: 8, background: "var(--jb-bg)", borderRadius: 4, marginBottom: 6, border: "1px solid var(--jb-border)" }}>
              <div style={{ fontWeight: 600, color: "var(--jb-accent)" }}>{alt.direction}</div>
              {alt.why && <div style={{ marginTop: 2, color: "var(--jb-text-muted)" }}>{alt.why}</div>}
              {alt.delta_summary && <div style={{ marginTop: 2, fontSize: 11 }}>{alt.delta_summary}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Evidence */}
      {plan?.evidence && plan.evidence.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12, textTransform: "uppercase", color: "var(--jb-text-muted)", letterSpacing: 0.5 }}>
            Evidence
          </div>
          {plan.evidence.map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 3, fontSize: 12, color: "var(--jb-text-muted)" }}>
              <span>•</span>
              <span>{e}</span>
            </div>
          ))}
        </div>
      )}

      {/* Attribution footer */}
      {proposal.attribution && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--jb-border)", fontSize: 11, color: "var(--jb-text-muted)" }}>
          <div>Model: {proposal.attribution.model} ({proposal.attribution.profile})</div>
          {proposal.attribution.latency_ms !== undefined && (
            <div>Latency: {proposal.attribution.latency_ms}ms</div>
          )}
          <div>Prompt: {proposal.attribution.prompt_versions?.specialist ?? "unknown"}</div>
        </div>
      )}
    </div>
  );
}
