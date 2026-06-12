import { useEffect, useState } from "react";
import type { TasteNode } from "../../../../../packages/core-models/index";
import { queryTaste } from "../../lib/tasteGraphApi";

interface Props {
  projectId: string;
}

export function TastePanel({ projectId }: Props) {
  const [nodes, setNodes] = useState<TasteNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    queryTaste(projectId, "", undefined, 10)
      .then((result) => setNodes(result.nodes))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [projectId]);

  return (
    <div style={{ padding: 12, fontSize: 12, color: "#e0e0e0", height: "100%", overflow: "auto" }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>🍯 Taste Memory</div>
      {loading && <div style={{ color: "#888" }}>Loading...</div>}
      {error && <div style={{ color: "#ef4444" }}>{error}</div>}
      {nodes.length === 0 && !loading && (
        <div style={{ color: "#888" }}>
          No taste memory yet. Like or reject clips in the Session View to build it.
        </div>
      )}
      {nodes.map((n) => (
        <div
          key={n.id}
          style={{
            marginBottom: 6,
            padding: 6,
            background: "#18181c",
            borderRadius: 4,
          }}
        >
          <span style={{ color: n.kind === "rejected_idea" ? "#ef4444" : "#4ade80" }}>●</span>{" "}
          {n.label} <span style={{ color: "#888" }}>({n.kind})</span>
        </div>
      ))}
    </div>
  );
}
