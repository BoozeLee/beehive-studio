import type { BuildJob } from "../../../../../src/services/types";

interface BuildPlanReviewProps {
  job: BuildJob | null;
  loading: boolean;
  error: string | null;
  onApprove: () => void;
  onReject: () => void;
}

export function BuildPlanReview({
  job,
  loading,
  error,
  onApprove,
  onReject,
}: BuildPlanReviewProps) {
  if (!job) {
    return <div style={{ padding: 16, color: "var(--jb-text-muted)" }}>Run Ctrl+Shift+G to create a supervised build plan.</div>;
  }

  const plan = job.plan;
  return (
    <div style={{ padding: 12, overflow: "auto", height: "100%", color: "var(--jb-text)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
        <div>
          <strong>Build Plan</strong>
          <div style={{ color: "var(--jb-text-muted)", fontSize: 11 }}>
            {job.status} · revision {plan.projectRevision} · {plan.degraded ? "degraded" : "Hive supervised"}
          </div>
        </div>
        {job.status === "awaiting_approval" && (
          <div style={{ display: "flex", gap: 6 }}>
            <button className="jetbee-toolbtn" onClick={onReject} disabled={loading}>Reject</button>
            <button className="jetbee-toolbtn" data-active="true" onClick={onApprove} disabled={loading}>Approve & Build</button>
          </div>
        )}
      </div>

      <div style={{ padding: 10, background: "var(--jb-bg)", border: "1px solid var(--jb-border)", borderRadius: 4 }}>
        {plan.summary}
      </div>

      {plan.warnings.length > 0 && (
        <div style={{ marginTop: 10, color: "var(--jb-warning)" }}>
          {plan.warnings.map((warning) => <div key={warning}>Warning: {warning}</div>)}
        </div>
      )}

      <h4>Proposed Patches ({plan.proposedPatches.length})</h4>
      {plan.proposedPatches.length === 0 && <div style={{ color: "var(--jb-text-muted)" }}>No project mutation proposed.</div>}
      {plan.proposedPatches.map((patch) => (
        <div key={patch.id} style={{ marginBottom: 8, padding: 8, border: "1px solid var(--jb-border)", borderRadius: 4 }}>
          <strong>{patch.risk.toUpperCase()}</strong>
          {patch.operations.map((operation, index) => (
            <div key={`${patch.id}-${index}`} style={{ fontFamily: "var(--jb-font-mono)", fontSize: 11 }}>
              {operation.op} {operation.artifactId} {operation.path}
            </div>
          ))}
        </div>
      ))}

      <h4>Execution</h4>
      {plan.executionSteps.map((step) => <div key={step.id}>{step.kind}: {step.label}</div>)}

      {job.status === "running" && <progress value={job.progress} max={1} style={{ width: "100%", marginTop: 12 }} />}
      {error && <div style={{ color: "var(--jb-error)", marginTop: 12 }}>{error}</div>}
    </div>
  );
}
