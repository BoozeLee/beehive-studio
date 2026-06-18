import { postMessage } from "./vscode";

export interface PublishMetadata {
  title: string;
  bpm: number;
  key?: string;
  genre?: string;
  description?: string;
  tags?: string[];
  isPublic?: boolean;
  durationSecs?: number;
}

export interface TrackInfo {
  id: string;
  title: string;
  artistName: string;
  artistHandle: string;
  bpm: number;
  key: string;
  genre: string;
  description: string;
  tags: string[];
  isPublic: boolean;
  durationSecs: number;
  audioUrl: string;
  alsUrl: string;
  createdAt: string;
}

export interface ListTracksResult {
  tracks: TrackInfo[];
  total: number;
}

export async function checkPublishHealth(): Promise<boolean> {
  return (await postMessage({ type: "mixhiveHealth" })) as boolean;
}

export async function signIn(email: string, password: string): Promise<void> {
  await postMessage({ type: "mixhiveSignIn", email, password });
}

export async function signOut(): Promise<void> {
  await postMessage({ type: "mixhiveSignOut" });
}

export async function getCurrentEmail(): Promise<string | null> {
  return (await postMessage({ type: "mixhiveGetCurrentEmail" })) as string | null;
}

export async function publishTrack(metadata: PublishMetadata, audioBlob: Blob): Promise<TrackInfo> {
  // Blobs can't cross the VS Code message bridge directly, so we read it into an array buffer
  // and send as a typed number array. The extension host reconstructs the Blob/Buffer.
  const arrayBuffer = await audioBlob.arrayBuffer();
  const bytes = Array.from(new Uint8Array(arrayBuffer));
  return (await postMessage({
    type: "mixhivePublish",
    metadata,
    audioBytes: bytes,
    fileName: "master.wav",
  })) as TrackInfo;
}

export async function listTracks(options?: { q?: string; limit?: number }): Promise<ListTracksResult> {
  return (await postMessage({ type: "mixhiveListTracks", options })) as ListTracksResult;
}

export async function searchTracks(query: string, options?: { limit?: number }): Promise<ListTracksResult> {
  return listTracks({ q: query, ...options });
}

export async function getTrack(trackId: string): Promise<TrackInfo> {
  return (await postMessage({ type: "mixhiveGetTrack", trackId })) as TrackInfo;
}

export async function getTrackAudioBytes(trackId: string): Promise<number[]> {
  return (await postMessage({ type: "mixhiveGetTrackAudio", trackId })) as number[];
}
