import { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { handleMessage } from "./lib/vscode";
import * as api from "./lib/api";
import { useAppStore } from "./stores/appStore";
import { useProjectStore } from "./stores/projectStore";
import { useTransportStore } from "./stores/transportStore";
import { ExportAudioDialog } from "./components/desktop/ExportAudioDialog/ExportAudioDialog";
import { Dashboard } from "./components/Dashboard";
import { AgentConsole } from "./components/AgentConsole";
import { Layout } from "./components/Layout";
import { TimelinePage } from "./components/TimelinePage";
import { SessionPage } from "./components/SessionPage";
import { TastePage } from "./components/TastePage";
import { BranchesPage } from "./components/BranchesPage";
import { MixerPage } from "./components/MixerPage";
import { PatternPage } from "./components/PatternPage";
import { SettingsPage } from "./components/SettingsPage";
import "./App.css";

function App() {
  const { setGatewayHealth, setOrchestratorHealth, setAgents, addNotification, exportDialogOpen, setExportDialogOpen } = useAppStore();
  const { project, setProject, setTracks, setClips, selectTrack, updateBuildJobFromEvent } = useProjectStore();
  const { syncToProject } = useTransportStore();

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const msg = event.data;
      // Handle extension-host-initiated messages
      if (msg?.type === "loadProject") {
        setProject(msg.project || null);
        if (msg.tracks) setTracks(msg.tracks);
        if (msg.clips) setClips(msg.clips);
        if (msg.selectedTrackId) selectTrack(msg.selectedTrackId);
        if (msg.project) {
          addNotification(`Project ${msg.project.name} loaded`, "success");
        }
        return;
      }
      if (msg?.type === "triggerBuild") {
        // Handled by TopBar/build console; could route via store action
        addNotification("Build triggered from command palette", "info");
        return;
      }
      if (msg?.type === "triggerPublish") {
        addNotification("Publish triggered from command palette", "info");
        return;
      }
      if (msg?.type === "triggerExportAudio") {
        setExportDialogOpen(true);
        return;
      }
      if (msg?.type === "transport") {
        const action = msg.action;
        const transport = useTransportStore.getState();
        if (action === "toggle") {
          void transport.toggle();
        } else if (action === "play") {
          void transport.play();
        } else if (action === "pause") {
          transport.pause();
        } else if (action === "stop") {
          transport.stop();
        } else if (action === "record") {
          if (transport.playing) {
            transport.stop();
          } else {
            transport.setIsRecording(true);
            void transport.play();
          }
        } else if (action === "seekToStart") {
          transport.seekToStart();
        } else if (action === "loop") {
          transport.toggleLoop();
        } else if (action === "metronome") {
          transport.toggleMetronome();
        }
        return;
      }
      if (msg?.type === "agentSessionCompleted") {
        if (msg.session) {
          addNotification(`Agent ${msg.session.agent} completed`, "success");
        }
        return;
      }
      if (msg?.type === "buildEvent") {
        if (msg.event) {
          updateBuildJobFromEvent(msg.event);
        }
        return;
      }
      if (msg?.type === "buildEventError") {
        addNotification(String(msg.error || "Build events connection error"), "warning");
        return;
      }
      // Handle request/response messages
      handleMessage(msg);
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
  }, [setGatewayHealth, setOrchestratorHealth, setAgents, addNotification, setProject, updateBuildJobFromEvent]);

  // Sync transport to project BPM/time signature
  useEffect(() => {
    syncToProject(project);
  }, [project?.id, project?.bpm, project?.timeSignature, syncToProject]);

  // Subscribe/unsubscribe to real-time build events as the active project changes
  useEffect(() => {
    if (project?.id) {
      api.subscribeProjectEvents(project.id).catch((err) => {
        console.error("Failed to subscribe to project events:", err);
      });
    }
    return () => {
      api.unsubscribeProjectEvents().catch(() => {
        // ignore
      });
    };
  }, [project?.id]);

  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/agent" element={<AgentConsole />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/pattern" element={<PatternPage />} />
          <Route path="/session" element={<SessionPage />} />
          <Route path="/taste" element={<TastePage />} />
          <Route path="/branches" element={<BranchesPage />} />
          <Route path="/mixer" element={<MixerPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </Layout>
      <ExportAudioDialog isOpen={exportDialogOpen} onClose={() => setExportDialogOpen(false)} />
    </Router>
  );
}

export default App;
