import * as vscode from "vscode";

export interface SessionItem {
  id: string;
  label: string;
  description?: string;
  status?: "active" | "completed" | "error";
  timestamp?: number;
}

export class SessionsProvider
  implements vscode.TreeDataProvider<SessionTreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    SessionTreeItem | undefined | null | void
  > = new vscode.EventEmitter<SessionTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    SessionTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private sessions: SessionItem[] = [];

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SessionTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): Thenable<SessionTreeItem[]> {
    if (this.sessions.length === 0) {
      return Promise.resolve([]);
    }
    return Promise.resolve(
      this.sessions.map(
        (session) =>
          new SessionTreeItem(
            session.label,
            session.description || "",
            session.status || "completed",
            vscode.TreeItemCollapsibleState.None
          )
      )
    );
  }

  addSession(session: SessionItem): void {
    this.sessions.unshift(session);
    this.refresh();
  }
}

class SessionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly description: string,
    public readonly status: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.tooltip = `${this.label} — ${this.description}`;
    this.description = this.description;
    this.iconPath = new vscode.ThemeIcon(
      status === "active"
        ? "sync~spin"
        : status === "error"
        ? "error"
        : "check"
    );
    this.command = {
      command: "beehive.openSessionConsole",
      title: "Open Session Console",
    };
  }
}
