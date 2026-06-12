import * as vscode from "vscode";
import { BackendClient } from "../services/backendClient";
import type { AgentInfo } from "../services/types";

export class AgentTreeItem extends vscode.TreeItem {
  constructor(public readonly agent: AgentInfo) {
    super(agent.name, vscode.TreeItemCollapsibleState.None);
    this.tooltip = `${agent.name}: ${agent.description || "No description"}`;
    this.description = agent.description;
    this.iconPath = new vscode.ThemeIcon("rocket");
    this.command = {
      command: "beehive.runAgentFromTree",
      title: "Run Agent",
      arguments: [agent.id],
    };
    this.contextValue = "agent";
  }
}

export class AgentsProvider implements vscode.TreeDataProvider<AgentTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AgentTreeItem | undefined>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private backend: BackendClient | undefined;
  private agents: AgentInfo[] = [];

  setBackend(backend: BackendClient): void {
    this.backend = backend;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  async loadAgents(): Promise<void> {
    if (!this.backend) {
      return;
    }
    try {
      this.agents = await this.backend.orchestrator.listAgents();
      this.refresh();
    } catch (err) {
      this.agents = [];
      this.refresh();
    }
  }

  getTreeItem(element: AgentTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<AgentTreeItem[]> {
    return this.agents.map((agent) => new AgentTreeItem(agent));
  }
}
