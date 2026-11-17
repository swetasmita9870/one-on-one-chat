import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export const supabaseConfig = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
};

export const isConfigured = Boolean(supabaseConfig.url && supabaseConfig.anonKey && !supabaseConfig.url.includes("YOUR_"));

export type AppUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
};

let client: SupabaseClient | null = null;

export function getSupabase() {
  if (!client) {
    client = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

export function toAppUser(user: User): AppUser {
  const meta = user.user_metadata || {};
  return {
    uid: user.id,
    email: user.email ?? null,
    displayName: (meta.full_name || meta.name || null) as string | null,
    photoURL: (meta.avatar_url || meta.picture || null) as string | null,
  };
}

export async function insertQuiet(table: string, row: Record<string, unknown> | Record<string, unknown>[]) {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in again.");
  const res = await fetch(`${supabaseConfig.url}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: supabaseConfig.anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (res.ok) return;
  const body = await res.json().catch(() => ({})) as { code?: string; message?: string };
  if (body.code === "23505") return;
  throw new Error(body.message || "Could not save.");
}

export function live(table: string, load: () => void, filter?: string, immediate = true) {
  let timer = 0;
  const schedule = () => {
    if (timer) return;
    timer = window.setTimeout(() => {
      timer = 0;
      void load();
    }, 150);
  };
  if (immediate) void load();
  const channel = getSupabase().channel(`${table}:${filter || "all"}:${crypto.randomUUID()}`);
  const options: { event: "*"; schema: "public"; table: string; filter?: string } = { event: "*", schema: "public", table };
  if (filter) options.filter = filter;
  channel.on("postgres_changes", options, schedule);
  channel.subscribe();
  return () => {
    window.clearTimeout(timer);
    void getSupabase().removeChannel(channel);
  };
}
