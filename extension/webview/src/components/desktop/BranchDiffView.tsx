import { useState, useEffect } from "react";

const COLORS = {
  bg: "#0f0f12",
  panel: "#18181c",
  border: "#2a2a30",
  accent: "#ff8c42",
  text: "#e0e0e0",
  textMuted: "#888",
  success: "#4ade80",
  error: "#ef4444",
  warning: "#fbbf24",
};

export interface ClipDiffEntry {
  id: string;
  name: string;
  status: "added" | "removed" | "modified";
  old_name?: string;
}

interface DiffableClip {
  id: string;
  name: string;
}

interface Props {
  clipsA: DiffableClip[];
  clipsB: DiffableClip[];
  labelA?: string;
  labelB?: string;
}

export function BranchDiffView({ clipsA, clipsB, labelA = "A", labelB = "B" }: Props) {
  const [diff, setDiff] = useState<ClipDiffEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadDiff();
  }, [clipsA, clipsB]);

  function loadDiff() {
    setLoading(true);
    setError("");
    try {
      const mapA = new Map(clipsA.map((c) => [c.id, c]));
      const mapB = new Map(clipsB.map((c) => [c.id, c]));

      const entries: ClipDiffEntry[] = [];

      for (const [id, clip] of mapB) {
        if (!mapA.has(id)) {
          entries.push({ id, name: clip.name, status: "added" });
        } else {
          const aClip = mapA.get(id)!;
          if (aClip.name !== clip.name) {
            entries.push({
              id,
              name: clip.name,
              status: "modified",
              old_name: aClip.name,
            });
          }
        }
      }
      for (const [id, clip] of mapA) {
        if (!mapB.has(id)) {
          entries.push({ id, name: clip.name, status: "removed" });
        }
      }

      setDiff(entries);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const statusColor = (s: string) =>
    s === "added" ? COLORS.success : s === "removed" ? COLORS.error : COLORS.warning;

  const statusLabel = (s: string) =>
    s === "added" ? "Added" : s === "removed" ? "Removed" : "Modified";

  if (loading) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: COLORS.textMuted }}>
        Comparing branches...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: COLORS.error }}>
        Diff error: {error}
      </div>
    );
  }

  if (diff.length === 0) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: COLORS.textMuted }}>
        No differences between {labelA} and {labelB}.
      </div>
    );
  }

  const added = diff.filter((d) => d.status === "added").length;
  const removed = diff.filter((d) => d.status === "removed").length;
  const modified = diff.filter((d) => d.status === "modified").length;

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "6px 8px",
          fontSize: 11,
          color: COLORS.textMuted,
          borderBottom: `1px solid ${COLORS.border}`,
          marginBottom: 6,
        }}
      >
        <span style={{ color: COLORS.success }}>+{added}</span>
        <span style={{ color: COLORS.error }}>-{removed}</span>
        <span style={{ color: COLORS.warning }}>~{modified}</span>
        <span style={{ marginLeft: "auto" }}>
          {diff.length} clip{diff.length !== 1 ? "s" : ""} different
        </span>
      </div>
      {diff.map((entry) => (
        <div
          key={entry.id}
          style={{
            padding: "5px 8px",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 6,
            borderLeft: `3px solid ${statusColor(entry.status)}`,
            marginBottom: 2,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: statusColor(entry.status),
              minWidth: 50,
            }}
          >
            {statusLabel(entry.status)}
          </span>
          <span style={{ color: COLORS.text }}>{entry.name}</span>
          {entry.old_name && (
            <span style={{ color: COLORS.textMuted, fontSize: 11 }}>
              (was "{entry.old_name}")
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
