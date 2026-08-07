import React from "react";

interface ThinkingDotsProps {
  color?: string;
  size?: number;
}

export function ThinkingDots({ color = "var(--bh-accent)", size = 6 }: ThinkingDotsProps) {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="rounded-full animate-bounce"
          style={{
            width: size,
            height: size,
            backgroundColor: color,
            animationDelay: `${i * 150}ms`,
            animationDuration: "600ms",
          }}
        />
      ))}
    </span>
  );
}
