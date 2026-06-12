import * as vscode from "vscode";
import { BackendClient } from "../services/backendClient";
import type { BuildJob, ProviderHealth } from "../services/types";

export class TaskTreeItem extends vscode.TreeItem {
  constructor(public readonly job: BuildJob) {
    super(`Build ${job.id.slice(0, 8)}`, vscode.TreeItemCollapsibleState.None);
    this.tooltip = `Status: ${job.status}\nProvider: ${job.provider || "auto"}`;
    this.description = `${job.status} · ${Math.round(job.progress * 100)}%`;
    this.iconPath = new vscode.ThemeIcon(
      job.status === "completed"
        ? "check"
        : job.status === "failed"
        ? "error"
        : job.status === "running"
        ? "sync~spin"
        : "clock"
    );
    this.contextValue = "task";
  }
}

export class TasksProvider implements vscode.TreeDataProvider<TaskTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TaskTreeItem | undefined>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private backend: BackendClient | undefined;
  private jobs: BuildJob[] = [];

  setBackend(backend: BackendClient, projectId: string = "default"): void {
    this.backend = backend;
    this.projectId = projectId;
  }

  private projectId = "default";

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  async pollTasks(): Promise<void> {
    if (!this.backend) {
      return;
    }
    try {
      const health = await this.backend.gateway.health();
      const providers = (health.providers || []).map((p: ProviderHealth) => ({
        label: `${p.provider} (${p.ready ? "ready" : "down"})`,
        job: {
          id: p.provider,
          projectId: this.projectId,
          status: p.ready ? "completed" : "failed",
          progress: p.ready ? 1 : 0,
          plan: {} as any,
          artifacts: [],
        } as BuildJob,
      }));
      this.jobs = providers.map((p) => p.job);
      this.refresh();
    } catch {
      this.jobs = [];
      this.refresh();
    }
  }

  addJob(job: BuildJob): void {
    this.jobs = [job, ...this.jobs];
    this.refresh();
  }

  updateJob(job: BuildJob): void {
    this.jobs = this.jobs.map((j) => (j.id === job.id ? job : j));
    this.refresh();
  }

  getTreeItem(element: TaskTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<TaskTreeItem[]> {
    return this.jobs.map((job) => new TaskTreeItem(job));
  }
}
