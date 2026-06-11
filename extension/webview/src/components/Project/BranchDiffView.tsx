import { useState, useEffect } from "react";
import { readClipsAt, type ClipDiffEntry } from "../../lib/projectGitClient";
import { BEEHIVE } from "../../lib/theme";

interface Props {
  projectName: string;
  branchA: string;
  branchB: string;
}

export function BranchDiffView({ projectName, branchA, branchB }: Props) {
  const [diff, setDiff] = useState<ClipDiffEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!projectName || !branchA || !branchB) return;
    loadDiff();
  }, [projectName, branchA, branchB]);

  async function loadDiff() {
    setLoading(true);
    setError("");
    try {
      const [rawA, rawB] = await Promise.all([
        readClipsAt(projectName, branchA),
        readClipsAt(projectName, branchB),
      ]);
      const clipsA: Array<{ id: string; name: string }> = JSON.parse(rawA);
      const clipsB: Array<{ id: string; name: string }> = JSON.parse(rawB);

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
    s === "added" ? BEEHIVE.success : s === "removed" ? BEEHIVE.error : BEEHIVE.warning;

  const statusLabel = (s: string) =>
    s === "added" ? "Added" : s === "removed" ? "Removed" : "Modified";

  if (loading) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: BEEHIVE.textMuted }}>
        Comparing branches...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: BEEHIVE.error }}>
        Diff error: {error}
      </div>
    );
  }

  if (diff.length === 0) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: BEEHIVE.textMuted }}>
        No differences between these branches.
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
          color: BEEHIVE.textMuted,
          borderBottom: `1px solid ${BEEHIVE.border}`,
          marginBottom: 6,
        }}
      >
        <span style={{ color: BEEHIVE.success }}>+{added}</span>
        <span style={{ color: BEEHIVE.error }}>-{removed}</span>
        <span style={{ color: BEEHIVE.warning }}>~{modified}</span>
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
          <span style={{ color: BEEHIVE.text }}>{entry.name}</span>
          {entry.old_name && (
            <span style={{ color: BEEHIVE.textMuted, fontSize: 11 }}>
              (was "{entry.old_name}")
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
