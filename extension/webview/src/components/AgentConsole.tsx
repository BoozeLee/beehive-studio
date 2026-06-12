import { useState } from "react";
import { useAppStore } from "../stores/appStore";
import { useProjectStore } from "../stores/projectStore";
import * as api from "../lib/api";

export function AgentConsole() {
  const { agents, sessions, addNotification } = useAppStore();
  const { project } = useProjectStore();
  const [selectedAgent, setSelectedAgent] = useState("");
  const [prompt, setPrompt] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  async function handleRun() {
    if (!project) {
      addNotification("Open a project first", "warning");
      return;
    }
    if (!selectedAgent) {
      addNotification("Select an agent", "warning");
      return;
    }
    if (!prompt.trim()) {
      addNotification("Enter a prompt", "warning");
      return;
    }
    setIsRunning(true);
    try {
      const session = await api.runAgent({
        agent: selectedAgent,
        brief: prompt,
        projectId: project.id,
      });
      addNotification(`Agent ${selectedAgent} finished: ${session.status}`, "success");
      setPrompt("");
    } catch (err) {
      addNotification(`Agent failed: ${String(err)}`, "error");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div style={{ padding: 16, height: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Agent Console</h2>

      <div style={{ display: "flex", gap: 8 }}>
        <select
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
          style={{
            padding: "6px 10px",
            backgroundColor: "var(--vscode-input-background)",
            color: "var(--vscode-input-foreground)",
            border: "1px solid var(--vscode-input-border)",
            borderRadius: 4,
          }}
        >
          <option value="">Select agent...</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="What should the agent do?"
          style={{
            flex: 1,
            padding: "6px 10px",
            backgroundColor: "var(--vscode-input-background)",
            color: "var(--vscode-input-foreground)",
            border: "1px solid var(--vscode-input-border)",
            borderRadius: 4,
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleRun();
            }
          }}
        />
        <button
          onClick={() => void handleRun()}
          disabled={isRunning}
          style={{
            padding: "6px 14px",
            background: "var(--vscode-button-background)",
            color: "var(--vscode-button-foreground)",
            border: "none",
            borderRadius: 4,
            cursor: isRunning ? "not-allowed" : "pointer",
            opacity: isRunning ? 0.6 : 1,
          }}
        >
          {isRunning ? "Running..." : "Run"}
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", borderTop: "1px solid var(--vscode-panel-border)", paddingTop: 12 }}>
        {sessions.length === 0 && (
          <div style={{ opacity: 0.7 }}>No sessions yet. Run an agent to see results here.</div>
        )}
        {sessions.map((session) => (
          <div
            key={session.id}
            style={{
              padding: 12,
              marginBottom: 8,
              border: "1px solid var(--vscode-panel-border)",
              borderRadius: 4,
              backgroundColor: "var(--vscode-panel-background)",
            }}
          >
            <div style={{ fontWeight: 600 }}>
              {session.agent} — {session.status}
            </div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{session.brief}</div>
            {session.reasoning.length > 0 && (
              <pre
                style={{
                  fontSize: 11,
                  backgroundColor: "var(--vscode-background)",
                  padding: 8,
                  borderRadius: 4,
                  maxHeight: 120,
                  overflow: "auto",
                }}
              >
                {session.reasoning.join("\n")}
              </pre>
            )}
            {session.artifacts.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                {session.artifacts.map((artifact) => (
                  <span key={artifact.id} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "var(--vscode-button-background)" }}>
                    {artifact.kind}: {artifact.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
