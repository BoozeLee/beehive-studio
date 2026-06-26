// Multi-axis confidence radar (spider chart) for the agent proposal.
// Plots the named confidence dimensions (groove/darkness/hypnotic/brief_fidelity/
// validity, ...) from `confidence: Record<string, number>`, excluding "overall".

interface ConfidenceRadarProps {
  confidence: Record<string, number>;
  size?: number;
}

const LABELS: Record<string, string> = {
  groove: "Groove",
  darkness: "Darkness",
  hypnotic: "Hypnotic",
  brief_fidelity: "Brief fit",
  validity: "Validity",
};

export function ConfidenceRadar({ confidence, size = 160 }: ConfidenceRadarProps) {
  const dims = Object.keys(confidence).filter((k) => k !== "overall");
  if (dims.length < 3) return null;

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 26; // padding for labels
  const n = dims.length;

  const angleFor = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const point = (i: number, radius: number) => {
    const a = angleFor(i);
    return [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius] as const;
  };

  const rings = [0.25, 0.5, 0.75, 1].map((t) =>
    dims.map((_, i) => point(i, r * t).join(",")).join(" ")
  );

  const valuePoints = dims
    .map((d, i) => point(i, r * Math.max(0, Math.min(1, confidence[d] ?? 0))).join(","))
    .join(" ");

  return (
    <svg width={size} height={size} role="img" aria-label="Confidence radar" data-testid="confidence-radar">
      {/* grid rings */}
      {rings.map((pts, idx) => (
        <polygon
          key={idx}
          points={pts}
          fill="none"
          stroke="var(--jb-border)"
          strokeWidth={1}
          opacity={0.5}
        />
      ))}
      {/* spokes + labels */}
      {dims.map((d, i) => {
        const [ex, ey] = point(i, r);
        const [lx, ly] = point(i, r + 12);
        return (
          <g key={d}>
            <line x1={cx} y1={cy} x2={ex} y2={ey} stroke="var(--jb-border)" strokeWidth={1} opacity={0.4} />
            <text
              x={lx}
              y={ly}
              fontSize={9}
              fill="var(--jb-text-muted)"
              textAnchor={Math.abs(lx - cx) < 4 ? "middle" : lx < cx ? "end" : "start"}
              dominantBaseline="middle"
            >
              {LABELS[d] ?? d}
            </text>
          </g>
        );
      })}
      {/* value polygon */}
      <polygon
        points={valuePoints}
        fill="var(--jb-accent, #f3b217)"
        fillOpacity={0.25}
        stroke="var(--jb-accent, #f3b217)"
        strokeWidth={1.5}
      />
      {dims.map((d, i) => {
        const [px, py] = point(i, r * Math.max(0, Math.min(1, confidence[d] ?? 0)));
        return <circle key={d} cx={px} cy={py} r={2} fill="var(--jb-accent, #f3b217)" />;
      })}
    </svg>
  );
}
