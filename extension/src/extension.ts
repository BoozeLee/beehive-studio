import * as vscode from "vscode";
import { StudioPanel } from "./panels/StudioPanel";
import { AgentsProvider } from "./treeViews/AgentsProvider";
import { SessionsProvider } from "./treeViews/SessionsProvider";
import { TasksProvider } from "./treeViews/TasksProvider";
import { BackendClient } from "./services/backendClient";

export function activate(context: vscode.ExtensionContext) {
  console.log('[Beehive] Extension activating...');

  // Initialize backend client
  const config = vscode.workspace.getConfiguration('beehive');
  const backendUrl = config.get<string>('backendUrl', 'http://127.0.0.1:9876');
  const backend = new BackendClient(backendUrl);

  // Set context for view visibility
  vscode.commands.executeCommand(
    "setContext",
    "beehive.enabled",
    vscode.workspace.getConfiguration("beehive").get("enabled", true)
  );

  // ── Main Studio Panel ──
  const openStudio = vscode.commands.registerCommand(
    "beehive.openStudio",
    () => {
      StudioPanel.createOrShow(context.extensionUri);
    }
  );
  context.subscriptions.push(openStudio);

  // ── Session Console ──
  const openSessionConsole = vscode.commands.registerCommand(
    "beehive.openSessionConsole",
    () => {
      StudioPanel.createOrShow(context.extensionUri);
    }
  );
  context.subscriptions.push(openSessionConsole);

  // ── Agent Graph ──
  const openAgentGraph = vscode.commands.registerCommand(
    "beehive.openAgentGraph",
    () => {
      vscode.window.showInformationMessage(
        "Agent Graph editor — open a .beegraph.json file"
      );
    }
  );
  context.subscriptions.push(openAgentGraph);

  // ── Task Dashboard ──
  const openTaskDashboard = vscode.commands.registerCommand(
    "beehive.openTaskDashboard",
    () => {
      StudioPanel.createOrShow(context.extensionUri);
    }
  );
  context.subscriptions.push(openTaskDashboard);

  // ── Config Studio ──
  const openConfigStudio = vscode.commands.registerCommand(
    "beehive.openConfigStudio",
    () => {
      vscode.window.showInformationMessage(
        "Config Studio — open a .hive.json file"
      );
    }
  );
  context.subscriptions.push(openConfigStudio);

  // ── Ask Agent ──
  const askAgent = vscode.commands.registerCommand(
    "beehive.askAgent",
    async () => {
      const agent = await vscode.window.showQuickPick(
        ["Composer", "Rhythm & Groove", "Melody", "Harmony", "Arrangement"],
        { placeHolder: "Select an agent..." }
      );
      if (!agent) { return; }
      const prompt = await vscode.window.showInputBox({
        placeHolder: "What should the agent do?",
      });
      if (!prompt) { return; }
      const panel = StudioPanel.createOrShow(context.extensionUri);
      // TODO: send prompt to webview
    }
  );
  context.subscriptions.push(askAgent);

  // ── Run Workflow ──
  const runWorkflow = vscode.commands.registerCommand(
    "beehive.runWorkflow",
    () => {
      const editor = vscode.window.activeTextEditor;
      const selection = editor?.document.getText(editor.selection);
      if (selection) {
        vscode.window.showInformationMessage(
          `Running workflow on selection (${selection.length} chars)`
        );
      }
    }
  );
  context.subscriptions.push(runWorkflow);

  // ── Refactor with Plan ──
  const refactorWithPlan = vscode.commands.registerCommand(
    "beehive.refactorWithPlan",
    () => {
      vscode.window.showInformationMessage("Refactor with Plan — coming soon");
    }
  );
  context.subscriptions.push(refactorWithPlan);

  // ── Export Audio ──
  const exportAudio = vscode.commands.registerCommand(
    "beehive.exportAudio",
    async () => {
      const uri = await vscode.window.showSaveDialog({
        filters: { Audio: ["wav", "mp3"] },
      });
      if (uri) {
        vscode.window.showInformationMessage(`Export to ${uri.fsPath}`);
      }
    }
  );
  context.subscriptions.push(exportAudio);

  // ── Toggle Transport ──
  const toggleTransport = vscode.commands.registerCommand(
    "beehive.toggleTransport",
    () => {
      vscode.window.showInformationMessage("Toggle Transport");
    }
  );
  context.subscriptions.push(toggleTransport);

  // ── Tree Views ──
  const agentsProvider = new AgentsProvider();
  const sessionsProvider = new SessionsProvider();
  const tasksProvider = new TasksProvider();

  tasksProvider.setBackend(backend);

  vscode.window.registerTreeDataProvider("beehive.agents", agentsProvider);
  vscode.window.registerTreeDataProvider("beehive.sessions", sessionsProvider);
  vscode.window.registerTreeDataProvider("beehive.tasks", tasksProvider);

  // ── Refresh Commands ──
  context.subscriptions.push(
    vscode.commands.registerCommand("beehive.refreshAgents", () =>
      agentsProvider.refresh()
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("beehive.refreshSessions", () =>
      sessionsProvider.refresh()
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("beehive.refreshTasks", async () => {
      await tasksProvider.pollTasks();
    })
  );

  // Poll tasks periodically
  const taskPollInterval = setInterval(() => tasksProvider.pollTasks(), 15000);
  context.subscriptions.push({ dispose: () => clearInterval(taskPollInterval) });
  tasksProvider.pollTasks();

  // ── Status Bar ──
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'beehive.openSessionConsole';
  context.subscriptions.push(statusBarItem);

  const updateHealth = async () => {
    try {
      const health = await backend.health();
      const providers = health.providers || [];
      const readyCount = providers.filter((p: any) => p.ready).length;
      statusBarItem.text = `$(hive) Beehive: ${readyCount}/${providers.length} ready`;
      statusBarItem.tooltip = `Backend: ${health.status}\nVersion: ${health.version}`;
      statusBarItem.backgroundColor = undefined;
    } catch (err) {
      statusBarItem.text = `$(hive) Beehive: offline`;
      statusBarItem.tooltip = `Backend unreachable at ${backendUrl}`;
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    }
    statusBarItem.show();
  };

  updateHealth();
  const healthInterval = setInterval(updateHealth, 10000);
  context.subscriptions.push({ dispose: () => clearInterval(healthInterval) });

  // ── Configuration Change Listener ──
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("beehive.enabled")) {
        vscode.commands.executeCommand(
          "setContext",
          "beehive.enabled",
          vscode.workspace.getConfiguration("beehive").get("enabled", true)
        );
      }
    })
  );

  console.log('[Beehive] Extension activated successfully');
}

export function deactivate() {
  console.log('[Beehive] Extension deactivated');
}
