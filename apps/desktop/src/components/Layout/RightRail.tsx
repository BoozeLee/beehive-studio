import { useWorkbenchStore, type RightTab } from "../../lib/workbenchStore";
import { commonStyles } from "../../lib/theme";

interface RightRailProps {
  inspectorPanel: React.ReactNode;
  agentsPanel: React.ReactNode;
  proposalPanel: React.ReactNode;
  tastePanel: React.ReactNode;
}

const TABS: { id: RightTab; label: string; icon: string }[] = [
  { id: "inspector", label: "Inspector", icon: "🔍" },
  { id: "agents", label: "Agents", icon: "🐝" },
  { id: "proposal", label: "Proposal", icon: "🍯" },
  { id: "taste", label: "Taste", icon: "🕸️" },
];

export function RightRail({ inspectorPanel, agentsPanel, proposalPanel, tastePanel }: RightRailProps) {
  const { panels, openPanel } = useWorkbenchStore();
  const activeTab = panels.right.activeTab;
  const panelsMap: Record<RightTab, React.ReactNode> = { inspector: inspectorPanel, agents: agentsPanel, proposal: proposalPanel, taste: tastePanel };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", gap: 2, padding: "4px 6px", borderBottom: "1px solid var(--jb-border)" }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            data-active={activeTab === tab.id}
            onClick={() => openPanel("right", tab.id)}
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
