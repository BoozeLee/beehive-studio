import { useState } from "react";
import { useAppStore } from "../stores/appStore";
import { useProjectStore } from "../stores/projectStore";
import { useTransportStore } from "../stores/transportStore";
import * as api from "../lib/api";
import { PublishDialog } from "./desktop/PublishDialog/PublishDialog";
import { ExploreDialog } from "./desktop/ExploreDialog/ExploreDialog";

export function Dashboard() {
  const { gatewayHealth, orchestratorHealth, agents, sessions, setRoute, addNotification, setExportDialogOpen } = useAppStore();
  const { project, buildJobs } = useProjectStore();
  const { toggle } = useTransportStore();
  const [publishOpen, setPublishOpen] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);

  async function handleAskAgent() {
    if (!project) {
      addNotification("Open a project first", "warning");
      return;
    }
    setRoute("/agent");
  }

  async function handleQuickAgent(agentId: string) {
    if (!project) {
      addNotification("Open a project first", "warning");
      return;
    }
    try {
      const session = await api.runAgent({
        agent: agentId,
        brief: "Generate a 4-bar idea",
        projectId: project.id,
      });
      addNotification(`Agent ${agentId} completed`, "success");
      console.log(session);
    } catch (err) {
      addNotification(`Agent failed: ${String(err)}`, "error");
    }
  }

  return (
    <div style={{ padding: 24, overflow: "auto", height: "100%" }}>
      <h1 style={{ marginTop: 0 }}>Dashboard</h1>

      {!project && (
        <div
          style={{
            padding: 24,
            border: "1px dashed var(--vscode-panel-border)",
            borderRadius: 8,
            textAlign: "center",
            opacity: 0.7,
          }}
        >
          No project open. Use the command palette or tree view to open a Beehive project.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        <Card title="Backend Health">
          <HealthRow label="Gateway" ready={gatewayHealth?.providers?.some((p) => p.ready) ?? false} />
          <HealthRow label="Orchestrator" ready={orchestratorHealth?.status === "ok"} />
          <HealthRow label="Ollama" ready={orchestratorHealth?.ollama_available ?? false} />
        </Card>

        <Card title="Project">
          <div>{project ? project.name : "—"}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>BPM: {project?.bpm ?? 140}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Branches: {project ? Object.keys(project.branches).length : 0}</div>
        </Card>

        <Card title="Quick Actions">
          <button onClick={toggle}>▶ Toggle Transport</button>
          <button onClick={handleAskAgent}>🤖 Ask Agent</button>
          <button onClick={() => setRoute("/taste")}>🍯 Open Taste Graph</button>
          <button onClick={() => setExportDialogOpen(true)}>💾 Export Audio</button>
          <button onClick={() => setPublishOpen(true)}>🌐 Publish to MixHive</button>
          <button onClick={() => setExploreOpen(true)}>🔎 Explore MixHive</button>
        </Card>

        <Card title="Recent Sessions">
          {sessions.length === 0 && <div style={{ opacity: 0.7 }}>No sessions yet</div>}
          {sessions.slice(0, 5).map((s) => (
            <div key={s.id} style={{ fontSize: 12 }}>
              {s.agent}: {s.brief.slice(0, 30)} {s.status}
            </div>
          ))}
        </Card>

        <Card title="Build Jobs">
          {buildJobs.length === 0 && <div style={{ opacity: 0.7 }}>No builds yet</div>}
          {buildJobs.slice(0, 5).map((j) => (
            <div key={j.id} style={{ fontSize: 12 }}>
              {j.id.slice(0, 8)} — {j.status} ({Math.round(j.progress * 100)}%)
            </div>
          ))}
        </Card>

        <Card title="Agents">
          {agents.map((agent) => (
            <div key={agent.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span>{agent.name}</span>
              <button style={{ padding: "2px 6px", fontSize: 11 }} onClick={() => handleQuickAgent(agent.id)}>
                Run
              </button>
            </div>
          ))}
        </Card>
      </div>

      <PublishDialog
        isOpen={publishOpen}
        onClose={() => setPublishOpen(false)}
        defaultTitle={project?.name}
        defaultBpm={project?.bpm}
      />
      <ExploreDialog isOpen={exploreOpen} onClose={() => setExploreOpen(false)} />
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 16,
        border: "1px solid var(--vscode-panel-border)",
        borderRadius: 6,
        backgroundColor: "var(--vscode-panel-background)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <h3 style={{ margin: 0, fontSize: 14 }}>{title}</h3>
      {children}
    </div>
  );
}

function HealthRow({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
      <span style={{ color: ready ? "#4ade80" : "#ef4444" }}>●</span>
      <span>{label}</span>
    </div>
  );
}
