import { useMemo, type ReactNode } from "react";

export interface ToolWindowTab {
  id: string;
  icon: ReactNode;
  label: string;
  content: ReactNode;
}

interface ToolWindowProps {
  side: "left" | "right" | "bottom";
  tabs: ToolWindowTab[];
  activeTab: string;
  isOpen: boolean;
  onTabClick: (id: string) => void;
  onToggle: () => void;
}

export function ToolWindow({
  side,
  tabs,
  activeTab,
  isOpen,
  onTabClick,
  onToggle,
}: ToolWindowProps) {
  const isVertical = side === "left" || side === "right";
  const isBottom = side === "bottom";
  const active = tabs.find((t) => t.id === activeTab);

  const tabStripStyle = useMemo(
    () =>
      ({
        display: "flex",
        flexDirection: isVertical ? "column" : "row",
        alignItems: "stretch",
        gap: 2,
        padding: isVertical ? "6px 4px" : "4px 6px",
        background: "var(--jb-bg)",
        borderRight: side === "left" ? "1px solid var(--jb-border)" : undefined,
        borderLeft: side === "right" ? "1px solid var(--jb-border)" : undefined,
        borderBottom: isBottom ? "1px solid var(--jb-border)" : undefined,
        width: isVertical ? 36 : undefined,
        height: isBottom ? 32 : undefined,
        flexShrink: 0,
      } as const),
    [side, isVertical, isBottom]
  );

  const contentStyle = useMemo(
    () =>
      ({
        flex: 1,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        background: "var(--jb-bg-elevated)",
      } as const),
    []
  );

  if (!isOpen) {
    return (
      <div style={{ display: "flex", flexDirection: isVertical ? "row" : "column", height: "100%" }}>
        {side === "right" && (
          <div style={tabStripStyle}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className="toolwindow-tab"
                data-active={activeTab === tab.id}
                data-side={side}
                title={tab.label}
                onClick={() => onTabClick(tab.id)}
              >
                <span className="toolwindow-tab-icon">{tab.icon}</span>
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button
              className="toolwindow-tab"
              data-side={side}
              title="Expand"
              onClick={onToggle}
              style={{ opacity: 0.5 }}
            >
              <span className="toolwindow-tab-icon">◀</span>
            </button>
          </div>
        )}
        {side === "left" && (
          <div style={tabStripStyle}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className="toolwindow-tab"
                data-active={activeTab === tab.id}
                data-side={side}
                title={tab.label}
                onClick={() => onTabClick(tab.id)}
              >
                <span className="toolwindow-tab-icon">{tab.icon}</span>
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button
              className="toolwindow-tab"
              data-side={side}
              title="Expand"
              onClick={onToggle}
              style={{ opacity: 0.5 }}
            >
              <span className="toolwindow-tab-icon">▶</span>
            </button>
          </div>
        )}
        {isBottom && (
          <div style={tabStripStyle}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className="toolwindow-tab"
                data-active={activeTab === tab.id}
                data-side={side}
                title={tab.label}
                onClick={() => onTabClick(tab.id)}
              >
                <span className="toolwindow-tab-icon">{tab.icon}</span>
                <span className="toolwindow-tab-label">{tab.label}</span>
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button
              className="toolwindow-tab"
              data-side={side}
              title="Collapse"
              onClick={onToggle}
              style={{ opacity: 0.5 }}
            >
              <span className="toolwindow-tab-icon">▼</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isVertical ? "row" : "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Tab strip — always visible on the edge */}
      <div style={tabStripStyle}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className="toolwindow-tab"
            data-active={activeTab === tab.id}
            data-side={side}
            title={tab.label}
            onClick={() => onTabClick(tab.id)}
          >
            <span className="toolwindow-tab-icon">{tab.icon}</span>
            {isBottom && (
              <span className="toolwindow-tab-label">{tab.label}</span>
            )}
          </button>
        ))}
        <div style={isVertical ? { flex: 1 } : { flex: 1 }} />
        <button
          className="toolwindow-tab"
          data-side={side}
          title="Collapse"
          onClick={onToggle}
          style={{ opacity: 0.5 }}
        >
          <span className="toolwindow-tab-icon">
            {side === "left" ? "◀" : side === "right" ? "▶" : "▲"}
          </span>
        </button>
      </div>

      {/* Content */}
      <div style={contentStyle}>{active?.content}</div>
    </div>
  );
}
