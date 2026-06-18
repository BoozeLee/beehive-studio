import * as vscode from "vscode";

const MIXHIVE_URL = process.env.BEEHIVE_MIXHIVE_URL || "https://mixhive.app";
const SUPABASE_URL = process.env.BEEHIVE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.BEEHIVE_SUPABASE_ANON_KEY || "";

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

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  email: string;
}

let session: StoredSession | null = null;

export function isConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
  };
  if (session?.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  }
  return headers;
}

export async function signIn(email: string, password: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = (await res.json()) as any;
  if (!res.ok) {
    throw new Error(data?.error_description || data?.error || `Sign in failed: ${res.status}`);
  }
  session = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    email: data.user?.email || email,
  };
}

export async function signOut(): Promise<void> {
  if (session?.accessToken) {
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: "POST",
        headers: authHeaders(),
      });
    } catch {
      // ignore
    }
  }
  session = null;
}

export async function getCurrentEmail(): Promise<string | null> {
  if (!session?.accessToken) {
    return null;
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      session = null;
      return null;
    }
    const data = (await res.json()) as any;
    return data?.email || session.email || null;
  } catch {
    return null;
  }
}

export async function publishTrack(metadata: PublishMetadata, audioBuffer: Buffer): Promise<TrackInfo> {
  if (!session?.accessToken) {
    throw new Error("Sign in to MixHive first");
  }

  const form = new FormData();
  form.append("audio", new Blob([audioBuffer], { type: "audio/wav" }), "master.wav");
  form.append(
    "metadata",
    JSON.stringify({
      title: metadata.title,
      description: metadata.description,
      genre: metadata.genre,
      bpm: metadata.bpm,
      key: metadata.key,
      tags: metadata.tags ?? [],
      durationSecs: metadata.durationSecs,
      isPublic: metadata.isPublic ?? true,
    })
  );

  const res = await fetch(`${MIXHIVE_URL}/api/mixes/publish`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.accessToken}` },
    body: form as any,
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
    throw new Error(detail.error || `Publish failed: ${res.status}`);
  }
  const data = (await res.json()) as any;
  const email = (await getCurrentEmail()) ?? "";
  return {
    id: data.id,
    title: metadata.title,
    artistName: email,
    artistHandle: email.split("@")[0] ?? "",
    bpm: metadata.bpm,
    key: metadata.key ?? "",
    genre: metadata.genre ?? "",
    description: metadata.description ?? "",
    tags: metadata.tags ?? [],
    isPublic: metadata.isPublic ?? true,
    durationSecs: metadata.durationSecs ?? 0,
    audioUrl: `${MIXHIVE_URL}${data.url}`,
    alsUrl: "",
    createdAt: new Date().toISOString(),
  };
}

interface MixRow {
  id: string;
  title: string;
  audio_url: string;
  created_at: string;
  duration_seconds: number | null;
  tags: string[] | null;
  platform_links: { bpm?: number; key?: string } | null;
}

function mapMixRow(r: MixRow): TrackInfo {
  return {
    id: r.id,
    title: r.title,
    artistName: "",
    artistHandle: "",
    bpm: r.platform_links?.bpm ?? 0,
    key: r.platform_links?.key ?? "",
    genre: "",
    description: "",
    tags: r.tags ?? [],
    isPublic: true,
    durationSecs: r.duration_seconds ?? 0,
    audioUrl: r.audio_url,
    alsUrl: "",
    createdAt: r.created_at,
  };
}

export async function listTracks(options?: { q?: string; limit?: number }): Promise<ListTracksResult> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { tracks: [], total: 0 };
  }

  const params = new URLSearchParams();
  params.set("select", "id,title,audio_url,created_at,duration_seconds,tags,platform_links");
  params.set("platform_links->>source", "eq.beehive-studio");
  params.set("order", "created_at.desc");
  params.set("limit", String(options?.limit ?? 50));
  if (options?.q) {
    params.set("title", `ilike.*${options.q}*`);
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/mixes?${params.toString()}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
    throw new Error(detail.error || `List tracks failed: ${res.status}`);
  }
  const data = (await res.json()) as MixRow[];
  const countHeader = res.headers.get("content-range");
  const total = countHeader ? parseInt(countHeader.split("/")[1] || "0", 10) : data.length;
  return { tracks: data.map(mapMixRow), total };
}

export async function getTrack(trackId: string): Promise<TrackInfo> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase not configured");
  }
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/mixes?id=eq.${encodeURIComponent(trackId)}&select=id,title,audio_url,created_at,duration_seconds,tags,platform_links`,
    { headers: authHeaders() }
  );
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
    throw new Error(detail.error || `Get track failed: ${res.status}`);
  }
  const data = (await res.json()) as MixRow[];
  if (!data.length) {
    throw new Error("Track not found");
  }
  return mapMixRow(data[0]);
}

export async function getTrackAudioBytes(trackId: string): Promise<number[]> {
  const track = await getTrack(trackId);
  const res = await fetch(track.audioUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch audio: ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return Array.from(buffer);
}
