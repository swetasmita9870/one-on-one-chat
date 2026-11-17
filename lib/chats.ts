import { b64ToBytes } from "./bytes";
import { randomContentKey, unwrapContentKey, wrapContentKey, type Identity } from "./crypto";
import { getSupabase, insertQuiet, live } from "./supabase";
import type { ChatRecord, MemberInfo, UserProfile } from "./types";
import { readProfile } from "./users";

export function directChatId(a: string, b: string) {
  return [a, b].sort().join("__");
}

type MemberRow = {
  chat_id: string;
  user_id: string;
  role: "admin" | "member";
  joined_at: number;
  pinned: boolean;
  archived: boolean;
  muted_until: number;
  unread: number;
};

type ChatRow = {
  id: string;
  type: "direct" | "group";
  title: string;
  photo_url: string;
  updated_at: number;
  last_message: ChatRecord["lastMessage"];
  disappearing_ms: number | null;
  current_epoch: number;
  epochs: ChatRecord["epochs"];
};

function assemble(rows: ChatRow[], members: MemberRow[]): ChatRecord[] {
  return rows.map((row) => {
    const mine = members.filter((member) => member.chat_id === row.id);
    const memberMap: Record<string, MemberInfo> = {};
    mine.forEach((member) => {
      memberMap[member.user_id] = {
        role: member.role,
        joinedAt: Number(member.joined_at),
        pinned: member.pinned,
        archived: member.archived,
        mutedUntil: Number(member.muted_until || 0),
        unread: member.unread || 0,
      };
    });
    return {
      id: row.id,
      type: row.type,
      memberIds: mine.map((member) => member.user_id),
      members: memberMap,
      title: row.title || "",
      photoURL: row.photo_url || "",
      updatedAt: Number(row.updated_at),
      lastMessage: row.last_message,
      disappearingMs: row.disappearing_ms,
      currentEpoch: row.current_epoch || 0,
      epochs: row.epochs || {},
    };
  });
}

async function loadChats(uid: string): Promise<ChatRecord[]> {
  const { data: mine } = await getSupabase().from("chat_members").select("chat_id").eq("user_id", uid);
  const ids = (mine || []).map((row) => row.chat_id as string);
  if (!ids.length) return [];
  const [{ data: chats }, { data: members }] = await Promise.all([
    getSupabase().from("chats").select("*").in("id", ids),
    getSupabase().from("chat_members").select("*").in("chat_id", ids),
  ]);
  const rows = assemble((chats || []) as ChatRow[], (members || []) as MemberRow[]);
  rows.sort((a, b) => {
    const pin = Number(Boolean(b.members?.[uid]?.pinned)) - Number(Boolean(a.members?.[uid]?.pinned));
    const at = (chat: ChatRecord) => chat.lastMessage?.at || chat.updatedAt;
    return pin || at(b) - at(a);
  });
  return rows;
}

export function watchChats(uid: string, onData: (chats: ChatRecord[]) => void) {
  let timer = 0;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { void loadChats(uid).then(onData); }, 80);
  };
  void loadChats(uid).then(onData);
  const stopMembers = live("chat_members", schedule, `user_id=eq.${uid}`, false);
  const stopChats = live("chats", schedule, undefined, false);
  return () => {
    window.clearTimeout(timer);
    stopMembers();
    stopChats();
  };
}

export async function openDirect(me: UserProfile, other: UserProfile): Promise<string> {
  const id = directChatId(me.uid, other.uid);
  const { data: existing } = await getSupabase().from("chats").select("id").eq("id", id).maybeSingle();
  if (existing) return id;
  const now = Date.now();
  await insertQuiet("chats", {
    id,
    type: "direct",
    title: "",
    photo_url: "",
    updated_at: now,
    last_message: null,
    disappearing_ms: null,
    current_epoch: 0,
    epochs: {},
  });
  await insertQuiet("chat_members", { chat_id: id, user_id: me.uid, role: "member", joined_at: now });
  await insertQuiet("chat_members", { chat_id: id, user_id: other.uid, role: "member", joined_at: now });
  return id;
}

async function wrapGroupKey(groupKey: Uint8Array, me: UserProfile, identity: Identity, memberIds: string[]) {
  const wraps: Record<string, string> = {};
  for (const uid of memberIds) {
    const profile = uid === me.uid ? me : await readProfile(uid);
    if (!profile?.publicKey) throw new Error("A member does not have an encryption key yet.");
    wraps[uid] = await wrapContentKey(groupKey, identity.secret, b64ToBytes(profile.publicKey), me.uid);
  }
  return wraps;
}

export async function createGroup(me: UserProfile, identity: Identity, title: string, memberIds: string[]): Promise<string> {
  const ids = Array.from(new Set([me.uid, ...memberIds]));
  const groupKey = randomContentKey();
  const wraps = await wrapGroupKey(groupKey, me, identity, ids);
  const id = `g_${crypto.randomUUID()}`;
  const now = Date.now();
  await insertQuiet("chats", {
    id,
    type: "group",
    title: title.trim() || "Group",
    photo_url: "",
    updated_at: now,
    last_message: null,
    disappearing_ms: null,
    current_epoch: 1,
    epochs: { "1": wraps },
  });
  await insertQuiet("chat_members", { chat_id: id, user_id: me.uid, role: "admin", joined_at: now });
  const others = ids.filter((uid) => uid !== me.uid);
  if (others.length) {
    await insertQuiet("chat_members", others.map((uid) => ({ chat_id: id, user_id: uid, role: "member", joined_at: now })));
  }
  return id;
}

async function currentGroupKey(chat: ChatRecord, me: UserProfile, identity: Identity) {
  const epoch = String(chat.currentEpoch);
  const packed = chat.epochs?.[epoch]?.[me.uid];
  if (!packed) throw new Error("You don't have this group's key on this browser.");
  const authorId = packed.slice(0, packed.indexOf(":"));
  const author = authorId === me.uid ? me : await readProfile(authorId);
  if (!author) throw new Error("Missing key author.");
  return unwrapContentKey(packed, identity.secret, b64ToBytes(author.publicKey));
}

export async function addGroupMember(chat: ChatRecord, me: UserProfile, identity: Identity, uid: string) {
  if (chat.members[me.uid]?.role !== "admin") throw new Error("Only an admin can add people.");
  if (chat.memberIds.includes(uid)) return;
  const groupKey = await currentGroupKey(chat, me, identity);
  const profile = await readProfile(uid);
  if (!profile) throw new Error("That person has no profile.");
  const wrap = await wrapContentKey(groupKey, identity.secret, b64ToBytes(profile.publicKey), me.uid);
  const epoch = String(chat.currentEpoch);
  const epochs = { ...chat.epochs, [epoch]: { ...(chat.epochs[epoch] || {}), [uid]: wrap } };
  await getSupabase().from("chat_members").insert({ chat_id: chat.id, user_id: uid, role: "member", joined_at: Date.now() });
  await getSupabase().from("chats").update({ epochs, updated_at: Date.now() }).eq("id", chat.id);
}

export async function removeGroupMember(chat: ChatRecord, me: UserProfile, identity: Identity, uid: string) {
  if (chat.members[me.uid]?.role !== "admin") throw new Error("Only an admin can remove people.");
  if (uid === me.uid) throw new Error("Choose another admin before leaving.");
  const nextKey = randomContentKey();
  const remaining = chat.memberIds.filter((id) => id !== uid);
  const wraps = await wrapGroupKey(nextKey, me, identity, remaining);
  const nextEpoch = chat.currentEpoch + 1;
  await getSupabase().from("chat_members").delete().eq("chat_id", chat.id).eq("user_id", uid);
  await getSupabase().from("chats").update({
    current_epoch: nextEpoch,
    epochs: { ...chat.epochs, [String(nextEpoch)]: wraps },
    updated_at: Date.now(),
  }).eq("id", chat.id);
}

export async function updateGroup(chatId: string, patch: { title?: string; photoURL?: string }) {
  const row: Record<string, unknown> = { updated_at: Date.now() };
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.photoURL !== undefined) row.photo_url = patch.photoURL;
  await getSupabase().from("chats").update(row).eq("id", chatId);
}

export async function setMemberFlag(
  chatId: string,
  uid: string,
  patch: Partial<{ pinned: boolean; archived: boolean; mutedUntil: number; unread: number }>
) {
  const row: Record<string, unknown> = {};
  if (patch.pinned !== undefined) row.pinned = patch.pinned;
  if (patch.archived !== undefined) row.archived = patch.archived;
  if (patch.mutedUntil !== undefined) row.muted_until = patch.mutedUntil;
  if (patch.unread !== undefined) row.unread = patch.unread;
  await getSupabase().from("chat_members").update(row).eq("chat_id", chatId).eq("user_id", uid);
}

export async function setDisappearing(chatId: string, disappearingMs: number | null) {
  await getSupabase().from("chats").update({ disappearing_ms: disappearingMs }).eq("id", chatId);
}

export async function bumpUnread(chat: ChatRecord, senderId: string) {
  const { error } = await getSupabase().rpc("bump_unread", { cid: chat.id });
  if (!error) return;
  await Promise.all(chat.memberIds.filter((uid) => uid !== senderId).map(async (uid) => {
    const { data } = await getSupabase().from("chat_members").select("unread").eq("chat_id", chat.id).eq("user_id", uid).maybeSingle();
    await getSupabase().from("chat_members").update({ unread: Number(data?.unread || 0) + 1 }).eq("chat_id", chat.id).eq("user_id", uid);
  }));
}

export async function getChat(id: string): Promise<ChatRecord | null> {
  const { data } = await getSupabase().from("chats").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const { data: members } = await getSupabase().from("chat_members").select("*").eq("chat_id", id);
  return assemble([data as ChatRow], (members || []) as MemberRow[])[0] || null;
}

export async function ensureGroupWraps(chat: ChatRecord, me: UserProfile, identity: Identity) {
  if (chat.type !== "group") return;
  const epoch = String(chat.currentEpoch);
  const existing = chat.epochs?.[epoch] || {};
  if (!existing[me.uid]) return;
  const missing = chat.memberIds.filter((uid) => !existing[uid]);
  if (!missing.length) return;
  const groupKey = await currentGroupKey(chat, me, identity);
  const next = { ...existing };
  for (const uid of missing) {
    const profile = uid === me.uid ? me : await readProfile(uid);
    if (!profile) continue;
    next[uid] = await wrapContentKey(groupKey, identity.secret, b64ToBytes(profile.publicKey), me.uid);
  }
  await getSupabase().from("chats").update({ epochs: { ...chat.epochs, [epoch]: next } }).eq("id", chat.id);
}

export { currentGroupKey };
