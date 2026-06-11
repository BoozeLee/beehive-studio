import { useEffect, useState, type ReactNode } from "react";
import {
  Group,
  Panel,
  Separator,
} from "react-resizable-panels";
import { loadPanelLayout, savePanelLayout, type PanelLayout } from "../../lib/panelPersistence";

interface ResizableWorkbenchProps {
  topBar?: ReactNode;
  leftRail: ReactNode;
  center: ReactNode;
  rightRail: ReactNode;
  bottomRail: ReactNode;
  statusBar: ReactNode;
}

export function ResizableWorkbench({
  topBar,
  leftRail,
  center,
  rightRail,
  bottomRail,
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
  const bottomPct = Math.max(10, Math.min(50, layout.bottomRail.size || 22));

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Top toolbar */}
      {topBar && (
        <div style={{ flexShrink: 0 }}>{topBar}</div>
      )}

      {/* Main workbench */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <Group
          orientation="horizontal"
          style={{ flex: 1, overflow: "hidden" }}
          onLayoutChanged={handleLayoutChange}
        >
          {/* Left Rail */}
          <Panel
            id="left"
            defaultSize={leftPct}
            minSize={10}
            maxSize={40}
            collapsible
            collapsedSize={4}
            style={{ display: layout.leftRail.collapsed ? "none" : "flex" }}
          >
            <div className="jetbee-rail" style={{ width: "100%" }}>
              {leftRail}
            </div>
          </Panel>
          <Separator />

          {/* Center + Bottom */}
          <Panel id="center" minSize={30}>
            <Group
              orientation="vertical"
              style={{ height: "100%" }}
              onLayoutChanged={handleVerticalLayoutChange}
            >
              <Panel id="center-top" defaultSize={100 - bottomPct} minSize={30}>
                <div style={{ height: "100%", overflow: "hidden" }}>
                  {center}
                </div>
              </Panel>
              <Separator />
              <Panel
                id="bottom"
                defaultSize={bottomPct}
                minSize={10}
                maxSize={50}
                collapsible
                collapsedSize={4}
              >
                <div className="jetbee-rail jetbee-rail-bottom" style={{ height: "100%" }}>
                  {bottomRail}
                </div>
              </Panel>
            </Group>
          </Panel>

          <Separator />

          {/* Right Rail */}
          <Panel
            id="right"
            defaultSize={rightPct}
            minSize={10}
            maxSize={40}
            collapsible
            collapsedSize={4}
            style={{ display: layout.rightRail.collapsed ? "none" : "flex" }}
          >
            <div className="jetbee-rail jetbee-rail-right" style={{ width: "100%" }}>
              {rightRail}
            </div>
          </Panel>
        </Group>
      </div>

      {/* Status bar */}
      {statusBar && (
        <div style={{ flexShrink: 0 }}>{statusBar}</div>
      )}
    </div>
  );
}
