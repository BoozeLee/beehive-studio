import React from "react";

interface AgentPillProps {
  tier: "queen" | "worker" | "drone" | "forager" | "arrange";
  label: string;
  active?: boolean;
  onClick?: () => void;
}

const TIER_COLORS: Record<string, string> = {
  queen: "var(--bh-agent-queen)",
  worker: "var(--bh-agent-worker)",
  drone: "var(--bh-agent-drone)",
  forager: "var(--bh-agent-forager)",
  arrange: "var(--bh-agent-arrange)",
};

export function AgentPill({ tier, label, active, onClick }: AgentPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`bh-agent-pill ${active ? "bh-agent-pill-active" : ""}`}
      style={active ? { borderColor: TIER_COLORS[tier], color: TIER_COLORS[tier], background: "var(--bh-glow)" } : undefined}
    >
      <span
        className="h-2 w-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: TIER_COLORS[tier] ?? "#888" }}
      />
      <span>{label}</span>
    </button>
  );
}
