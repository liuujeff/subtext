import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

let client: SupabaseClient<Database> | undefined;

/**
 * Browser client, built with the publishable key only. Nobody needs it to
 * play (guests are identified by a cookie); it's for signing in.
 * Game data always goes through /api, never through this client.
 */
export function getSupabaseBrowser(): SupabaseClient<Database> {
  // Literal process.env reads so Next.js can inline them into the bundle.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }
  // PKCE: the redirect back from Google carries a one-time code, not tokens.
  client ??= createClient<Database>(url, key, { auth: { flowType: "pkce" } });
  return client;
}

/** The signed-in player's access token, or null to play as a guest. */
export async function getSessionToken(): Promise<string | null> {
  const { data } = await getSupabaseBrowser().auth.getSession();
  return data.session?.access_token ?? null;
}

/** Drops a session the server rejected; the player continues as a guest. */
export async function resetSession(): Promise<void> {
  await getSupabaseBrowser().auth.signOut({ scope: "local" });
}

/** Sends the player to Google; they come back to this page signed in. */
export async function signInWithGoogle(): Promise<void> {
  const { error } = await getSupabaseBrowser().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await getSupabaseBrowser().auth.signOut({ scope: "local" });
}
