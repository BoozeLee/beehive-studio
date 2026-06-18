import { useAppStore } from "../stores/appStore";
import { useProjectStore } from "../stores/projectStore";
import * as api from "../lib/api";
import { TransportBar } from "./TransportBar";

export function TopBar() {
  const { gatewayHealth, orchestratorHealth, addNotification, setExportDialogOpen } = useAppStore();
  const { project, clips } = useProjectStore();

  const gatewayReady = gatewayHealth?.providers?.some((p) => p.ready) ?? false;
  const orchestratorReady = orchestratorHealth?.status === "ok";

  async function handleBuild() {
    if (!project) {
      addNotification("Open a project first", "warning");
      return;
    }
    try {
      const job = await api.createBuild(project.id, {
        projectId: project.id,
        projectRevision: 0,
        intent: "Build from VS Code extension",
        source: "api",
        selectedArtifactIds: [],
        artifacts: [],
        compilerPreference: "auto",
        allowCloud: false,
        cloudApproved: false,
      });
      addNotification(`Build ${job.id.slice(0, 8)} started`, "info");
    } catch (err) {
      addNotification(`Build failed: ${String(err)}`, "error");
    }
  }

  return (
    <header
      style={{
        height: 40,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 12px",
        backgroundColor: "var(--vscode-panel-background)",
        borderBottom: "1px solid var(--vscode-panel-border)",
      }}
    >
      <strong>🐝 Beehive Studio</strong>
      <span style={{ color: "var(--vscode-foreground)", opacity: 0.7 }}>
        {project ? project.name : "No project"}
      </span>
      <span style={{ flex: 1 }} />
      <span
        title="Gateway status"
        style={{ color: gatewayReady ? "#4ade80" : "#ef4444", fontSize: 12 }}
      >
        ● Gateway
      </span>
      <span
        title="Orchestrator status"
        style={{ color: orchestratorReady ? "#4ade80" : "#ef4444", fontSize: 12 }}
      >
        ● Orchestrator
      </span>
      <span style={{ fontSize: 12, opacity: 0.7 }}>{clips.length} clips</span>
      <TransportBar />
      <button
        onClick={handleBuild}
        style={{
          padding: "4px 10px",
          background: "var(--vscode-button-background)",
          color: "var(--vscode-button-foreground)",
          border: "none",
          borderRadius: 4,
          cursor: "pointer",
        }}
      >
        🔨 Build
      </button>
      <button
        onClick={() => setExportDialogOpen(true)}
        style={{
          padding: "4px 10px",
          background: "var(--vscode-button-background)",
          color: "var(--vscode-button-foreground)",
          border: "none",
          borderRadius: 4,
          cursor: "pointer",
        }}
      >
        💾 Export
      </button>
    </header>
  );
}
