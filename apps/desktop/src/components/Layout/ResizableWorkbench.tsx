import { useEffect, useState, type ReactNode } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { loadPanelLayout, savePanelLayout, type PanelLayout } from "../../lib/panelPersistence";

interface ResizableWorkbenchProps {
  topBar?: ReactNode;
  leftRail: ReactNode;
  leftCollapsed?: boolean;
  center: ReactNode;
  rightRail: ReactNode;
  rightCollapsed?: boolean;
  bottomRail: ReactNode;
  bottomCollapsed?: boolean;
  statusBar: ReactNode;
}

export function ResizableWorkbench({
  topBar,
  leftRail,
  leftCollapsed = false,
  center,
  rightRail,
  rightCollapsed = false,
  bottomRail,
  bottomCollapsed = false,
  statusBar,
}: ResizableWorkbenchProps) {
  const [layout, setLayout] = useState<PanelLayout | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadPanelLayout().then((l) => {
      setLayout(l);
      setReady(true);
    });
  }, []);

  const handleLayoutChange = (sizes: Record<string, number>) => {
    if (!layout) return;
    const next: PanelLayout = {
      ...layout,
      leftRail: { ...layout.leftRail, size: sizes["left"] ?? layout.leftRail.size },
      rightRail: { ...layout.rightRail, size: sizes["right"] ?? layout.rightRail.size },
    };
    setLayout(next);
    savePanelLayout(next);
  };

  const handleVerticalLayoutChange = (sizes: Record<string, number>) => {
    if (!layout) return;
    const next: PanelLayout = {
      ...layout,
      bottomRail: { ...layout.bottomRail, size: sizes["bottom"] ?? layout.bottomRail.size },
    };
    setLayout(next);
    savePanelLayout(next);
  };

  if (!ready || !layout) {
    return (
      <div style={{ height: "100vh", background: "var(--jb-bg)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--jb-text-muted)" }}>
        <span className="jetbee-agent-pulse" style={{ background: "var(--jb-comb)", marginRight: 10 }} />
        Loading JetBee…
      </div>
    );
  }

  const leftPct = Math.max(10, Math.min(40, layout.leftRail.size || 18));
  const rightPct = Math.max(10, Math.min(40, layout.rightRail.size || 20));
  const bottomPct = Math.max(10, Math.min(50, layout.bottomRail.size || 25));

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {topBar && <div style={{ flexShrink: 0 }}>{topBar}</div>}

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <Group orientation="horizontal" style={{ flex: 1, overflow: "hidden" }} onLayoutChanged={handleLayoutChange}>
          <Panel id="left" defaultSize={leftPct} minSize={8} maxSize={40} collapsible collapsedSize={4}>
            <div className="jetbee-rail" data-jetbee-pane="explorer" tabIndex={-1} style={{ width: "100%", opacity: leftCollapsed ? 0.5 : 1 }}>
              {leftRail}
            </div>
          </Panel>
          <Separator />

          <Panel id="center" minSize={30}>
            <Group orientation="vertical" style={{ height: "100%" }} onLayoutChanged={handleVerticalLayoutChange}>
              <Panel id="center-top" defaultSize={100 - bottomPct} minSize={30}>
                <div style={{ height: "100%", overflow: "hidden" }}>{center}</div>
              </Panel>
              <Separator />
              <Panel id="bottom" defaultSize={bottomPct} minSize={8} maxSize={50} collapsible collapsedSize={4}>
                <div className="jetbee-rail jetbee-rail-bottom" data-jetbee-pane="console" tabIndex={-1} style={{ height: "100%", opacity: bottomCollapsed ? 0.5 : 1 }}>
                  {bottomRail}
                </div>
              </Panel>
            </Group>
          </Panel>

          <Separator />

          <Panel id="right" defaultSize={rightPct} minSize={8} maxSize={40} collapsible collapsedSize={4}>
            <div className="jetbee-rail jetbee-rail-right" data-jetbee-pane="inspector" tabIndex={-1} style={{ width: "100%", opacity: rightCollapsed ? 0.5 : 1 }}>
              {rightRail}
            </div>
          </Panel>
        </Group>
      </div>

      {statusBar && <div style={{ flexShrink: 0 }}>{statusBar}</div>}
    </div>
  );
}
