import * as vscode from "vscode";

export interface AgentItem {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  status?: "idle" | "running" | "error";
}

export class AgentsProvider implements vscode.TreeDataProvider<AgentTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    AgentTreeItem | undefined | null | void
  > = new vscode.EventEmitter<AgentTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    AgentTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private agents: AgentItem[] = [
    {
      id: "composer",
      label: "Composer",
      description: "Generates MIDI patterns and arrangements",
      status: "idle",
    },
    {
      id: "rhythm_groove",
      label: "Rhythm & Groove",
      description: "Drum patterns and percussion",
      status: "idle",
    },
    {
      id: "melody",
      label: "Melody",
      description: "Melodic lines and hooks",
      status: "idle",
    },
    {
      id: "harmony",
      label: "Harmony",
      description: "Chords and harmonic structure",
      status: "idle",
    },
    {
      id: "arrangement",
      label: "Arrangement",
      description: "Song structure and transitions",
      status: "idle",
    },
    {
      id: "mix_master",
      label: "Mix Master",
      description: "Mixing and mastering",
      status: "idle",
    },
  ];

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  updateAgentStatus(agentId: string, status: "idle" | "running" | "error"): void {
    const agent = this.agents.find(a => a.id === agentId);
    if (agent) {
      agent.status = status;
      this.refresh();
    }
  }

  getTreeItem(element: AgentTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): Thenable<AgentTreeItem[]> {
    return Promise.resolve(
      this.agents.map(
        (agent) =>
          new AgentTreeItem(
            agent.label,
            agent.description || "",
            agent.status || "idle",
            vscode.TreeItemCollapsibleState.None
          )
      )
    );
  }
}

class AgentTreeItem extends vscode.TreeItem {
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
      status === "running"
        ? "sync~spin"
        : status === "error"
        ? "error"
        : "person"
    );
    this.command = {
      command: "beehive.openSessionConsole",
      title: "Open Session Console",
    };
  }
}
