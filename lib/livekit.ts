import { getSupabase } from "./supabase";

export async function fetchLiveKitToken(callId: string) {
  const { data } = await getSupabase().auth.getSession();
  const jwt = data.session?.access_token;
  if (!jwt) throw new Error("Sign in again.");
  const res = await fetch("/api/livekit/token", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ room: callId }),
  });
  const body = await res.json().catch(() => ({})) as { token?: string; url?: string; error?: string };
  if (!res.ok || !body.token || !body.url) throw new Error(body.error || "Could not join the call.");
  return { token: body.token, url: body.url };
}
