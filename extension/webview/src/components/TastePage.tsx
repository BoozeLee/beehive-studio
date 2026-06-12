import { useEffect, useState } from "react";
import { useAppStore } from "../stores/appStore";
import { useProjectStore } from "../stores/projectStore";
import * as api from "../lib/api";

export function TastePage() {
  const { project } = useProjectStore();
  const { addNotification } = useAppStore();
  const [nodes, setNodes] = useState<api.TasteNode[]>([]);
  const [edges, setEdges] = useState<api.TasteEdge[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!project) return;
    setLoading(true);
    api
      .getTasteGraph(project.id)
      .then((result) => {
        setNodes(result.nodes);
        setEdges(result.edges);
      })
      .catch((err) => addNotification(`Failed to load taste graph: ${String(err)}`, "error"))
      .finally(() => setLoading(false));
  }, [project, addNotification]);

  if (!project) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Taste Graph</h2>
        <div style={{ opacity: 0.7 }}>Open a project to view taste memory.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, height: "100%", overflow: "auto" }}>
      <h2 style={{ marginTop: 0 }}>🍯 Taste Graph</h2>
      {loading && <div>Loading...</div>}
      {!loading && nodes.length === 0 && (
        <div style={{ opacity: 0.7 }}>
          No taste memory yet. Like or reject clips in the Session View to build your taste graph.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
        {nodes.map((node) => (
          <div
            key={node.id}
            style={{
              padding: 12,
              border: "1px solid var(--vscode-panel-border)",
              borderRadius: 6,
              backgroundColor: "var(--vscode-panel-background)",
            }}
          >
            <div style={{ fontWeight: 600, color: node.kind === "rejected_idea" ? "#ef4444" : "#4ade80" }}>
              {node.kind}
            </div>
            <div>{node.label}</div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>{node.tags.join(", ")}</div>
          </div>
        ))}
      </div>
      {edges.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3>Edges</h3>
          {edges.map((edge) => (
            <div key={edge.id} style={{ fontSize: 12, opacity: 0.8 }}>
              {edge.sourceId} → {edge.targetId} ({edge.kind}, weight {edge.weight.toFixed(2)})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
