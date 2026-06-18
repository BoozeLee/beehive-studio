import React from "react";
import { CommitInfo } from "../lib/projectGit";

interface Props {
  commits: CommitInfo[];
  selectedHash?: string | null;
  onCommitClick?: (hash: string) => void;
}

const COLORS = {
  node: "#ff8c42",
  nodeSelected: "#fff",
  line: "#444",
  text: "#e0e0e0",
  textMuted: "#888",
};

export function GitGraph({ commits, selectedHash, onCommitClick }: Props) {
  if (commits.length === 0) return null;

  // Simple layout: one column for now, but with parent connections
  // We'll render an SVG on the left and commit info on the right
  
  const rowHeight = 32;
  const nodeRadius = 5;
  const graphWidth = 40;

  return (
    <div style={{ position: "relative", userSelect: "none" }}>
      <svg
        width={graphWidth}
        height={commits.length * rowHeight}
        style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
      >
        {commits.map((c, i) => {
          const y = i * rowHeight + rowHeight / 2;
          
          // Draw lines to parents
          return c.parents.map(parentHash => {
            const parentIndex = commits.findIndex(pc => pc.hash === parentHash);
            if (parentIndex === -1) return null; // Parent not in current view
            
            const py = parentIndex * rowHeight + rowHeight / 2;
            return (
              <line
                key={`${c.hash}-${parentHash}`}
                x1={graphWidth / 2}
                y1={y}
                x2={graphWidth / 2}
                y2={py}
                stroke={COLORS.line}
                strokeWidth={2}
              />
            );
          });
        })}
        {commits.map((c, i) => (
          <circle
            key={c.hash}
            cx={graphWidth / 2}
            cy={i * rowHeight + rowHeight / 2}
            r={nodeRadius}
            fill={selectedHash === c.hash ? COLORS.nodeSelected : COLORS.node}
          />
        ))}
      </svg>
      
      <div style={{ marginLeft: graphWidth }}>
        {commits.map((c) => (
          <div
            key={c.hash}
            onClick={() => onCommitClick?.(c.hash)}
            style={{
              height: rowHeight,
              display: "flex",
              alignItems: "center",
              padding: "0 8px",
              cursor: "pointer",
              background: selectedHash === c.hash ? "#2a2a30" : "transparent",
              borderRadius: 4,
              fontSize: 12,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            <span style={{ color: COLORS.text, marginRight: 8 }}>
              {c.message.split("\n")[0]}
            </span>
            <span style={{ color: COLORS.textMuted, fontSize: 10, fontFamily: "monospace", marginLeft: "auto" }}>
              {c.short_hash}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
