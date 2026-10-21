import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

let client: SupabaseClient<Database> | undefined;

/**
 * Browser client, built with the publishable key only. Nobody needs it to
 * play (guests are identified by a cookie); it's here for signed-in accounts.
 * Game data always goes through /api, never through this client.
 */
export function getSupabaseBrowser(): SupabaseClient<Database> {
  // Literal process.env reads so Next.js can inline them into the bundle.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }
  client ??= createClient<Database>(url, key);
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
