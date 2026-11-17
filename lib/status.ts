import { b64ToBytes } from "./bytes";
import {
  decryptJson,
  encryptJson,
  randomContentKey,
  unwrapContentKey,
  wrapContentKey,
  type Identity,
} from "./crypto";
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

export async function postStatus(input: {
  me: UserProfile;
  identity: Identity;
  contacts: UserProfile[];
  text: string;
}) {
  const contentKey = randomContentKey();
  const wraps: Record<string, string> = {};
  for (const person of [input.me, ...input.contacts.filter((person) => person.uid !== input.me.uid)]) {
    wraps[person.uid] = await wrapContentKey(contentKey, input.identity.secret, b64ToBytes(person.publicKey), input.me.uid);
  }
  const payload = await encryptJson({ text: input.text, mime: "", fileName: "" }, contentKey);
  const { error } = await getSupabase().from("statuses").insert({
    user_id: input.me.uid,
    ciphertext: payload.ciphertext,
    nonce: payload.nonce,
    wraps,
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

export async function decryptStatus(item: StatusItem, me: UserProfile, identity: Identity) {
  const packed = item.wraps?.[me.uid];
  if (!packed) throw new Error("This status is not encrypted for you.");
  const authorId = packed.slice(0, packed.indexOf(":"));
  const authorKey = authorId === me.uid ? me.publicKey : item.wraps[authorId] ? me.publicKey : me.publicKey;
  void authorKey;
  const { readProfile } = await import("./users");
  const author = authorId === me.uid ? me : await readProfile(authorId);
  if (!author) throw new Error("Missing status key.");
  const contentKey = await unwrapContentKey(packed, identity.secret, b64ToBytes(author.publicKey));
  const meta = await decryptJson<{ text?: string; mime?: string }>(item.ciphertext, item.nonce, contentKey);
  return { text: meta.text || "", url: "" };
}
