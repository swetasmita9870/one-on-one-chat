import { b64ToBytes, bytesToB64 } from "./bytes";
import { bumpUnread, currentGroupKey } from "./chats";
import {
  decryptBytes,
  decryptJson,
  encryptJson,
  randomContentKey,
  unwrapContentKey,
  wrapContentKey,
  type Identity,
} from "./crypto";
import { getSupabase, live } from "./supabase";
import type { ChatRecord, MessageKind, MessageRecord, UserProfile } from "./types";
import { readProfile } from "./users";

type MessageRow = {
  id: string;
  sender_id: string;
  created_at: number;
  type: MessageRecord["type"];
  ciphertext: string;
  nonce: string;
  wraps: MessageRecord["wraps"];
  epoch: number | null;
  content_key_wrap: string | null;
  reply_to: string | null;
  edited_at: number | null;
  deleted_for_all: boolean;
  deleted_for: string[];
  starred_by: string[];
  reactions: Record<string, string>;
  delivered_to: string[];
  read_by: string[];
  file_path: string | null;
  file_nonce: string | null;
  file_name: string | null;
  file_mime: string | null;
  expires_at: number | null;
};

function asMessage(row: MessageRow): MessageRecord {
  return {
    senderId: row.sender_id,
    createdAt: Number(row.created_at),
    type: row.type,
    ciphertext: row.ciphertext,
    nonce: row.nonce,
    wraps: row.wraps || {},
    epoch: row.epoch ?? null,
    contentKeyWrap: row.content_key_wrap ?? null,
    replyTo: row.reply_to ?? null,
    editedAt: row.edited_at ?? null,
    deletedForAll: Boolean(row.deleted_for_all),
    deletedFor: row.deleted_for || [],
    starredBy: row.starred_by || [],
    reactions: row.reactions || {},
    deliveredTo: row.delivered_to || [],
    readBy: row.read_by || [],
    filePath: row.file_path ?? null,
    fileNonce: row.file_nonce ?? null,
    fileName: row.file_name ?? null,
    fileMime: row.file_mime ?? null,
    expiresAt: row.expires_at ?? null,
    id: row.id,
  };
}

async function loadMessages(chatId: string, count: number) {
  const { data } = await getSupabase().from("messages").select("*").eq("chat_id", chatId).order("created_at", { ascending: false }).limit(count);
  return ((data || []) as MessageRow[]).map(asMessage).reverse();
}

export function watchMessages(chatId: string, count: number, onData: (messages: MessageRecord[]) => void) {
  return live("messages", async () => onData(await loadMessages(chatId, count)), `chat_id=eq.${chatId}`);
}

export function watchTyping(chatId: string, onData: (typing: Record<string, number>) => void) {
  return live("typing", async () => {
    const { data } = await getSupabase().from("typing").select("user_id, at").eq("chat_id", chatId);
    const typing: Record<string, number> = {};
    (data || []).forEach((item) => { typing[item.user_id as string] = Number(item.at); });
    onData(typing);
  }, `chat_id=eq.${chatId}`);
}

export async function setTyping(chatId: string, uid: string, active: boolean) {
  if (active) await getSupabase().from("typing").upsert({ chat_id: chatId, user_id: uid, at: Date.now() });
  else await getSupabase().from("typing").delete().eq("chat_id", chatId).eq("user_id", uid);
}

async function unwrapWithGroupKey(packed: string, groupKey: Uint8Array) {
  const raw = b64ToBytes(packed.slice(packed.indexOf(":") + 1));
  const aes = await crypto.subtle.importKey("raw", new Uint8Array(groupKey) as BufferSource, "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) as BufferSource }, aes, raw.slice(12) as BufferSource);
  return new Uint8Array(plain);
}

async function contentKeyFor(chat: ChatRecord, message: MessageRecord, me: UserProfile, identity: Identity) {
  if (chat.type === "group") {
    if (!message.contentKeyWrap || message.epoch == null) throw new Error("Missing group message key.");
    const packed = chat.epochs?.[String(message.epoch)]?.[me.uid];
    if (!packed) throw new Error("Missing group key.");
    const authorId = packed.slice(0, packed.indexOf(":"));
    const author = authorId === me.uid ? me : await readProfile(authorId);
    if (!author) throw new Error("Missing key author.");
    const groupKey = await unwrapContentKey(packed, identity.secret, b64ToBytes(author.publicKey));
    return unwrapWithGroupKey(message.contentKeyWrap, groupKey);
  }
  const packed = message.wraps?.[me.uid];
  if (!packed) throw new Error("This message is not encrypted for this browser.");
  const authorId = packed.slice(0, packed.indexOf(":"));
  const author = authorId === me.uid ? me : await readProfile(authorId);
  if (!author) throw new Error("Missing sender key.");
  return unwrapContentKey(packed, identity.secret, b64ToBytes(author.publicKey));
}

export async function decryptMessage(chat: ChatRecord, message: MessageRecord, me: UserProfile, identity: Identity) {
  if (message.deletedForAll) return { text: "", mime: "", fileName: "" };
  const key = await contentKeyFor(chat, message, me, identity);
  return decryptJson<{ text?: string; mime?: string; fileName?: string }>(message.ciphertext, message.nonce, key);
}

export async function messageContentKey(chat: ChatRecord, message: MessageRecord, me: UserProfile, identity: Identity) {
  return contentKeyFor(chat, message, me, identity);
}

async function wrapForDirect(contentKey: Uint8Array, me: UserProfile, identity: Identity, memberIds: string[]) {
  const wraps: Record<string, string> = {};
  for (const uid of memberIds) {
    const profile = uid === me.uid ? me : await readProfile(uid);
    if (!profile) throw new Error("Missing member profile.");
    wraps[uid] = await wrapContentKey(contentKey, identity.secret, b64ToBytes(profile.publicKey), me.uid);
  }
  return wraps;
}

async function wrapForGroup(contentKey: Uint8Array, groupKey: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aes = await crypto.subtle.importKey("raw", new Uint8Array(groupKey) as BufferSource, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, new Uint8Array(contentKey) as BufferSource));
  const packed = new Uint8Array(iv.length + cipher.length);
  packed.set(iv);
  packed.set(cipher, iv.length);
  return `group:${bytesToB64(packed)}`;
}

const previewOf: Record<MessageKind, string> = {
  text: "Message",
  image: "Photo",
  video: "Video",
  file: "Document",
  audio: "Voice message",
};

export async function sendPayload(input: {
  chat: ChatRecord;
  me: UserProfile;
  identity: Identity;
  type: MessageKind;
  text: string;
  replyTo?: string | null;
}) {
  const contentKey = randomContentKey();
  const payload = await encryptJson({ text: input.text, mime: "", fileName: "" }, contentKey);
  const direct = input.chat.type === "direct";
  const wraps = direct ? await wrapForDirect(contentKey, input.me, input.identity, input.chat.memberIds) : {};
  const contentKeyWrap = direct ? null : await wrapForGroup(contentKey, await currentGroupKey(input.chat, input.me, input.identity));
  const now = Date.now();
  const expiresAt = input.chat.disappearingMs ? now + input.chat.disappearingMs : null;
  const { error } = await getSupabase().from("messages").insert({
    chat_id: input.chat.id,
    sender_id: input.me.uid,
    created_at: now,
    type: input.type,
    ciphertext: payload.ciphertext,
    nonce: payload.nonce,
    wraps,
    epoch: direct ? null : input.chat.currentEpoch,
    content_key_wrap: contentKeyWrap,
    reply_to: input.replyTo || null,
    edited_at: null,
    deleted_for_all: false,
    deleted_for: [],
    starred_by: [],
    reactions: {},
    delivered_to: [input.me.uid],
    read_by: [input.me.uid],
    file_path: null,
    file_nonce: null,
    file_name: null,
    file_mime: null,
    expires_at: expiresAt,
  });
  if (error) throw new Error(error.message);
  await getSupabase().from("chats").update({
    updated_at: now,
    last_message: {
      type: input.type,
      senderId: input.me.uid,
      at: now,
      preview: input.type === "text" ? input.text.trim().slice(0, 80) : previewOf[input.type],
    },
  }).eq("id", input.chat.id);
  await bumpUnread(input.chat, input.me.uid);
  await setTyping(input.chat.id, input.me.uid, false);
}

export async function editMessage(
  chat: ChatRecord,
  message: MessageRecord,
  me: UserProfile,
  identity: Identity,
  text: string
) {
  const contentKey = randomContentKey();
  const payload = await encryptJson({ text }, contentKey);
  const direct = chat.type === "direct";
  await getSupabase().from("messages").update({
    ciphertext: payload.ciphertext,
    nonce: payload.nonce,
    wraps: direct ? await wrapForDirect(contentKey, me, identity, chat.memberIds) : {},
    content_key_wrap: direct ? null : await wrapForGroup(contentKey, await currentGroupKey(chat, me, identity)),
    epoch: direct ? null : chat.currentEpoch,
    edited_at: Date.now(),
    type: "text",
  }).eq("id", message.id);
}

export async function deleteForMe(chatId: string, messageId: string, uid: string) {
  const { data } = await getSupabase().from("messages").select("deleted_for").eq("id", messageId).eq("chat_id", chatId).maybeSingle();
  const current = (data?.deleted_for || []) as string[];
  if (current.includes(uid)) return;
  await getSupabase().from("messages").update({ deleted_for: [...current, uid] }).eq("id", messageId);
}

export async function deleteForEveryone(chatId: string, messageId: string) {
  await getSupabase().from("messages").update({ deleted_for_all: true, ciphertext: "", file_path: null }).eq("id", messageId).eq("chat_id", chatId);
}

export async function setReaction(chatId: string, messageId: string, uid: string, emoji: string, current?: string) {
  const { data } = await getSupabase().from("messages").select("reactions").eq("id", messageId).eq("chat_id", chatId).maybeSingle();
  const reactions = { ...((data?.reactions || {}) as Record<string, string>) };
  if (current === emoji) delete reactions[uid];
  else reactions[uid] = emoji;
  await getSupabase().from("messages").update({ reactions }).eq("id", messageId);
}

export async function toggleStar(chatId: string, message: MessageRecord, uid: string) {
  const starred = message.starredBy?.includes(uid) ? message.starredBy.filter((id) => id !== uid) : [...(message.starredBy || []), uid];
  await getSupabase().from("messages").update({ starred_by: starred }).eq("id", message.id).eq("chat_id", chatId);
}

export async function markReceipt(chatId: string, messageId: string, uid: string, kind: "deliveredTo" | "readBy") {
  const column = kind === "deliveredTo" ? "delivered_to" : "read_by";
  const { data } = await getSupabase().from("messages").select(column).eq("id", messageId).eq("chat_id", chatId).maybeSingle();
  const current = (((data as Record<string, string[] | null> | null)?.[column] || []) as string[]);
  if (current.includes(uid)) return;
  await getSupabase().from("messages").update({ [column]: [...current, uid] }).eq("id", messageId);
}

export async function clearUnread(chatId: string, uid: string) {
  await getSupabase().from("chat_members").update({ unread: 0 }).eq("chat_id", chatId).eq("user_id", uid);
}

export async function purgeExpired(messages: MessageRecord[], chatId: string) {
  const now = Date.now();
  const ids = messages.filter((message) => message.expiresAt && message.expiresAt < now).map((message) => message.id);
  if (ids.length) await getSupabase().from("messages").delete().eq("chat_id", chatId).in("id", ids);
}
