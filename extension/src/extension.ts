import * as vscode from "vscode";
import { StudioPanel } from "./panels/StudioPanel";
import { AgentsProvider } from "./treeViews/AgentsProvider";
import { SessionsProvider } from "./treeViews/SessionsProvider";
import { TasksProvider } from "./treeViews/TasksProvider";
import { ProjectsProvider } from "./treeViews/ProjectsProvider";
import { BackendClient } from "./services/backendClient";

export function activate(context: vscode.ExtensionContext) {
  console.log('[Beehive] Extension activating...');

  // Initialize backend client
  const config = vscode.workspace.getConfiguration('beehive');
  const gatewayUrl = config.get<string>('gatewayUrl', 'http://127.0.0.1:9000');
  const orchestratorUrl = config.get<string>('orchestratorUrl', 'http://127.0.0.1:9876');
  const backend = new BackendClient(gatewayUrl, orchestratorUrl);

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
      StudioPanel.createOrShow(context.extensionUri, backend);
    }
  );
  context.subscriptions.push(openStudio);

  // ── New Project ──
  const newProject = vscode.commands.registerCommand(
    "beehive.newProject",
    async () => {
      const name = await vscode.window.showInputBox({
        placeHolder: "Project name",
        prompt: "Name your new Beehive project",
      });
      if (!name) { return; }
      const folder = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: "Select project folder",
      });
      if (!folder || folder.length === 0) { return; }
      const projectUri = vscode.Uri.joinPath(folder[0], `${name}.beehive`);
      try {
        await vscode.workspace.fs.writeFile(
          projectUri,
          Buffer.from(JSON.stringify({ id: name, name, rootUri: folder[0].toString() }, null, 2))
        );
        const panel = StudioPanel.createOrShow(context.extensionUri, backend);
        panel.postMessage({
          type: "loadProject",
          project: { id: name, name, rootUri: folder[0].toString() },
        });
        projectsProvider.refresh();
        vscode.window.showInformationMessage(`Created project ${name}`);
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create project: ${err.message || String(err)}`);
      }
    }
  );
  context.subscriptions.push(newProject);

  // ── Open Project ──
  const openProject = vscode.commands.registerCommand(
    "beehive.openProject",
    async () => {
      const files = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { Beehive: ["beehive"] },
        openLabel: "Open Beehive Project",
      });
      if (!files || files.length === 0) { return; }
      const uri = files[0];
      const projectName = uri.path.split("/").pop()?.replace(/\.beehive$/, "") || "default";
      const panel = StudioPanel.createOrShow(context.extensionUri, backend);
      panel.postMessage({
        type: "loadProject",
        project: { id: projectName, name: projectName, rootUri: uri.toString() },
      });
      vscode.window.showInformationMessage(`Opened project ${projectName}`);
    }
  );
  context.subscriptions.push(openProject);

  // ── Close Project ──
  const closeProject = vscode.commands.registerCommand(
    "beehive.closeProject",
    () => {
      const panel = StudioPanel.createOrShow(context.extensionUri, backend);
      panel.postMessage({ type: "loadProject", project: null });
      vscode.window.showInformationMessage("Project closed");
    }
  );
  context.subscriptions.push(closeProject);

  // ── Build Project ──
  const buildProject = vscode.commands.registerCommand(
    "beehive.buildProject",
    async () => {
      const panel = StudioPanel.createOrShow(context.extensionUri, backend);
      panel.postMessage({ type: "triggerBuild" });
    }
  );
  context.subscriptions.push(buildProject);

  // ── Publish to MixHive ──
  const publishToMixHive = vscode.commands.registerCommand(
    "beehive.publishToMixHive",
    async () => {
      const panel = StudioPanel.createOrShow(context.extensionUri, backend);
      panel.postMessage({ type: "triggerPublish" });
    }
  );
  context.subscriptions.push(publishToMixHive);

  // ── Session Console ──
  const openSessionConsole = vscode.commands.registerCommand(
    "beehive.openSessionConsole",
    () => {
      StudioPanel.createOrShow(context.extensionUri, backend);
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
      StudioPanel.createOrShow(context.extensionUri, backend);
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
      const panel = StudioPanel.createOrShow(context.extensionUri, backend);
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
      StudioPanel.createOrShow(context.extensionUri, backend);
      StudioPanel.postMessage({ type: "triggerExportAudio" });
    }
  );
  context.subscriptions.push(exportAudio);

  // ── Transport Controls ──
  const postTransportAction = (action: string) => {
    StudioPanel.createOrShow(context.extensionUri, backend);
    StudioPanel.postMessage({ type: "transport", action });
  };

  const toggleTransport = vscode.commands.registerCommand("beehive.toggleTransport", () =>
    postTransportAction("toggle")
  );
  const transportStop = vscode.commands.registerCommand("beehive.transportStop", () =>
    postTransportAction("stop")
  );
  const transportRecord = vscode.commands.registerCommand("beehive.transportRecord", () =>
    postTransportAction("record")
  );
  const transportLoop = vscode.commands.registerCommand("beehive.transportLoop", () =>
    postTransportAction("loop")
  );
  const transportMetronome = vscode.commands.registerCommand("beehive.transportMetronome", () =>
    postTransportAction("metronome")
  );
  const transportSeekToStart = vscode.commands.registerCommand("beehive.transportSeekToStart", () =>
    postTransportAction("seekToStart")
  );
  context.subscriptions.push(
    toggleTransport,
    transportStop,
    transportRecord,
    transportLoop,
    transportMetronome,
    transportSeekToStart
  );

  // ── Tree Views ──
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const projectsProvider = new ProjectsProvider(workspaceRoot);
  const agentsProvider = new AgentsProvider();
  const sessionsProvider = new SessionsProvider();
  const tasksProvider = new TasksProvider();

  agentsProvider.setBackend(backend);
  tasksProvider.setBackend(backend);

  vscode.window.registerTreeDataProvider("beehive.projects", projectsProvider);
  vscode.window.registerTreeDataProvider("beehive.agents", agentsProvider);
  vscode.window.registerTreeDataProvider("beehive.sessions", sessionsProvider);
  vscode.window.registerTreeDataProvider("beehive.tasks", tasksProvider);

  // Load agents once on startup
  void agentsProvider.loadAgents();

  // ── Refresh Commands ──
  context.subscriptions.push(
    vscode.commands.registerCommand("beehive.refreshProjects", () =>
      projectsProvider.refresh()
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("beehive.refreshAgents", () =>
      agentsProvider.loadAgents()
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

  // ── Tree View Actions ──
  context.subscriptions.push(
    vscode.commands.registerCommand("beehive.openProjectFromTree", (uri: vscode.Uri) => {
      const panel = StudioPanel.createOrShow(context.extensionUri, backend);
      const projectName = uri.path.split("/").pop()?.replace(/\.beehive$/, "") || "default";
      panel.postMessage({ type: "loadProject", project: { id: projectName, name: projectName, rootUri: uri.toString() } });
      vscode.window.showInformationMessage(`Opened project ${projectName}`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("beehive.runAgentFromTree", async (agentId: string) => {
      const panel = StudioPanel.createOrShow(context.extensionUri, backend);
      const projectName = "default";
      const brief = await vscode.window.showInputBox({ placeHolder: `Prompt for ${agentId}` });
      if (!brief) { return; }
      try {
        const session = await backend.orchestrator.runAgent({ agent: agentId, brief, projectId: projectName });
        sessionsProvider.addSession(session);
        panel.postMessage({ type: "agentSessionCompleted", session });
        vscode.window.showInformationMessage(`Agent ${agentId} completed`);
      } catch (err: any) {
        vscode.window.showErrorMessage(`Agent failed: ${err.message || String(err)}`);
      }
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
      const health = await backend.gateway.health();
      const providers = health.providers || [];
      const readyCount = providers.filter((p: any) => p.ready).length;
      statusBarItem.text = `$(hive) Beehive: ${readyCount}/${providers.length} ready`;
      statusBarItem.tooltip = `Gateway: ${health.status}\nVersion: ${health.version}`;
      statusBarItem.backgroundColor = undefined;
    } catch (err) {
      statusBarItem.text = `$(hive) Beehive: offline`;
      statusBarItem.tooltip = `Gateway unreachable at ${gatewayUrl}`;
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

  // Auto-open studio when launched from a desktop shortcut
  if (process.env.BEEHIVE_AUTO_OPEN === "1") {
    StudioPanel.createOrShow(context.extensionUri, backend);
  }

  console.log('[Beehive] Extension activated successfully');
}

export function deactivate() {
  console.log('[Beehive] Extension deactivated');
}
