import * as vscode from "vscode";
import { getNonce } from "../bridge/util";
import { BackendClient } from "../services/backendClient";

export class StudioPanel {
  public static readonly viewType = "beehive.studio";
  private static currentPanel: StudioPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _backend: BackendClient;
  private _disposables: vscode.Disposable[] = [];

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

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, backend: BackendClient) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._backend = backend;

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

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
          case "log": {
            console.log("[Beehive Webview]", message.level, message.message);
            break;
          }
        }
      },
      null,
      this._disposables
    );
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src http://127.0.0.1:9876 ws://127.0.0.1:9876; img-src ${webview.cspSource} blob: data:;">
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
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) { x.dispose(); }
    }
  }
}
