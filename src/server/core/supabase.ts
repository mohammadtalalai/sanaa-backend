/** Server-side database clients. Never import from browser code. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type Db = SupabaseClient<Database>;

function isOpaqueKey(value: string) {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function keyFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined);
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (isOpaqueKey(key) && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server environment variable ${name}`);
  return value;
}

/** Service-role client (bypasses RLS) — only after the caller is verified. */
export async function adminDb(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

/** Client that acts as the signed-in user (RLS applies). */
export function userDb(accessToken: string): Db {
  const key = env("SUPABASE_PUBLISHABLE_KEY");
  return createClient<Database>(env("SUPABASE_URL"), key, {
    global: { fetch: keyFetch(key), headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

/** Anonymous client used only for password sign-in / token refresh. */
export function anonAuthDb(): Db {
  const key = env("SUPABASE_PUBLISHABLE_KEY");
  return createClient<Database>(env("SUPABASE_URL"), key, {
    global: { fetch: keyFetch(key) },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}
