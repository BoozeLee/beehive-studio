import { useCallback, useMemo, type ReactNode } from "react";
import { Allotment } from "allotment";
import "allotment/dist/style.css";
import { useWorkbenchStore } from "../../lib/workbenchStore";
import { ToolWindow, type ToolWindowTab } from "./ToolWindow";

interface WorkbenchLayoutProps {
  topBar: ReactNode;
  statusBar: ReactNode;
  leftTabs: ToolWindowTab[];
  rightTabs: ToolWindowTab[];
  bottomTabs: ToolWindowTab[];
  center: ReactNode;
}

export function WorkbenchLayout({
  topBar,
  statusBar,
  leftTabs,
  rightTabs,
  bottomTabs,
  center,
}: WorkbenchLayoutProps) {
  const panels = useWorkbenchStore((s) => s.panels);
  const togglePanel = useWorkbenchStore((s) => s.togglePanel);
  const openPanel = useWorkbenchStore((s) => s.openPanel);

  const onLeftToggle = useCallback(() => togglePanel("left"), [togglePanel]);
  const onRightToggle = useCallback(() => togglePanel("right"), [togglePanel]);
  const onBottomToggle = useCallback(() => togglePanel("bottom"), [togglePanel]);

  const leftTabClick = useCallback(
    (id: string) => {
      if (id === panels.left.activeTab && panels.left.open) {
        togglePanel("left");
      } else {
        openPanel("left", id);
      }
    },
    [panels.left.activeTab, panels.left.open, togglePanel, openPanel]
  );

  const rightTabClick = useCallback(
    (id: string) => {
      if (id === panels.right.activeTab && panels.right.open) {
        togglePanel("right");
      } else {
        openPanel("right", id);
      }
    },
    [panels.right.activeTab, panels.right.open, togglePanel, openPanel]
  );

  const bottomTabClick = useCallback(
    (id: string) => {
      if (id === panels.bottom.activeTab && panels.bottom.open) {
        togglePanel("bottom");
      } else {
        openPanel("bottom", id);
      }
    },
    [panels.bottom.activeTab, panels.bottom.open, togglePanel, openPanel]
  );

  const centerContent = useMemo(
    () => (
      <Allotment vertical defaultSizes={[70, 30]}>
        <Allotment.Pane minSize={100}>
          {center}
        </Allotment.Pane>
        {panels.bottom.open && (
          <Allotment.Pane minSize={40} maxSize={500}>
            <ToolWindow
              side="bottom"
              tabs={bottomTabs}
              activeTab={panels.bottom.activeTab}
              isOpen={panels.bottom.open}
              onTabClick={bottomTabClick}
              onToggle={onBottomToggle}
            />
          </Allotment.Pane>
        )}
      </Allotment>
    ),
    [center, panels.bottom.open, panels.bottom.activeTab, bottomTabs, bottomTabClick, onBottomToggle]
  );

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* TopBar */}
      <div style={{ flexShrink: 0 }}>{topBar}</div>

      {/* Main workspace */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <Allotment defaultSizes={[200, 800, 220]}>
          {/* Left Tool Window */}
          {panels.left.open && (
            <Allotment.Pane minSize={40} maxSize={500}>
              <ToolWindow
                side="left"
                tabs={leftTabs}
                activeTab={panels.left.activeTab}
                isOpen={panels.left.open}
                onTabClick={leftTabClick}
                onToggle={onLeftToggle}
              />
            </Allotment.Pane>
          )}

          {/* Center area */}
          <Allotment.Pane minSize={200}>
            {centerContent}
          </Allotment.Pane>

          {/* Right Tool Window */}
          {panels.right.open && (
            <Allotment.Pane minSize={40} maxSize={500}>
              <ToolWindow
                side="right"
                tabs={rightTabs}
                activeTab={panels.right.activeTab}
                isOpen={panels.right.open}
                onTabClick={rightTabClick}
                onToggle={onRightToggle}
              />
            </Allotment.Pane>
          )}
        </Allotment>
      </div>

      {/* StatusBar */}
      <div style={{ flexShrink: 0 }}>{statusBar}</div>
    </div>
  );
}
