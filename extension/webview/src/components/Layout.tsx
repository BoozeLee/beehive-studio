import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { ToastContainer } from "./ToastContainer";

interface Props {
  children: ReactNode;
}

export function Layout({ children }: Props) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: "var(--vscode-background)",
        color: "var(--vscode-foreground)",
      }}
    >
      <TopBar />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar />
        <main
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            borderLeft: "1px solid var(--vscode-panel-border)",
          }}
        >
          {children}
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}
