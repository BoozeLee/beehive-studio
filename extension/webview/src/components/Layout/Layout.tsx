import React from "react";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { useUIStore } from "../../stores/uiStore";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { setActiveRoute, bottomPanelOpen, toggleBottomPanel } = useUIStore();

  const handleNavigate = (route: string) => {
    setActiveRoute(route);
    window.history.pushState({}, "", route);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        background: "var(--vscode-editor-background)",
        color: "var(--vscode-foreground)",
        fontFamily: "var(--vscode-font-family)",
      }}
    >
      <TopBar />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar onNavigate={handleNavigate} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <main style={{ flex: 1, overflow: "auto", padding: 16 }}>{children}</main>
          {bottomPanelOpen && (
            <div
              style={{
                height: 120,
                borderTop: "1px solid var(--vscode-panel-border)",
                background: "var(--vscode-panel-background)",
                padding: 8,
                fontSize: 12,
                overflow: "auto",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600 }}>Build Console</span>
                <button
                  onClick={toggleBottomPanel}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--vscode-foreground)",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>
              <div style={{ opacity: 0.6, marginTop: 4 }}>No active builds...</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
