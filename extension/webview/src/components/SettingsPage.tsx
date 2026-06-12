import { useState } from "react";
import { useAppStore } from "../stores/appStore";
import * as api from "../lib/api";

export function SettingsPage() {
  const { gatewayHealth, orchestratorHealth, addNotification } = useAppStore();
  const [gatewayUrl, setGatewayUrl] = useState("http://127.0.0.1:9000");
  const [orchestratorUrl, setOrchestratorUrl] = useState("http://127.0.0.1:9876");
  const [testing, setTesting] = useState(false);

  async function testConnections() {
    setTesting(true);
    try {
      await api.gatewayHealth();
      addNotification("Gateway reachable", "success");
    } catch (err) {
      addNotification(`Gateway unreachable: ${String(err)}`, "error");
    }
    try {
      await api.orchestratorHealth();
      addNotification("Orchestrator reachable", "success");
    } catch (err) {
      addNotification(`Orchestrator unreachable: ${String(err)}`, "error");
    }
    setTesting(false);
  }

  return (
    <div style={{ padding: 24, height: "100%", overflow: "auto" }}>
      <h2 style={{ marginTop: 0 }}>⚙️ Settings</h2>

      <div style={{ maxWidth: 480, display: "flex", flexDirection: "column", gap: 16 }}>
        <Field label="Gateway URL">
          <input
            type="text"
            value={gatewayUrl}
            onChange={(e) => setGatewayUrl(e.target.value)}
            style={{
              width: "100%",
              padding: "6px 10px",
              backgroundColor: "var(--vscode-input-background)",
              color: "var(--vscode-input-foreground)",
              border: "1px solid var(--vscode-input-border)",
              borderRadius: 4,
            }}
          />
        </Field>

        <Field label="Orchestrator URL">
          <input
            type="text"
            value={orchestratorUrl}
            onChange={(e) => setOrchestratorUrl(e.target.value)}
            style={{
              width: "100%",
              padding: "6px 10px",
              backgroundColor: "var(--vscode-input-background)",
              color: "var(--vscode-input-foreground)",
              border: "1px solid var(--vscode-input-border)",
              borderRadius: 4,
            }}
          />
        </Field>

        <button
          onClick={() => void testConnections()}
          disabled={testing}
          style={{
            padding: "8px 16px",
            background: "var(--vscode-button-background)",
            color: "var(--vscode-button-foreground)",
            border: "none",
            borderRadius: 4,
            cursor: testing ? "not-allowed" : "pointer",
            opacity: testing ? 0.6 : 1,
          }}
        >
          {testing ? "Testing..." : "Test Connections"}
        </button>

        <div style={{ marginTop: 16 }}>
          <h3>Current Status</h3>
          <div style={{ fontSize: 12 }}>
            Gateway: {gatewayHealth ? `${gatewayHealth.providers?.filter((p) => p.ready).length ?? 0} providers ready` : "unknown"}
          </div>
          <div style={{ fontSize: 12 }}>
            Orchestrator: {orchestratorHealth ? orchestratorHealth.status : "unknown"}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, opacity: 0.8 }}>{label}</span>
      {children}
    </label>
  );
}
