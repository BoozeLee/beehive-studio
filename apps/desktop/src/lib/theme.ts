// Beehive Studio — Centralized Theme
// Warm amber/honey palette inspired by beehives and bees.

const BEE = {
  hive: "#0d0b08",       // Deep hive interior — main background
  comb: "#1c1814",       // Warm comb surface — panel backgrounds
  wax:  "#2a241c",       // Wax border — borders, dividers
  honey: "#f5a623",      // Honey gold — primary action color
  amber: "#ff8c42",      // Amber accent — hover states, highlights
  pollen: "#ffd700",     // Bee yellow — star ratings, special highlights
  wing: "#f0f0e8",       // Wing white — primary text
  smoke: "#888888",      // Muted text — secondary labels
  glow: "#ff8c42",       // Amber glow — status indicators, active states

  // Semantic colors
  success: "#4ade80",
  error: "#ef4444",
  warning: "#fbbf24",

  // Spacing & layout
  radius: "8px",
  radiusSm: "4px",
  radiusLg: "12px",
  borderStyle: "1px solid #2a241c",

  // Transitions
  transition: "all 0.2s ease",

  // Font
  font: 'system-ui, -apple-system, sans-serif',
  fontMono: 'monospace',
  fontSize: "12px",
  fontSizeSm: "10px",
  fontSizeLg: "14px",

  // Legacy aliases — map old COLORS names to new bee names
  bg: "#0d0b08",
  panel: "#1c1814",
  border: "#2a241c",
  accent: "#f5a623",
  accentHover: "#ff8c42",
  text: "#f0f0e8",
  textMuted: "#888888",
};

export const BEEHIVE = BEE;
export type BeehiveTheme = typeof BEEHIVE;
