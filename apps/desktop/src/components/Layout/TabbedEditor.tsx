import { useState, type ReactNode } from "react";
import { ScrollablePanel } from "./ScrollablePanel";

export interface EditorTab {
  id: string;
  label: string;
  icon?: string;
  content: ReactNode;
  closable?: boolean;
}

interface TabbedEditorProps {
  tabs: EditorTab[];
  defaultTab?: string;
  onTabChange?: (id: string) => void;
  onTabClose?: (id: string) => void;
}

export function TabbedEditor({ tabs, defaultTab, onTabChange, onTabClose }: TabbedEditorProps) {
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs[0]?.id);

  const handleTabClick = (id: string) => {
    setActiveTab(id);
    onTabChange?.(id);
  };

  const activeContent = tabs.find((t) => t.id === activeTab)?.content;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          background: "var(--jb-toolbar-bg)",
          borderBottom: "1px solid var(--jb-border)",
          flexShrink: 0,
          overflowX: "auto",
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className="jetbee-tab"
            data-active={activeTab === tab.id}
            onClick={() => handleTabClick(tab.id)}
            title={tab.label}
            style={{
              borderLeft: activeTab === tab.id ? "3px solid var(--jb-comb)" : "3px solid transparent",
              paddingLeft: activeTab === tab.id ? 9 : 12,
            }}
          >
            {tab.icon && <span style={{ opacity: 0.7 }}>{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.closable && onTabClose && (
              <span
                style={{
                  marginLeft: 4,
                  padding: "0 3px",
                  borderRadius: 3,
                  fontSize: 14,
                  lineHeight: 1,
                  opacity: 0.5,
                  cursor: "pointer",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(tab.id);
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.5")}
              >
                ×
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <ScrollablePanel style={{ flex: 1, position: "relative" }}>
        {activeContent}
      </ScrollablePanel>
    </div>
  );
}
