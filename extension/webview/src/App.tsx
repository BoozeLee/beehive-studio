import React, { useEffect, useState } from "react";
import { Layout } from "./components/Layout/Layout";
import { Dashboard } from "./components/Dashboard";
import { AgentConsole } from "./components/AgentConsole/AgentConsole";
import { ProjectPanel } from "./components/Project/ProjectPanel";
import { TimelinePage } from "./components/TimelinePage";
import { PatternPage } from "./components/PatternPage";
import { MixerPage } from "./components/MixerPage";
import { SessionPage } from "./components/SessionPage";
import { useUIStore } from "./stores/uiStore";

function Router() {
  const { activeRoute, setActiveRoute } = useUIStore();
  const [route, setRoute] = useState(activeRoute);

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      setRoute(path);
      setActiveRoute(path);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [setActiveRoute]);

  useEffect(() => {
    setRoute(activeRoute);
  }, [activeRoute]);

  switch (route) {
    case "/agent":
      return <AgentConsole />;
    case "/project":
      return <ProjectPanel projectName="default" visible={true} onClose={() => {}} />;
    case "/timeline":
      return <TimelinePage />;
    case "/pattern":
      return <PatternPage />;
    case "/mixer":
      return <MixerPage />;
    case "/session":
      return <SessionPage />;
    default:
      return <Dashboard />;
  }
}

function App() {
  return (
    <Layout>
      <Router />
    </Layout>
  );
}

export default App;
