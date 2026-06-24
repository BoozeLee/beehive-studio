import { BEEHIVE } from "../../lib/theme";

const AGENTS = [
  { id: "rhythm_groove", label: "Rhythm & Groove", icon: "🎵", color: BEEHIVE.comb },
  { id: "melody", label: "Melody", icon: "🎶", color: BEEHIVE.honey },
  { id: "harmony", label: "Harmony", icon: "🎹", color: "#6366f1" },
  { id: "drums", label: "Drums", icon: "🥁", color: "#ef4444" },
  { id: "arrangement", label: "Arrangement", icon: "📐", color: "#10b981" },
  { id: "style_reference", label: "Style Ref", icon: "🎨", color: "#a855f7" },
  { id: "texture_atmosphere", label: "Texture", icon: "🌫️", color: "#06b6d4" },
  { id: "mix_master", label: "Mix Master", icon: "🎛️", color: "#f59e0b" },
];

export function AgentRoster() {
  return (
    <div style={{ padding: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: BEEHIVE.text, marginBottom: 8 }}>Active Agents</div>
      {AGENTS.map((agent) => (
        <div
          key={agent.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 0",
            borderBottom: `1px solid ${BEEHIVE.border}`,
          }}
        >
          <span style={{ fontSize: 14 }}>{agent.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: BEEHIVE.text }}>{agent.label}</div>
            <div style={{ fontSize: 10, color: BEEHIVE.textMuted }}>{agent.id}</div>
          </div>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: agent.color }} />
        </div>
      ))}
    </div>
  );
}
