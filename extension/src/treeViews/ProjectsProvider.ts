import * as vscode from "vscode";
import * as path from "path";

export class ProjectTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly uri: vscode.Uri,
    public readonly isBeehiveFile: boolean
  ) {
    super(label, isBeehiveFile ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed);
    if (isBeehiveFile) {
      this.iconPath = new vscode.ThemeIcon("file");
      this.command = {
        command: "beehive.openProjectFromTree",
        title: "Open Project",
        arguments: [uri],
      };
      this.contextValue = "beehiveProject";
    } else {
      this.iconPath = new vscode.ThemeIcon("folder");
    }
  }
}

export class ProjectsProvider implements vscode.TreeDataProvider<ProjectTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ProjectTreeItem | undefined>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private workspaceRoot: string | undefined) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ProjectTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ProjectTreeItem): Promise<ProjectTreeItem[]> {
    if (!this.workspaceRoot) {
      return [];
    }

    if (element) {
      return this.getBeehiveFilesInDirectory(element.uri.fsPath);
    }

    return this.getBeehiveFilesInDirectory(this.workspaceRoot);
  }

  private async getBeehiveFilesInDirectory(dir: string): Promise<ProjectTreeItem[]> {
    const items: ProjectTreeItem[] = [];
    try {
      const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
      for (const [name, type] of entries) {
        const fullPath = path.join(dir, name);
        const uri = vscode.Uri.file(fullPath);
        if (type === vscode.FileType.Directory) {
          // Only show directories that might contain beehive files
          items.push(new ProjectTreeItem(name, uri, false));
        } else if (name.endsWith(".beehive")) {
          items.push(new ProjectTreeItem(name, uri, true));
        }
      }
    } catch {
      // ignore
    }
    return items;
  }
}
