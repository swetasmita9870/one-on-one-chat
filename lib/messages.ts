import { getSupabase, live } from "./supabase";
import type { ChatRecord, MessageKind, MessageRecord, UserProfile } from "./types";
import { bumpUnread } from "./chats";

type MessageRow = {
  id: string;
  sender_id: string;
  created_at: number;
  type: MessageRecord["type"];
  body?: string;
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
    body: row.body ?? "",
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

export function messageText(message: MessageRecord): string {
  if (message.deletedForAll) return "";
  return (message.body || "").trim();
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
  type: MessageKind;
  text: string;
  replyTo?: string | null;
}) {
  const now = Date.now();
  const expiresAt = input.chat.disappearingMs ? now + input.chat.disappearingMs : null;
  const text = input.text.trim();
  const { error } = await getSupabase().from("messages").insert({
    chat_id: input.chat.id,
    sender_id: input.me.uid,
    created_at: now,
    type: input.type,
    body: text,
    ciphertext: "",
    nonce: "",
    wraps: {},
    epoch: null,
    content_key_wrap: null,
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
      preview: input.type === "text" ? text.slice(0, 80) : previewOf[input.type],
    },
  }).eq("id", input.chat.id);
  await bumpUnread(input.chat, input.me.uid);
  await setTyping(input.chat.id, input.me.uid, false);
}

export async function editMessage(chat: ChatRecord, message: MessageRecord, text: string) {
  await getSupabase().from("messages").update({
    body: text.trim(),
    edited_at: Date.now(),
    type: "text",
  }).eq("id", message.id).eq("chat_id", chat.id);
}

export async function deleteForMe(chatId: string, messageId: string, uid: string) {
  const { data } = await getSupabase().from("messages").select("deleted_for").eq("id", messageId).eq("chat_id", chatId).maybeSingle();
  const current = (data?.deleted_for || []) as string[];
  if (current.includes(uid)) return;
  await getSupabase().from("messages").update({ deleted_for: [...current, uid] }).eq("id", messageId);
}

export async function deleteForEveryone(chatId: string, messageId: string) {
  await getSupabase().from("messages").update({ deleted_for_all: true, body: "", ciphertext: "", file_path: null }).eq("id", messageId).eq("chat_id", chatId);
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