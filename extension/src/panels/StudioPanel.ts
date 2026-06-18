import * as vscode from "vscode";
import { getNonce } from "../bridge/util";
import { BackendClient } from "../services/backendClient";
import * as mixhive from "../services/mixhive";

export class StudioPanel {
  public static readonly viewType = "beehive.studio";
  private static currentPanel: StudioPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _backend: BackendClient;
  private _disposables: vscode.Disposable[] = [];
  private _projectEventsSocket: WebSocket | null = null;
  private _projectEventsProjectId: string | null = null;
  private _projectEventsReconnectTimer: NodeJS.Timeout | null = null;
  private _projectEventsReconnectAttempt = 0;

  public static createOrShow(extensionUri: vscode.Uri, backend: BackendClient) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (StudioPanel.currentPanel) {
      StudioPanel.currentPanel._panel.reveal(column);
      return StudioPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      StudioPanel.viewType,
      "Beehive Studio",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "webview", "dist"),
        ],
      }
    );

    StudioPanel.currentPanel = new StudioPanel(panel, extensionUri, backend);
    return StudioPanel.currentPanel;
  }

  public static postMessage(message: Record<string, unknown>): boolean {
    if (StudioPanel.currentPanel) {
      StudioPanel.currentPanel._panel.webview.postMessage(message);
      return true;
    }
    return false;
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, backend: BackendClient) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._backend = backend;

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.onDidChangeViewState(
      (e) => {
        void vscode.commands.executeCommand(
          "setContext",
          "beehive.transportFocused",
          e.webviewPanel.active
        );
      },
      null,
      this._disposables
    );

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case "gatewayRequest": {
            try {
              const response = await this._backend.gateway.client.request({
                method: message.method,
                url: message.path,
                data: message.body,
                timeout: message.timeout || 30000,
              });
              this._panel.webview.postMessage({
                id: message.id,
                result: response.data,
              });
            } catch (err: any) {
              this._panel.webview.postMessage({
                id: message.id,
                error: err?.response?.data?.detail || err?.message || String(err),
              });
            }
            break;
          }
          case "orchestratorRequest": {
            try {
              const response = await this._backend.orchestrator.client.request({
                method: message.method,
                url: message.path,
                data: message.body,
                timeout: message.timeout || 30000,
              });
              this._panel.webview.postMessage({
                id: message.id,
                result: response.data,
              });
            } catch (err: any) {
              this._panel.webview.postMessage({
                id: message.id,
                error: err?.response?.data?.detail || err?.message || String(err),
              });
            }
            break;
          }
          case "executeCommand": {
            try {
              const result = await vscode.commands.executeCommand(message.command, ...(message.args || []));
              this._panel.webview.postMessage({
                id: message.id,
                result,
              });
            } catch (err: any) {
              this._panel.webview.postMessage({
                id: message.id,
                error: err?.message || String(err),
              });
            }
            break;
          }
          case "showSaveDialog": {
            const uri = await vscode.window.showSaveDialog(message.options);
            this._panel.webview.postMessage({
              id: message.id,
              result: uri?.toString(),
            });
            break;
          }
          case "showOpenDialog": {
            const uris = await vscode.window.showOpenDialog(message.options);
            this._panel.webview.postMessage({
              id: message.id,
              result: uris?.map((u) => u.toString()),
            });
            break;
          }
          case "readFile": {
            try {
              const uri = vscode.Uri.parse(message.uri);
              const data = await vscode.workspace.fs.readFile(uri);
              this._panel.webview.postMessage({
                id: message.id,
                result: Array.from(data),
              });
            } catch (err) {
              this._panel.webview.postMessage({
                id: message.id,
                error: String(err),
              });
            }
            break;
          }
          case "writeFile": {
            try {
              const uri = vscode.Uri.parse(message.uri);
              await vscode.workspace.fs.writeFile(
                uri,
                new Uint8Array(message.data)
              );
              this._panel.webview.postMessage({
                id: message.id,
                result: true,
              });
            } catch (err) {
              this._panel.webview.postMessage({
                id: message.id,
                error: String(err),
              });
            }
            break;
          }
          case "revealFileInOS": {
            try {
              const uri = vscode.Uri.parse(message.uri);
              await vscode.commands.executeCommand(
                "revealFileInOS",
                uri
              );
              this._panel.webview.postMessage({
                id: message.id,
                result: true,
              });
            } catch (err) {
              this._panel.webview.postMessage({
                id: message.id,
                error: String(err),
              });
            }
            break;
          }
          case "getWorkspaceFolder": {
            const folder = vscode.workspace.workspaceFolders?.[0];
            this._panel.webview.postMessage({
              id: message.id,
              result: folder?.uri.toString(),
            });
            break;
          }
          case "mixhiveHealth": {
            this._panel.webview.postMessage({
              id: message.id,
              result: mixhive.isConfigured(),
            });
            break;
          }
          case "mixhiveSignIn": {
            try {
              await mixhive.signIn(message.email, message.password);
              this._panel.webview.postMessage({ id: message.id, result: null });
            } catch (err: any) {
              this._panel.webview.postMessage({ id: message.id, error: err?.message || String(err) });
            }
            break;
          }
          case "mixhiveSignOut": {
            await mixhive.signOut();
            this._panel.webview.postMessage({ id: message.id, result: null });
            break;
          }
          case "mixhiveGetCurrentEmail": {
            const email = await mixhive.getCurrentEmail();
            this._panel.webview.postMessage({ id: message.id, result: email });
            break;
          }
          case "mixhivePublish": {
            try {
              const buffer = Buffer.from(message.audioBytes as number[]);
              const track = await mixhive.publishTrack(message.metadata, buffer);
              this._panel.webview.postMessage({ id: message.id, result: track });
            } catch (err: any) {
              this._panel.webview.postMessage({ id: message.id, error: err?.message || String(err) });
            }
            break;
          }
          case "mixhiveListTracks": {
            try {
              const result = await mixhive.listTracks(message.options);
              this._panel.webview.postMessage({ id: message.id, result });
            } catch (err: any) {
              this._panel.webview.postMessage({ id: message.id, error: err?.message || String(err) });
            }
            break;
          }
          case "mixhiveGetTrack": {
            try {
              const track = await mixhive.getTrack(message.trackId);
              this._panel.webview.postMessage({ id: message.id, result: track });
            } catch (err: any) {
              this._panel.webview.postMessage({ id: message.id, error: err?.message || String(err) });
            }
            break;
          }
          case "mixhiveGetTrackAudio": {
            try {
              const bytes = await mixhive.getTrackAudioBytes(message.trackId);
              this._panel.webview.postMessage({ id: message.id, result: bytes });
            } catch (err: any) {
              this._panel.webview.postMessage({ id: message.id, error: err?.message || String(err) });
            }
            break;
          }
          case "subscribeProjectEvents": {
            const projectId = message.projectId as string;
            if (projectId) {
              this._connectProjectEvents(projectId);
            }
            break;
          }
          case "unsubscribeProjectEvents": {
            this._disconnectProjectEvents();
            break;
          }
          case "log": {
            console.log("[Beehive Webview]", message.level, message.message);
            break;
          }
          case "exportAudio": {
            void this._handleExportAudio(message);
            break;
          }
        }
      },
      null,
      this._disposables
    );
  }

  private async _handleExportAudio(message: {
    id: string;
    projectId: string;
    targetUri: string;
    clips: Record<string, unknown>[];
    tracks: Record<string, unknown>[];
    bpm: number;
    preset: string;
    outputMode: "master" | "master_and_stems";
  }) {
    const reply = (payload: { result?: unknown; error?: string }) => {
      this._panel.webview.postMessage({ id: message.id, ...payload });
    };

    try {
      const targetUri = vscode.Uri.parse(message.targetUri);
      const targetDir = vscode.Uri.joinPath(targetUri, "..");

      const job = await this._backend.orchestrator.createRenderJob(
        message.clips,
        message.tracks,
        message.bpm,
        message.preset as import("../services/types").RenderPreset,
        message.outputMode
      );

      const completed = await this._waitForRenderJob(job.id);
      if (!completed) {
        reply({ error: "Export was cancelled" });
        return;
      }

      const masterBuffer = await this._backend.orchestrator.downloadRenderFile(job.id, "master");
      await vscode.workspace.fs.writeFile(targetUri, masterBuffer);

      if (message.outputMode === "master_and_stems" && completed.stem_paths && completed.stem_paths.length > 0) {
        for (let i = 0; i < completed.stem_paths.length; i++) {
          const trackName = String(message.tracks[i]?.["name"] ?? `track_${i}`).replace(/[^a-zA-Z0-9_-]/g, "_");
          const stemUri = vscode.Uri.joinPath(targetDir, `${trackName}.wav`);
          const stemBuffer = await this._backend.orchestrator.downloadRenderFile(job.id, `stem_${i}` as `stem_${number}`);
          await vscode.workspace.fs.writeFile(stemUri, stemBuffer);
        }
      }

      await vscode.commands.executeCommand("revealFileInOS", targetUri);
      reply({ result: { ok: true, jobId: job.id } });
    } catch (err: any) {
      console.error("[Beehive] export audio failed:", err);
      reply({ error: err?.message || String(err) });
    }
  }

  private async _waitForRenderJob(jobId: string) {
    for (let i = 0; i < 600; i++) {
      const job = await this._backend.orchestrator.getRenderJob(jobId);
      this._panel.webview.postMessage({
        type: "exportProgress",
        jobId,
        progress: job.progress,
        stage: job.stage,
        status: job.status,
      });
      if (job.status === "completed") {
        return job;
      }
      if (job.status === "failed" || job.status === "cancelled") {
        throw new Error(job.error ?? `Render ${job.status}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("Render timed out");
  }

  private _connectProjectEvents(projectId: string) {
    if (this._projectEventsProjectId === projectId && this._projectEventsSocket?.readyState === WebSocket.OPEN) {
      return;
    }
    this._disconnectProjectEvents();
    this._projectEventsProjectId = projectId;
    this._projectEventsReconnectAttempt = 0;
    const ws = this._backend.gateway.connectProjectEvents(
      projectId,
      (event) => {
        this._projectEventsReconnectAttempt = 0;
        this._panel.webview.postMessage({ type: "buildEvent", event });
      },
      (err) => {
        console.error("[Beehive] project events socket error:", err);
        this._panel.webview.postMessage({
          type: "buildEventError",
          error: "Project events connection error",
        });
        this._scheduleProjectEventsReconnect(projectId);
      }
    );
    ws.onclose = () => {
      if (this._projectEventsProjectId === projectId) {
        this._scheduleProjectEventsReconnect(projectId);
      }
    };
    this._projectEventsSocket = ws;
  }

  private _disconnectProjectEvents() {
    if (this._projectEventsReconnectTimer) {
      clearTimeout(this._projectEventsReconnectTimer);
      this._projectEventsReconnectTimer = null;
    }
    if (this._projectEventsSocket) {
      try {
        this._projectEventsSocket.onclose = null;
        this._projectEventsSocket.onerror = null;
        this._projectEventsSocket.onmessage = null;
        this._projectEventsSocket.close();
      } catch {
        // ignore
      }
      this._projectEventsSocket = null;
    }
    this._projectEventsProjectId = null;
    this._projectEventsReconnectAttempt = 0;
  }

  private _scheduleProjectEventsReconnect(projectId: string) {
    if (this._projectEventsReconnectTimer) {
      return;
    }
    if (this._projectEventsReconnectAttempt >= 5) {
      return;
    }
    const delay = Math.min(1000 * Math.pow(2, this._projectEventsReconnectAttempt), 30000);
    this._projectEventsReconnectAttempt += 1;
    this._projectEventsReconnectTimer = setTimeout(() => {
      this._projectEventsReconnectTimer = null;
      if (this._projectEventsProjectId === projectId) {
        this._connectProjectEvents(projectId);
      }
    }, delay);
  }

  private _update() {
    const webview = this._panel.webview;
    const distPath = vscode.Uri.joinPath(
      this._extensionUri,
      "webview",
      "dist"
    );

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distPath, "assets", "index.js")
    );

    const nonce = getNonce();

    webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src http://127.0.0.1:9876 ws://127.0.0.1:9876 ws://127.0.0.1:9000; img-src ${webview.cspSource} blob: data:;">
  <title>Beehive Studio</title>
  <style>
    body { margin: 0; padding: 0; overflow: hidden; background: var(--vscode-editor-background); }
    #root { width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.vscode = acquireVsCodeApi();
  </script>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  public postMessage(message: Record<string, unknown>): void {
    this._panel.webview.postMessage(message);
  }

  public dispose() {
    StudioPanel.currentPanel = undefined;
    this._disconnectProjectEvents();
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) { x.dispose(); }
    }
  }
}
