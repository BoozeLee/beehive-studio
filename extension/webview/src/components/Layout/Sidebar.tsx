import React from "react";
import { useUIStore } from "../../stores/uiStore";

const NAV_ITEMS = [
  { route: "/", label: "Dashboard", icon: "🏠" },
  { route: "/agent", label: "Agent Console", icon: "🤖" },
  { route: "/project", label: "Project", icon: "📁" },
  { route: "/timeline", label: "Timeline", icon: "🎼" },
  { route: "/pattern", label: "Pattern", icon: "🥁" },
  { route: "/mixer", label: "Mixer", icon: "🎛️" },
  { route: "/session", label: "Session", icon: "🎹" },
];

interface SidebarProps {
  onNavigate: (route: string) => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const { sidebarCollapsed, toggleSidebar, activeRoute } = useUIStore();

  return (
    <div
      style={{
        width: sidebarCollapsed ? 48 : 180,
        background: "var(--vscode-sideBar-background, #111118)",
        borderRight: "1px solid var(--vscode-panel-border, #2A1F18)",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.2s",
        fontFamily: "var(--vscode-font-family)",
        fontSize: 13,
      }}
    >
      <div
        style={{
          height: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: sidebarCollapsed ? "center" : "space-between",
          padding: sidebarCollapsed ? 0 : "0 12px",
          borderBottom: "1px solid var(--vscode-panel-border)",
        }}
      >
        {!sidebarCollapsed && (
          <span style={{ fontWeight: 700, color: "var(--vscode-foreground)" }}>Beehive</span>
        )}
        <button
          onClick={toggleSidebar}
          style={{
            width: 28,
            height: 28,
            background: "transparent",
            border: "none",
            color: "var(--vscode-foreground)",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          {sidebarCollapsed ? "→" : "←"}
        </button>
      </div>

      <nav style={{ flex: 1, padding: "8px 0" }}>
        {NAV_ITEMS.map((item) => {
          const isActive = activeRoute === item.route;
          return (
            <button
              key={item.route}
              onClick={() => onNavigate(item.route)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: sidebarCollapsed ? "8px 0" : "8px 14px",
                justifyContent: sidebarCollapsed ? "center" : "flex-start",
                background: isActive ? "var(--vscode-list-activeSelectionBackground)" : "transparent",
                color: isActive ? "var(--vscode-list-activeSelectionForeground)" : "var(--vscode-sideBar-foreground)",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {!sidebarCollapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
