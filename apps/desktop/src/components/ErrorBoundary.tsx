import { Component, ErrorInfo, ReactNode } from "react";
import { BEEHIVE } from "../lib/theme";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

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
            border: `1px solid ${BEEHIVE.error}`,
            borderRadius: 8,
            background: BEEHIVE.hive,
            padding: 24,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 12 }}>⚠</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: BEEHIVE.error, marginBottom: 8 }}>
            Something went wrong
          </div>
          <div style={{
            fontSize: 12, color: BEEHIVE.smoke, marginBottom: 16,
            fontFamily: "monospace", padding: 8, background: BEEHIVE.comb,
            borderRadius: 4, wordBreak: "break-word",
          }}>
            {this.state.error?.message || "Unknown error"}
          </div>
          <button
            onClick={this.handleReset}
            style={{
              padding: "8px 20px", fontSize: 13, fontWeight: 600,
              border: "none", borderRadius: 6, background: BEEHIVE.honey,
              color: "#000", cursor: "pointer",
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
