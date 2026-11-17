import { getSupabase, live } from "./supabase";
import type { StatusItem, UserProfile } from "./types";

export function watchStatus(uid: string, onData: (items: StatusItem[]) => void) {
  return live("statuses", async () => {
    const now = Date.now();
    const { data } = await getSupabase().from("statuses").select("*").eq("user_id", uid).gt("expires_at", now - 1000);
    onData(
      ((data || []) as Array<Record<string, unknown>>)
        .map((item) => ({
          id: item.id as string,
          uid,
          body: (item.body as string) || "",
          ciphertext: item.ciphertext as string,
          nonce: item.nonce as string,
          wraps: (item.wraps || {}) as StatusItem["wraps"],
          type: item.type as StatusItem["type"],
          filePath: (item.file_path as string | null) ?? null,
          fileNonce: (item.file_nonce as string | null) ?? null,
          createdAt: Number(item.created_at),
          expiresAt: Number(item.expires_at),
          viewers: (item.viewers || {}) as Record<string, number>,
        }))
        .filter((item) => item.expiresAt > now)
        .sort((a, b) => a.createdAt - b.createdAt)
    );
  }, `user_id=eq.${uid}`);
}

export async function postStatus(input: { me: UserProfile; text: string }) {
  const text = input.text.trim();
  const { error } = await getSupabase().from("statuses").insert({
    user_id: input.me.uid,
    body: text,
    ciphertext: "",
    nonce: "",
    wraps: {},
    type: "text",
    file_path: null,
    file_nonce: null,
    created_at: Date.now(),
    expires_at: Date.now() + 24 * 60 * 60 * 1000,
    viewers: {},
  });
  if (error) throw new Error(error.message);
}

export async function markStatusViewed(uid: string, itemId: string, viewerId: string) {
  const { data } = await getSupabase().from("statuses").select("viewers").eq("id", itemId).eq("user_id", uid).maybeSingle();
  const viewers = { ...((data?.viewers || {}) as Record<string, number>), [viewerId]: Date.now() };
  await getSupabase().from("statuses").update({ viewers }).eq("id", itemId);
}

export function statusText(item: StatusItem): string {
  return item.body || "";
}