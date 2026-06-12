import * as vscode from "vscode";
import { BackendClient } from "../services/backendClient";

export interface TaskItem {
  id: string;
  label: string;
  description?: string;
  status?: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress?: number;
}

export class TasksProvider implements vscode.TreeDataProvider<TaskTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    TaskTreeItem | undefined | null | void
  > = new vscode.EventEmitter<TaskTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    TaskTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private tasks: TaskItem[] = [];
  private backend: BackendClient | undefined;
  private projectId: string = "default";

  setBackend(backend: BackendClient, projectId: string = "default") {
    this.backend = backend;
    this.projectId = projectId;
    this.pollTasks();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  async pollTasks(): Promise<void> {
    if (!this.backend) { return; }
    try {
      const health = await this.backend.gateway.health();
      const providers = (health.providers || []).map((p: any) => ({
        id: p.provider || p.name || "unknown",
        label: p.provider || p.name || "Unknown Provider",
        description: p.ready ? "Ready" : `Error: ${p.detail || "unavailable"}`,
        status: p.ready ? ("completed" as const) : ("failed" as const),
        progress: p.ready ? 1 : 0,
      }));
      this.tasks = providers;
      this.refresh();
    } catch (err) {
      this.tasks = [{
        id: "error",
        label: "Backend Unreachable",
        description: String(err).slice(0, 60),
        status: "failed",
        progress: 0,
      }];
      this.refresh();
    }
  }

  getTreeItem(element: TaskTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): Thenable<TaskTreeItem[]> {
    if (this.tasks.length === 0) {
      return Promise.resolve([
        new TaskTreeItem(
          "No tasks yet",
          "Run a build or generation to see tasks here",
          "queued",
          0,
          vscode.TreeItemCollapsibleState.None
        ),
      ]);
    }
    return Promise.resolve(
      this.tasks.map(
        (task) =>
          new TaskTreeItem(
            task.label,
            task.description || "",
            task.status || "queued",
            task.progress ?? 0,
            vscode.TreeItemCollapsibleState.None
          )
      )
    );
  }

  addTask(task: TaskItem): void {
    this.tasks.unshift(task);
    this.refresh();
  }

  updateTaskProgress(id: string, progress: number): void {
    const task = this.tasks.find((t) => t.id === id);
    if (task) {
      task.progress = progress;
      this.refresh();
    }
  }
}

class TaskTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly description: string,
    public readonly status: string,
    public readonly progress: number,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.tooltip = `${this.label} — ${this.description} (${Math.round(
      progress * 100
    )}%)`;
    this.description = `${this.description} — ${Math.round(progress * 100)}%`;
    this.iconPath = new vscode.ThemeIcon(
      status === "running"
        ? "sync~spin"
        : status === "failed"
        ? "error"
        : status === "cancelled"
        ? "x"
        : status === "completed"
        ? "check"
        : "clock"
    );
    this.command = {
      command: "beehive.openTaskDashboard",
      title: "Open Task Dashboard",
    };
  }
}
