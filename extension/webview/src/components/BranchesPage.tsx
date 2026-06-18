import { useState, useMemo } from "react";
import { useProjectStore } from "../stores/projectStore";
import { BranchSelector } from "./desktop/BranchSelector";
import { BranchDiffView } from "./desktop/BranchDiffView";

const COLORS = {
  bg: "#0f0f12",
  panel: "#18181c",
  border: "#2a2a30",
  accent: "#ff8c42",
  text: "#e0e0e0",
  textMuted: "#888",
};

export function BranchesPage() {
  const project = useProjectStore((s) => s.project);
  const clips = useProjectStore((s) => s.clips);
  const [compareBranchId, setCompareBranchId] = useState<string>("");

  const branches = useMemo(
    () => (project ? Object.values(project.branches) : []),
    [project]
  );

  const activeBranch = useMemo(
    () => branches.find((b) => b.id === project?.activeBranchId),
    [branches, project]
  );

  const compareBranch = useMemo(
    () => branches.find((b) => b.id === compareBranchId),
    [branches, compareBranchId]
  );

  const clipsA = useMemo(() => {
    if (!activeBranch) return clips;
    const ids = new Set(activeBranch.affectedClipIds);
    return clips.filter((c) => ids.has(c.id));
  }, [activeBranch, clips]);

  const clipsB = useMemo(() => {
    if (!compareBranch) return [];
    const ids = new Set(compareBranch.affectedClipIds);
    return clips.filter((c) => ids.has(c.id));
  }, [compareBranch, clips]);

  if (!project) {
    return (
      <div style={{ padding: 24, color: COLORS.textMuted }}>
        Open a project to manage branches.
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        backgroundColor: "var(--vscode-editor-background)",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${COLORS.border}`,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16, color: COLORS.text }}>Branches</h2>
        <BranchSelector onBranchChange={() => setCompareBranchId("")} />
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div
          style={{
            width: 240,
            borderRight: `1px solid ${COLORS.border}`,
            overflowY: "auto",
            padding: 8,
          }}
        >
          <div style={{ fontSize: 11, color: COLORS.textMuted, padding: "6px 8px" }}>
            Compare with
          </div>
          {branches.map((b) => {
            const active = b.id === project.activeBranchId;
            return (
              <div
                key={b.id}
                onClick={() => setCompareBranchId(b.id)}
                style={{
                  padding: "6px 8px",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 13,
                  color: active ? COLORS.accent : COLORS.text,
                  background:
                    compareBranchId === b.id ? "#2a2a30" : active ? "#1f1f24" : "transparent",
                  marginBottom: 2,
                }}
              >
                {active ? "● " : "○ "}
                {b.name}
              </div>
            );
          })}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {compareBranch ? (
            <>
              <div
                style={{
                  fontSize: 13,
                  color: COLORS.textMuted,
                  marginBottom: 12,
                }}
              >
                Comparing <strong style={{ color: COLORS.text }}>{activeBranch?.name ?? "current"}</strong>{" "}
                vs <strong style={{ color: COLORS.text }}>{compareBranch.name}</strong>
              </div>
              <BranchDiffView
                clipsA={clipsA}
                clipsB={clipsB}
                labelA={activeBranch?.name ?? "current"}
                labelB={compareBranch.name}
              />
            </>
          ) : (
            <div style={{ color: COLORS.textMuted, fontSize: 13 }}>
              Select a branch on the left to compare clip sets.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
