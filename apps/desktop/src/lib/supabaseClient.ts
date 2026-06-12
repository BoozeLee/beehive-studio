// @ts-nocheck
/**
 * Supabase client for the Beehive desktop app. Uses the SAME unified project as
 * MixHive (one auth.users), so a signed-in Beehive user can publish straight to
 * MixHive with their own session token — no separate API keys.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _sb: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!_sb) _sb = createClient(url, key);
  return _sb;
}

export function isSupabaseConfigured(): boolean {
  return !!getSupabase();
}

export async function getAccessToken(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function getCurrentEmail(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user?.email ?? null;
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured (set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)");
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
}
