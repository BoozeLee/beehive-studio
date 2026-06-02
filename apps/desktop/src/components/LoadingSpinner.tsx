import React from "react";

interface LoadingSpinnerProps {
  label?: string;
  size?: number;
}

const COLORS = {
  accent: "#ff8c42",
  textMuted: "#888",
};

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  label = "Loading...",
  size = 24,
}) => {
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
          border: `3px solid #2a2a30`,
          borderTopColor: COLORS.accent,
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <span style={{ fontSize: 12, color: COLORS.textMuted }}>{label}</span>
    </div>
  );
};
