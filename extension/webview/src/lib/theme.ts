export const BEEHIVE = {
  bg: "#0F0A08",
  panel: "#1A1410",
  border: "#2A1F18",
  comb: "#FF8C42",
  wax: "#D4A017",
  honey: "#F5C542",
  amber: "#BF6F00",
  pollen: "#E8B84B",
  text: "#E8DCC8",
  textMuted: "#8A7E72",
  smoke: "#59453A",
  glow: "rgba(255,140,66,0.15)",
  glowBright: "rgba(255,140,66,0.35)",
  success: "#4ADE80",
  error: "#EF4444",
  warning: "#FBBF24",
} as const;

export type BeeColor = keyof typeof BEEHIVE;

export const commonStyles = {
  input: {
    width: "100%" as const,
    padding: 12,
    fontSize: 14,
    background: BEEHIVE.bg,
    color: BEEHIVE.text,
    border: `1px solid ${BEEHIVE.border}`,
    borderRadius: 6,
    resize: "none" as const,
    boxSizing: "border-box" as const,
    fontFamily: "inherit",
  },
  select: {
    padding: "3px 6px",
    fontSize: 11,
    border: `1px solid ${BEEHIVE.border}`,
    borderRadius: 4,
    background: BEEHIVE.bg,
    color: BEEHIVE.text,
  },
  toolBtn: {
    padding: "3px 10px",
    fontSize: 11,
    border: `1px solid ${BEEHIVE.border}`,
    borderRadius: 4,
    background: BEEHIVE.panel,
    color: BEEHIVE.text,
    cursor: "pointer" as const,
  },
  miniBtn: {
    width: 22,
    height: 22,
    fontSize: 10,
    padding: 0,
    border: `1px solid ${BEEHIVE.border}`,
    borderRadius: 3,
    background: "transparent",
    color: BEEHIVE.textMuted,
    cursor: "pointer" as const,
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  tag: {
    fontSize: 10,
    fontWeight: 700,
    color: BEEHIVE.comb,
    background: BEEHIVE.glow,
    padding: "2px 8px",
    borderRadius: 4,
  },
};

export function panelStyle(): React.CSSProperties {
  return {
    background: BEEHIVE.panel,
    border: `1px solid ${BEEHIVE.border}`,
    borderRadius: 8,
    padding: 16,
  };
}
