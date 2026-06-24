import { useWorkbenchStore, type LeftTab } from "../../lib/workbenchStore";
import { commonStyles } from "../../lib/theme";

interface LeftRailProps {
  projectPanel: React.ReactNode;
  patternPanel: React.ReactNode;
  samplePanel: React.ReactNode;
  gitPanel: React.ReactNode;
}

const TABS: { id: LeftTab; label: string; icon: string }[] = [
  { id: "project", label: "Project", icon: "📁" },
  { id: "patterns", label: "Patterns", icon: "🎹" },
  { id: "samples", label: "Samples", icon: "🎧" },
  { id: "git", label: "Git", icon: "🌿" },
];

export function LeftRail({ projectPanel, patternPanel, samplePanel, gitPanel }: LeftRailProps) {
  const { panels, openPanel } = useWorkbenchStore();
  const activeTab = panels.left.activeTab;

  const panelsMap: Record<LeftTab, React.ReactNode> = {
    project: projectPanel,
    patterns: patternPanel,
    samples: samplePanel,
    git: gitPanel,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", gap: 2, padding: "4px 6px", borderBottom: "1px solid var(--jb-border)" }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            data-active={activeTab === tab.id}
            onClick={() => openPanel("left", tab.id)}
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
