import { useState } from "react";
import { commonStyles, BEEHIVE } from "../../lib/theme";

export interface AgentOption {
  id: string;
  label: string;
  icon: string;
  color: string;
}

interface AgentComposerProps {
  agents: AgentOption[];
  activeAgent: string;
  onAgentChange: (id: string) => void;
  onSend: (text: string) => void;
  onIterate?: (text: string) => void;
  disabled?: boolean;
}

export function AgentComposer({ agents, activeAgent, onAgentChange, onSend, onIterate, disabled }: AgentComposerProps) {
  const [text, setText] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (text.trim()) {
        onSend(text);
        setText("");
      }
    }
  };

  const active = agents.find((a) => a.id === activeAgent) ?? agents[0];

  return (
    <div className="jetbee-chat-composer" style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8, borderTop: "1px solid var(--jb-border)" }}>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {agents.map((agent) => (
          <button
            key={agent.id}
            onClick={() => onAgentChange(agent.id)}
            style={{
              ...commonStyles.toolBtn,
              borderColor: agent.color,
              background: activeAgent === agent.id ? agent.color : "transparent",
              color: activeAgent === agent.id ? "#000" : BEEHIVE.text,
            }}
          >
            {agent.icon} {agent.label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={`Ask ${active?.label ?? "the agent"}… (Ctrl+Enter to send)`}
          style={{ ...commonStyles.input, flex: 1, height: 56 }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <button
            disabled={disabled || !text.trim()}
            onClick={() => { onSend(text); setText(""); }}
            style={{ ...commonStyles.toolBtn, background: BEEHIVE.comb, color: "#000", fontWeight: 700 }}
          >
            Send
          </button>
          {onIterate && (
            <button
              disabled={disabled || !text.trim()}
              onClick={() => onIterate(text)}
              style={commonStyles.toolBtn}
            >
              Iterate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
