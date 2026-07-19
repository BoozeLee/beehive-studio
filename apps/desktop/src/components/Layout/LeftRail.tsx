import { useWorkbenchStore, type LeftTab } from "../../lib/workbenchStore";
import { ToolWindow, type ToolWindowTab } from "./ToolWindow";

interface LeftRailProps {
  projectPanel: React.ReactNode;
  patternPanel: React.ReactNode;
  samplePanel: React.ReactNode;
  gitPanel: React.ReactNode;
  pluginsPanel: React.ReactNode;
}

const TAB_DEFS: { id: LeftTab; label: string; icon: string }[] = [
  { id: "project", label: "Project", icon: "📁" },
  { id: "patterns", label: "Patterns", icon: "🎹" },
  { id: "samples", label: "Samples", icon: "🎧" },
  { id: "git", label: "Git", icon: "🌿" },
  { id: "plugins", label: "Plugins", icon: "🔌" },
];

export function LeftRail({
  projectPanel,
  patternPanel,
  samplePanel,
  gitPanel,
  pluginsPanel,
}: LeftRailProps) {
  const { panels, openPanel } = useWorkbenchStore();

  const panelsMap: Record<LeftTab, React.ReactNode> = {
    project: projectPanel,
    patterns: patternPanel,
    samples: samplePanel,
    git: gitPanel,
    plugins: pluginsPanel,
  };

  const tabs: ToolWindowTab[] = TAB_DEFS.map((t) => ({
    id: t.id,
    icon: t.icon,
    label: t.label,
    content: panelsMap[t.id],
  }));

  return (
    <ToolWindow
      side="left"
      tabs={tabs}
      activeTab={panels.left.activeTab}
      isOpen={panels.left.open}
      onTabClick={(id) => openPanel("left", id)}
      onToggle={() => openPanel("left")}
    />
  );
}
