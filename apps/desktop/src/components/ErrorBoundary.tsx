import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const COLORS = {
  bg: "#0f0f12",
  panel: "#18181c",
  border: "#2a2a30",
  accent: "#ff8c42",
  text: "#e0e0e0",
  textMuted: "#888",
  error: "#ef4444",
};

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[ErrorBoundary]", error.message, errorInfo.componentStack);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            border: `1px solid ${COLORS.error}`,
            borderRadius: 8,
            background: COLORS.bg,
            padding: 24,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 24,
              marginBottom: 12,
            }}
          >
            ⚠
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: COLORS.error,
              marginBottom: 8,
            }}
          >
            Something went wrong
          </div>
          <div
            style={{
              fontSize: 12,
              color: COLORS.textMuted,
              marginBottom: 16,
              fontFamily: "monospace",
              padding: 8,
              background: COLORS.panel,
              borderRadius: 4,
              wordBreak: "break-word",
            }}
          >
            {this.state.error?.message || "Unknown error"}
          </div>
          <button
            onClick={this.handleReset}
            style={{
              padding: "8px 20px",
              fontSize: 13,
              fontWeight: 600,
              border: "none",
              borderRadius: 6,
              background: COLORS.accent,
              color: "#000",
              cursor: "pointer",
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
