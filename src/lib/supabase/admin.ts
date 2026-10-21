import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

let client: SupabaseClient<Database> | undefined;

/**
 * Service-role client for route handlers. It bypasses RLS and is the only way
 * to read words and puzzles, so it must never reach the browser; the
 * "server-only" import turns a client-side import into a build error.
 */
export function getSupabaseAdmin(): SupabaseClient<Database> {
  client ??= createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SECRET_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  return client;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}
