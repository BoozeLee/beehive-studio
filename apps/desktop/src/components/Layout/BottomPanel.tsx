import { useWorkbenchStore, type BottomTab } from "../../lib/workbenchStore";
import { commonStyles } from "../../lib/theme";

interface BottomPanelProps {
  agentPanel: React.ReactNode;
  consolePanel: React.ReactNode;
  problemsPanel: React.ReactNode;
}

const TABS: { id: BottomTab; label: string; icon: string }[] = [
  { id: "agent", label: "Agent Chat", icon: "💬" },
  { id: "console", label: "Build Console", icon: "🛠️" },
  { id: "problems", label: "Problems", icon: "⚠️" },
];

export function BottomPanel({ agentPanel, consolePanel, problemsPanel }: BottomPanelProps) {
  const { panels, openPanel } = useWorkbenchStore();
  const activeTab = panels.bottom.activeTab;
  const panelsMap: Record<BottomTab, React.ReactNode> = { agent: agentPanel, console: consolePanel, problems: problemsPanel };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", gap: 2, padding: "4px 6px", borderBottom: "1px solid var(--jb-border)" }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            data-active={activeTab === tab.id}
            onClick={() => openPanel("bottom", tab.id)}
            style={{
              ...commonStyles.toolBtn,
              background: activeTab === tab.id ? "var(--jb-comb)" : "transparent",
              color: activeTab === tab.id ? "#000" : "var(--jb-text)",
              borderColor: activeTab === tab.id ? "var(--jb-comb)" : "var(--jb-border)",
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>{panelsMap[activeTab]}</div>
    </div>
  );
}
