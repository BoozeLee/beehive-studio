import * as vscode from "vscode";
import { BackendClient } from "../services/backendClient";
import type { AgentSession } from "../services/types";

export class SessionTreeItem extends vscode.TreeItem {
  constructor(public readonly session: AgentSession) {
    super(session.agent, vscode.TreeItemCollapsibleState.None);
    this.tooltip = session.brief;
    this.description = `${session.status} · ${session.brief.slice(0, 40)}`;
    this.iconPath = new vscode.ThemeIcon(
      session.status === "completed" ? "check" : session.status === "running" ? "sync~spin" : "error"
    );
    this.contextValue = "session";
  }
}

export class SessionsProvider implements vscode.TreeDataProvider<SessionTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SessionTreeItem | undefined>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private backend: BackendClient | undefined;
  private sessions: AgentSession[] = [];

  setBackend(backend: BackendClient): void {
    this.backend = backend;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  async loadSessions(): Promise<void> {
    if (!this.backend) {
      return;
    }
    // Note: orchestrator does not yet expose /sessions; this is a placeholder.
    // When implemented, replace with this.backend.orchestrator.getSessions()
    this.sessions = [];
    this.refresh();
  }

  addSession(session: AgentSession): void {
    this.sessions = [session, ...this.sessions];
    this.refresh();
  }

  getTreeItem(element: SessionTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<SessionTreeItem[]> {
    return this.sessions.map((session) => new SessionTreeItem(session));
  }
}
