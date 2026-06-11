declare global {
  interface Window {
    vscode: {
      postMessage: (message: unknown) => void;
      onMessage: (callback: (message: unknown) => void) => void;
      getState: () => unknown;
      setState: (state: unknown) => void;
    };
  }
}

let vscodeApi: Window["vscode"] | null = null;

export function getVscodeApi(): Window["vscode"] {
  if (!vscodeApi) {
    vscodeApi = (window as any).vscode;
    if (!vscodeApi) {
      throw new Error(
        "VS Code API not available. This app must run inside a VS Code webview."
      );
    }
  }
  return vscodeApi;
}

let messageId = 0;
const pending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
>();

export async function sendMessage(
  type: string,
  payload?: Record<string, unknown>
): Promise<unknown> {
  const api = getVscodeApi();
  const id = ++messageId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    api.postMessage({ id, type, ...payload });
  });
}

export function onMessage(
  callback: (message: { type: string; payload?: unknown }) => void
) {
  const handler = (event: MessageEvent) => {
    const msg = event.data;
    if (msg?.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) {
        p?.reject(msg.error);
      } else {
        p?.resolve(msg.result);
      }
      return;
    }
    callback(msg);
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}

export async function showSaveDialog(
  options?: Record<string, unknown>
): Promise<string | undefined> {
  return sendMessage("showSaveDialog", { options }) as Promise<
    string | undefined
  >;
}

export async function showOpenDialog(
  options?: Record<string, unknown>
): Promise<string[] | undefined> {
  return sendMessage("showOpenDialog", { options }) as Promise<
    string[] | undefined
  >;
}

export async function readFile(uri: string): Promise<number[]> {
  return sendMessage("readFile", { uri }) as Promise<number[]>;
}

export async function writeFile(uri: string, data: number[]): Promise<boolean> {
  return sendMessage("writeFile", { uri, data }) as Promise<boolean>;
}

export async function revealFileInOS(uri: string): Promise<boolean> {
  return sendMessage("revealFileInOS", { uri }) as Promise<boolean>;
}

export async function getWorkspaceFolder(): Promise<string | undefined> {
  return sendMessage("getWorkspaceFolder") as Promise<string | undefined>;
}
