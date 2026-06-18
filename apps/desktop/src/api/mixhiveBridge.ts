/**
 * MixHive Bridge — TypeScript client for the MixHive API.
 *
 * Calls the Rust mixhive_bridge backend via a local HTTP endpoint.
 * Used by the Beehive Studio desktop app (Tauri) to publish tracks,
 * fetch profiles, and interact with the MixHive social platform.
 *
 * Architecture:
 *   React UI → mixhiveBridge.ts → localhost:8000 (Rust) → MixHive API
 */

const BRIDGE_BASE_URL = import.meta.env.VITE_BRIDGE_URL ?? "http://127.0.0.1:18888";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Track {
  title: string;
  artist: string;
  genre?: string;
  bpm?: number;
  key?: string;
  description?: string;
  tags: string[];
  audioData?: string; // base64
  coverArt?: string;  // base64
}

export interface PublishResponse {
  track_id: string;
  url: string;
  status: string;
}

export interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  bio?: string;
  followers: number;
  following: number;
}

export interface CollabQuest {
  id: string;
  title: string;
  description: string;
  creator: string;
  status: string;
  participants: string[];
  xp_reward: number;
}

export interface PluginMetadata {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  category: string;
  tags: string[];
  price: { Free: null } | { OneTime: { price_cents: number } } | { Subscription: { monthly_cents: number } };
  downloads: number;
  rating: number;
}

// ─── Error Handling ───────────────────────────────────────────────────────────

export class BridgeError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "BridgeError";
    this.status = status;
  }
}

async function bridgeFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BRIDGE_BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "Unknown error");
    throw new BridgeError(res.status, body);
  }

  return res.json() as Promise<T>;
}

// ─── Track Operations ─────────────────────────────────────────────────────────

/** Publish a track from Beehive Studio to MixHive. */
export async function publishTrack(track: Track): Promise<PublishResponse> {
  return bridgeFetch<PublishResponse>("/api/tracks", {
    method: "POST",
    body: JSON.stringify(track),
  });
}

// ─── User Operations ──────────────────────────────────────────────────────────

/** Fetch the authenticated user's profile. */
export async function getMyProfile(): Promise<UserProfile> {
  return bridgeFetch<UserProfile>("/api/users/me");
}

/** Fetch a user profile by username. */
export async function getUser(username: string): Promise<UserProfile> {
  return bridgeFetch<UserProfile>(`/api/users/${encodeURIComponent(username)}`);
}

// ─── Collab Quests ────────────────────────────────────────────────────────────

/** List available collaboration quests. */
export async function listQuests(): Promise<CollabQuest[]> {
  return bridgeFetch<CollabQuest[]>("/api/quests");
}

/** Join a collaboration quest. */
export async function joinQuest(questId: string): Promise<CollabQuest> {
  return bridgeFetch<CollabQuest>(`/api/quests/${encodeURIComponent(questId)}/join`, {
    method: "POST",
  });
}

// ─── Plugin Marketplace ───────────────────────────────────────────────────────

/** List all available plugins. */
export async function listPlugins(): Promise<PluginMetadata[]> {
  return bridgeFetch<PluginMetadata[]>("/api/plugins");
}

/** Search plugins by category. */
export async function searchPluginsByCategory(category: string): Promise<PluginMetadata[]> {
  return bridgeFetch<PluginMetadata[]>(`/api/plugins?category=${encodeURIComponent(category)}`);
}

/** Install a plugin by ID. */
export async function installPlugin(pluginId: string): Promise<{ status: string }> {
  return bridgeFetch<{ status: string }>(`/api/plugins/${encodeURIComponent(pluginId)}/install`, {
    method: "POST",
  });
}

/** Uninstall a plugin by ID. */
export async function uninstallPlugin(pluginId: string): Promise<{ status: string }> {
  return bridgeFetch<{ status: string }>(`/api/plugins/${encodeURIComponent(pluginId)}/uninstall`, {
    method: "DELETE",
  });
}

// ─── Health Check ─────────────────────────────────────────────────────────────

/** Check if the Rust bridge backend is alive. */
export async function healthCheck(): Promise<boolean> {
  try {
    await bridgeFetch<{ status: string }>("/health");
    return true;
  } catch {
    return false;
  }
}
