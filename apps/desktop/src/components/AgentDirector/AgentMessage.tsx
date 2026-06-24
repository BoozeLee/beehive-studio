import { BEEHIVE, commonStyles } from "../../lib/theme";
import type { AgentMessage as AgentMessageType } from "../../lib/workbenchStore";

interface AgentMessageProps {
  message: AgentMessageType;
  onTryAlternative?: (text: string) => void;
}

export function AgentMessage({ message, onTryAlternative }: AgentMessageProps) {
  if (message.role === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <div className="jetbee-chat-message jetbee-chat-message-user">
          {message.text}
        </div>
      </div>
    );
  }

  if (message.toolCall) {
    return (
      <div className="jetbee-chat-message jetbee-chat-message-tool">
        <div style={{ fontSize: 11, color: BEEHIVE.honey, marginBottom: 4 }}>🔧 Tool call</div>
        <div style={{ fontFamily: "var(--jb-font-mono)", fontSize: 11 }}>
          <strong>{message.toolCall.name}</strong>({JSON.stringify(message.toolCall.args).slice(0, 200)})
        </div>
      </div>
    );
  }

  if (message.proposal) {
    const proposal = message.proposal as {
      creative_plan?: { summary?: string; rationale?: string[]; alternatives?: Array<{ direction?: string; why?: string }> };
    };
    return (
      <div className="jetbee-chat-message jetbee-chat-message-proposal">
        <div style={{ fontSize: 11, color: BEEHIVE.comb, marginBottom: 4 }}>🐝 Advisory proposal</div>
        <div>{proposal.creative_plan?.summary}</div>
        {proposal.creative_plan?.rationale?.map((r, i) => (
          <div key={i} style={{ color: BEEHIVE.textMuted, fontSize: 11, marginTop: 4 }}>• {r}</div>
        ))}
        <div style={{ marginTop: 6 }}>
          {proposal.creative_plan?.alternatives?.map((alt, i) => (
            <button key={i} onClick={() => onTryAlternative?.(alt.direction ?? "alternative")} style={{ ...commonStyles.toolBtn, marginRight: 4 }}>
              Try: {alt.direction}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="jetbee-chat-message jetbee-chat-message-agent">
      {message.text}
      {message.clipPreview && (
        <div style={{ fontSize: 11, color: BEEHIVE.textMuted, marginTop: 4 }}>
          🎵 Clip with {message.clipPreview.notes.length} notes
        </div>
      )}
    </div>
  );
}
