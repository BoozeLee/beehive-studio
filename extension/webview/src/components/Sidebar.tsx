import { useAppStore, type Route } from "../stores/appStore";

const routes: { path: Route; label: string; icon: string }[] = [
  { path: "/dashboard", label: "Dashboard", icon: "🏠" },
  { path: "/agent", label: "Agent", icon: "🤖" },
  { path: "/timeline", label: "Timeline", icon: "🎼" },
  { path: "/pattern", label: "Pattern", icon: "🎹" },
  { path: "/mixer", label: "Mixer", icon: "🎛️" },
  { path: "/session", label: "Session", icon: "🥁" },
  { path: "/taste", label: "Taste", icon: "🍯" },
  { path: "/branches", label: "Branches", icon: "⎇" },
  { path: "/settings", label: "Settings", icon: "⚙️" },
];

export function Sidebar() {
  const { activeRoute, setRoute } = useAppStore();

  return (
    <nav
      style={{
        width: 56,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 8,
        gap: 4,
        backgroundColor: "var(--vscode-panel-background)",
        borderRight: "1px solid var(--vscode-panel-border)",
      }}
    >
      {routes.map((route) => (
        <button
          key={route.path}
          title={route.label}
          onClick={() => setRoute(route.path)}
          style={{
            width: 40,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            borderRadius: 4,
            backgroundColor:
              activeRoute === route.path
                ? "var(--vscode-list-activeSelectionBackground)"
                : "transparent",
            color:
              activeRoute === route.path
                ? "var(--vscode-list-activeSelectionForeground)"
                : "var(--vscode-foreground)",
            cursor: "pointer",
          }}
        >
          <span style={{ fontSize: 18 }}>{route.icon}</span>
        </button>
      ))}
    </nav>
  );
}
