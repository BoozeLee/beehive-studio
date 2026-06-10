import React from "react";
import { BEEHIVE } from "../lib/theme";

interface LoadingSpinnerProps {
  label?: string;
  size?: number;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  label = "Loading...",
  size = 24,
}) => {
  const hexPoints = (() => {
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 2;
      const x = 50 + 40 * Math.cos(angle);
      const y = 50 + 40 * Math.sin(angle);
      pts.push(`${x}% ${y}%`);
    }
    return pts.join(", ");
  })();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 24,
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          background: `conic-gradient(from 0deg, ${BEEHIVE.honey}, ${BEEHIVE.amber}, ${BEEHIVE.honey})`,
          clipPath: `polygon(${hexPoints})`,
          animation: "hexspin 1.2s linear infinite",
        }}
      />
      <style>{`
        @keyframes hexspin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <span style={{ fontSize: 12, color: BEEHIVE.smoke }}>{label}</span>
    </div>
  );
};
