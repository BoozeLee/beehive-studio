import { useWorkbenchStore, type BottomTab } from "../../lib/workbenchStore";
import { ToolWindow, type ToolWindowTab } from "./ToolWindow";

interface BottomPanelProps {
  agentPanel: React.ReactNode;
  consolePanel: React.ReactNode;
  problemsPanel: React.ReactNode;
  buildPanel: React.ReactNode;
}

const TAB_DEFS: { id: BottomTab; label: string; icon: string }[] = [
  { id: "agent", label: "Agent Chat", icon: "💬" },
  { id: "console", label: "Build Console", icon: "🛠️" },
  { id: "problems", label: "Problems", icon: "⚠️" },
  { id: "build", label: "Build Plan", icon: "▶️" },
];

export function BottomPanel({
  agentPanel,
  consolePanel,
  problemsPanel,
  buildPanel,
}: BottomPanelProps) {
  const { panels, openPanel } = useWorkbenchStore();

  const panelsMap: Record<BottomTab, React.ReactNode> = {
    agent: agentPanel,
    console: consolePanel,
    problems: problemsPanel,
    build: buildPanel,
  };

  const tabs: ToolWindowTab[] = TAB_DEFS.map((t) => ({
    id: t.id,
    icon: t.icon,
    label: t.label,
    content: panelsMap[t.id],
  }));

  return (
    <ToolWindow
      side="bottom"
      tabs={tabs}
      activeTab={panels.bottom.activeTab}
      isOpen={panels.bottom.open}
      onTabClick={(id) => openPanel("bottom", id)}
      onToggle={() => openPanel("bottom")}
    />
  );
}
