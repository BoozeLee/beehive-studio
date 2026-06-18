declare global {
  interface Window {
    vscode: {
      postMessage: (message: unknown) => void;
      setState: (state: unknown) => void;
      getState: () => unknown;
    };
  }
}

export interface BaseRequest {
  id: string;
  type: string;
}

export interface BaseResponse {
  id: string;
  type: string;
  result?: unknown;
  error?: string;
}

export type ExtensionRequest =
  | GatewayRequest
  | OrchestratorRequest
  | ShowSaveDialogRequest
  | ShowOpenDialogRequest
  | ReadFileRequest
  | WriteFileRequest
  | RevealFileInOSRequest
  | GetWorkspaceFolderRequest
  | ExecuteCommandRequest
  | LogRequest
  | ExportAudioRequest
  | MixhiveHealthRequest
  | MixhiveSignInRequest
  | MixhiveSignOutRequest
  | MixhiveGetCurrentEmailRequest
  | MixhivePublishRequest
  | MixhiveListTracksRequest
  | MixhiveGetTrackRequest
  | MixhiveGetTrackAudioRequest;

export interface GatewayRequest extends BaseRequest {
  type: "gatewayRequest";
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  timeout?: number;
}

export interface OrchestratorRequest extends BaseRequest {
  type: "orchestratorRequest";
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  timeout?: number;
}

export interface ShowSaveDialogRequest extends BaseRequest {
  type: "showSaveDialog";
  options: {
    defaultUri?: string;
    saveLabel?: string;
    filters?: Record<string, string[]>;
  };
}

export interface ShowOpenDialogRequest extends BaseRequest {
  type: "showOpenDialog";
  options: {
    defaultUri?: string;
    canSelectFiles?: boolean;
    canSelectFolders?: boolean;
    canSelectMany?: boolean;
    filters?: Record<string, string[]>;
  };
}

export interface ReadFileRequest extends BaseRequest {
  type: "readFile";
  uri: string;
}

export interface WriteFileRequest extends BaseRequest {
  type: "writeFile";
  uri: string;
  data: number[];
}

export interface RevealFileInOSRequest extends BaseRequest {
  type: "revealFileInOS";
  uri: string;
}

export interface GetWorkspaceFolderRequest extends BaseRequest {
  type: "getWorkspaceFolder";
}

export interface ExecuteCommandRequest extends BaseRequest {
  type: "executeCommand";
  command: string;
  args?: unknown[];
}

export interface LogRequest extends BaseRequest {
  type: "log";
  level: "log" | "warn" | "error";
  message: string;
}

export interface ExportAudioRequest extends BaseRequest {
  type: "exportAudio";
  projectId: string;
  targetUri: string;
  clips: Record<string, unknown>[];
  tracks: Record<string, unknown>[];
  bpm: number;
  preset: string;
  outputMode: "master" | "master_and_stems";
}

export interface MixhiveHealthRequest extends BaseRequest {
  type: "mixhiveHealth";
}

export interface MixhiveSignInRequest extends BaseRequest {
  type: "mixhiveSignIn";
  email: string;
  password: string;
}

export interface MixhiveSignOutRequest extends BaseRequest {
  type: "mixhiveSignOut";
}

export interface MixhiveGetCurrentEmailRequest extends BaseRequest {
  type: "mixhiveGetCurrentEmail";
}

export interface MixhivePublishRequest extends BaseRequest {
  type: "mixhivePublish";
  metadata: Record<string, unknown>;
  audioBytes: number[];
  fileName: string;
}

export interface MixhiveListTracksRequest extends BaseRequest {
  type: "mixhiveListTracks";
  options?: { q?: string; limit?: number };
}

export interface MixhiveGetTrackRequest extends BaseRequest {
  type: "mixhiveGetTrack";
  trackId: string;
}

export interface MixhiveGetTrackAudioRequest extends BaseRequest {
  type: "mixhiveGetTrackAudio";
  trackId: string;
}

const vscodeApi = window.vscode;

let requestId = 0;
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>();

function generateId(): string {
  return `req-${Date.now()}-${++requestId}`;
}

export function postMessage(message: Record<string, unknown> & { type: string }): Promise<unknown> {
  const id = generateId();
  const fullMessage = { ...message, id };

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    vscodeApi.postMessage(fullMessage);

    // Safety timeout
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Request ${message.type} timed out`));
      }
    }, 30000);
  });
}

export function handleMessage(message: BaseResponse): void {
  const handler = pending.get(message.id);
  if (!handler) {
    return;
  }
  pending.delete(message.id);
  if (message.error) {
    handler.reject(new Error(message.error));
  } else {
    handler.resolve(message.result);
  }
}

export function setState<T>(state: T): void {
  vscodeApi.setState(state);
}

export function getState<T>(): T | undefined {
  return vscodeApi.getState() as T | undefined;
}

export function log(level: "log" | "warn" | "error", message: string): void {
  vscodeApi.postMessage({ type: "log", level, message, id: generateId() });
}
