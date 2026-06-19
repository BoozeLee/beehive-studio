import { forwardRef, type ReactNode, type CSSProperties } from "react";

interface ScrollablePanelProps {
  children: ReactNode;
  direction?: "vertical" | "horizontal" | "both";
  gap?: number;
  padding?: number;
  className?: string;
  style?: CSSProperties;
  "data-testid"?: string;
}

export const ScrollablePanel = forwardRef<HTMLDivElement, ScrollablePanelProps>(
  function ScrollablePanel(
    {
      children,
      direction = "vertical",
      gap,
      padding,
      className = "",
      style,
      "data-testid": testId,
    },
    ref
  ) {
    const overflow: CSSProperties =
      direction === "horizontal"
        ? { overflowX: "auto", overflowY: "hidden" }
        : direction === "both"
        ? { overflow: "auto" }
        : { overflowX: "hidden", overflowY: "auto" };

    return (
      <div
        ref={ref}
        data-testid={testId}
        className={`jb-scrollable ${className}`.trim()}
        style={{
          display: "flex",
          flexDirection: direction === "horizontal" ? "row" : "column",
          minHeight: "0px",
          minWidth: "0px",
          gap: gap !== undefined ? `${gap}px` : undefined,
          padding: padding !== undefined ? `${padding}px` : undefined,
          ...overflow,
          ...style,
        }}
      >
        {children}
      </div>
    );
  }
);
