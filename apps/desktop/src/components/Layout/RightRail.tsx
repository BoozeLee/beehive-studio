import { useWorkbenchStore, type RightTab } from "../../lib/workbenchStore";
import { ToolWindow, type ToolWindowTab } from "./ToolWindow";

interface RightRailProps {
  inspectorPanel: React.ReactNode;
  agentsPanel: React.ReactNode;
  proposalPanel: React.ReactNode;
  tastePanel: React.ReactNode;
}

const TAB_DEFS: { id: RightTab; label: string; icon: string }[] = [
  { id: "inspector", label: "Inspector", icon: "🔍" },
  { id: "agents", label: "Agents", icon: "🐝" },
  { id: "proposal", label: "Proposal", icon: "🍯" },
  { id: "taste", label: "Taste", icon: "🕸️" },
];

export function RightRail({
  inspectorPanel,
  agentsPanel,
  proposalPanel,
  tastePanel,
}: RightRailProps) {
  const { panels, openPanel } = useWorkbenchStore();

  const panelsMap: Record<RightTab, React.ReactNode> = {
    inspector: inspectorPanel,
    agents: agentsPanel,
    proposal: proposalPanel,
    taste: tastePanel,
  };

  const tabs: ToolWindowTab[] = TAB_DEFS.map((t) => ({
    id: t.id,
    icon: t.icon,
    label: t.label,
    content: panelsMap[t.id],
  }));

  return (
    <ToolWindow
      side="right"
      tabs={tabs}
      activeTab={panels.right.activeTab}
      isOpen={panels.right.open}
      onTabClick={(id) => openPanel("right", id)}
      onToggle={() => openPanel("right")}
    />
  );
}
