import { BEEHIVE, commonStyles } from "../../lib/theme";
import type { AgentMessage as AgentMessageType } from "../../lib/workbenchStore";
import { ConfidenceRadar } from "../ProposalPanel/ConfidenceRadar";

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
      creative_plan?: {
        summary?: string;
        rationale?: string[];
        confidence?: Record<string, number>;
        evidence?: string[];
        alternatives?: Array<{ direction?: string; why?: string }>;
      };
    };
    const plan = proposal.creative_plan;
    const radarDims = plan?.confidence
      ? Object.keys(plan.confidence).filter((k) => k !== "overall")
      : [];
    return (
      <div className="jetbee-chat-message jetbee-chat-message-proposal">
        <div style={{ fontSize: 11, color: BEEHIVE.comb, marginBottom: 4 }}>🐝 Advisory proposal</div>
        <div>{plan?.summary}</div>
        {plan?.confidence && radarDims.length >= 3 && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
            <ConfidenceRadar confidence={plan.confidence} size={140} />
          </div>
        )}
        {plan?.rationale?.map((r, i) => (
          <div key={i} style={{ color: BEEHIVE.textMuted, fontSize: 11, marginTop: 4 }}>• {r}</div>
        ))}
        {plan?.evidence && plan.evidence.length > 0 && (
          <div style={{ marginTop: 6, fontSize: 10, color: BEEHIVE.textMuted }}>
            {plan.evidence.map((e, i) => (
              <div key={i}>🔎 {e}</div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 6 }}>
          {plan?.alternatives?.map((alt, i) => (
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
