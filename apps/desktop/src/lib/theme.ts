export const BEEHIVE = {
  bg: "#1e1d1d",
  panel: "#252524",
  border: "#4c412e",
  comb: "#f3b217",
  wax: "#d4a017",
  honey: "#f5c542",
  amber: "#916c20",
  pollen: "#e8b84b",
  text: "#e0e0e0",
  textMuted: "#a0a0a0",
  smoke: "#3d3d3c",
  glow: "rgba(243, 178, 23, 0.15)",
  glowBright: "rgba(243, 178, 23, 0.35)",
  success: "#4ADE80",
  error: "#EF4444",
  warning: "#FBBF24",
} as const;

export type BeeColor = keyof typeof BEEHIVE;

export function hexRow(rows: number, cols: number, size: number): string {
  const h = size;
  const w = size * Math.sqrt(3);
  const cells: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = c * w + (r % 2 === 1 ? w / 2 : 0);
      const cy = r * h * 0.75;
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        return `${cx + size * Math.cos(a)},${cy + size * Math.sin(a)}`;
      }).join(" ");
      cells.push(`<polygon points="${pts}" fill="none" stroke="${BEEHIVE.border}" stroke-width="0.5" opacity="0.4"/>`);
    }
  }
  return cells.join("\n");
}

export const HEX_BG = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="43.3" height="50" viewBox="0 0 43.3 50"><path d="M21.65,0 L43.3,12.5 L43.3,37.5 L21.65,50 L0,37.5 L0,12.5 Z" fill="none" stroke="#2A1F18" stroke-width="0.5" opacity="0.15"/><path d="M21.65,25 L43.3,37.5 L43.3,62.5 L21.65,75 L0,62.5 L0,37.5 Z" fill="none" stroke="#2A1F18" stroke-width="0.5" opacity="0.15"/></svg>`)}")`;

export const HEX_CLIP = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

export const HEX_CLIP_SM = "polygon(50% 0%, 100% 12.5%, 100% 87.5%, 50% 100%, 0% 87.5%, 0% 12.5%)";

export function hexBackground(color: string = "transparent"): React.CSSProperties {
  return {
    background: `${color}, ${HEX_BG}`,
    backgroundRepeat: "repeat",
    backgroundSize: "43.3px 50px",
  };
}

export function hexButtonStyle(color: string = BEEHIVE.comb, disabled: boolean = false): React.CSSProperties {
  return {
    ...buttonStyle(color, disabled),
    clipPath: HEX_CLIP,
    borderRadius: 0,
  };
}

export function buttonStyle(color: string = BEEHIVE.comb, disabled: boolean = false): React.CSSProperties {
  return {
    padding: "10px 20px",
    fontSize: 14,
    fontWeight: 600,
    border: "none",
    borderRadius: 6,
    cursor: disabled ? "not-allowed" : "pointer",
    background: disabled ? BEEHIVE.smoke : color,
    color: disabled ? BEEHIVE.textMuted : "#000",
    opacity: disabled ? 0.6 : 1,
    transition: "all 0.2s",
  };
}

export function panelStyle(): React.CSSProperties {
  return {
    background: BEEHIVE.panel,
    border: `1px solid ${BEEHIVE.border}`,
    borderRadius: 8,
    padding: 16,
  };
}

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
