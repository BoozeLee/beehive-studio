import { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { handleMessage } from "./lib/vscode";
import * as api from "./lib/api";
import { useAppStore } from "./stores/appStore";
import { useProjectStore } from "./stores/projectStore";
import { Dashboard } from "./components/Dashboard";
import { AgentConsole } from "./components/AgentConsole";
import { Layout } from "./components/Layout";
import { TastePage } from "./components/TastePage";
import { SettingsPage } from "./components/SettingsPage";
import "./App.css";

function App() {
  const { setGatewayHealth, setOrchestratorHealth, setAgents, addNotification } = useAppStore();
  const { setProject } = useProjectStore();

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      handleMessage(event.data);
    };
    window.addEventListener("message", listener);

    // Initial health check
    api.gatewayHealth()
      .then(setGatewayHealth)
      .catch((err) => addNotification(`Gateway unreachable: ${String(err)}`, "error"));

    api.orchestratorHealth()
      .then(setOrchestratorHealth)
      .catch((err) => addNotification(`Orchestrator unreachable: ${String(err)}`, "error"));

    api.listAgents()
      .then(setAgents)
      .catch((err) => addNotification(`Failed to load agents: ${String(err)}`, "error"));

    // Attempt to load project from state (set by extension host)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const initialState = (window as any).__INITIAL_STATE__;
    if (initialState?.project) {
      setProject(initialState.project);
    }

    return () => window.removeEventListener("message", listener);
  }, [setGatewayHealth, setOrchestratorHealth, setAgents, addNotification, setProject]);

  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/agent" element={<AgentConsole />} />
          <Route path="/taste" element={<TastePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
