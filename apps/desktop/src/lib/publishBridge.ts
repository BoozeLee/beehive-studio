/**
 * MixHive Publish Bridge — publishes finished tracks straight into MixHive's
 * `mixes` table via the unified Supabase project, authenticated by the user's
 * Supabase session (no separate API keys / port-9876 service).
 */
import {
  getSupabase,
  getAccessToken,
  getCurrentEmail,
  isSupabaseConfigured,
  signInWithPassword,
  signOut,
} from "./supabaseClient";

const MIXHIVE_URL = import.meta.env.VITE_MIXHIVE_PUBLISH_URL || "https://mixhive.app";

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

// Auth surface (re-exported for the dialog)
export { isSupabaseConfigured, signInWithPassword as signIn, signOut, getCurrentEmail };

/** True when the unified Supabase project is configured for this build. */
export async function checkPublishHealth(): Promise<boolean> {
  return isSupabaseConfigured();
}

/** Publish a rendered track to MixHive. Requires an active Supabase session. */
export async function publishTrack(metadata: PublishMetadata, audioBlob: Blob): Promise<TrackInfo> {
  const token = await getAccessToken();
  if (!token) throw new Error("Sign in to MixHive first");

  const form = new FormData();
  form.append("audio", audioBlob, "master.wav");
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
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(detail.error || `Publish failed: ${res.status}`);
  }
  const data = await res.json();
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

/** List MixHive tracks published from Beehive (provenance source = beehive-studio). */
export async function listTracks(options?: { q?: string; limit?: number }): Promise<ListTracksResult> {
  const sb = getSupabase();
  if (!sb) return { tracks: [], total: 0 };
  let query = sb
    .from("mixes")
    .select("id,title,audio_url,created_at,duration_seconds,tags,platform_links", { count: "exact" })
    .filter("platform_links->>source", "eq", "beehive-studio")
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 50);
  if (options?.q) query = query.ilike("title", `%${options.q}%`);
  const { data, count } = await query;
  const rows = (data ?? []) as MixRow[];
  return { tracks: rows.map(mapMixRow), total: count ?? rows.length };
}

export async function searchTracks(query: string, options?: { limit?: number }): Promise<ListTracksResult> {
  return listTracks({ q: query, ...options });
}

export async function getTrack(trackId: string): Promise<TrackInfo> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { data } = await sb
    .from("mixes")
    .select("id,title,audio_url,created_at,duration_seconds,tags,platform_links")
    .eq("id", trackId)
    .maybeSingle();
  if (!data) throw new Error("Track not found");
  return mapMixRow(data as MixRow);
}
