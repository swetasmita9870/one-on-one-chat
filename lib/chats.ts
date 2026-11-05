import {
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  query,
  runTransaction,
  updateDoc,
  where,
} from "firebase/firestore";
import { b64ToBytes } from "./bytes";
import { randomContentKey, unwrapContentKey, wrapContentKey, type Identity } from "./crypto";
import { clearQuota, getFirebase, noteQuota } from "./firebase";
import type { ChatRecord, UserProfile } from "./types";
import { readProfile } from "./users";

export function directChatId(a: string, b: string) {
  return [a, b].sort().join("::");
}

function chatCollection() {
  return collection(getFirebase().firestore, "chats");
}

function asChat(id: string, data: Omit<ChatRecord, "id">): ChatRecord {
  return { id, ...data };
}

export function watchChats(uid: string, onData: (chats: ChatRecord[]) => void) {
  const chats = query(chatCollection(), where("memberIds", "array-contains", uid));
  return onSnapshot(chats, (snap) => {
    if (!snap.metadata.fromCache) clearQuota();
    const rows = snap.docs.map((item) => asChat(item.id, item.data() as Omit<ChatRecord, "id">));
    rows.sort((a, b) => {
      const pin = Number(Boolean(b.members?.[uid]?.pinned)) - Number(Boolean(a.members?.[uid]?.pinned));
      return pin || b.updatedAt - a.updatedAt;
    });
    onData(rows);
  }, (err) => {
    if (String(err.code).includes("resource-exhausted")) noteQuota();
  });
}

export async function openDirect(me: UserProfile, other: UserProfile): Promise<string> {
  const id = directChatId(me.uid, other.uid);
  const { firestore } = getFirebase();
  const ref = doc(firestore, "chats", id);
  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) return;
    const now = Date.now();
    tx.set(ref, {
      type: "direct",
      memberIds: [me.uid, other.uid].sort(),
      members: {
        [me.uid]: { role: "member", joinedAt: now, unread: 0 },
        [other.uid]: { role: "member", joinedAt: now, unread: 0 },
      },
      title: "",
      photoURL: "",
      updatedAt: now,
      lastMessage: null,
      disappearingMs: null,
      currentEpoch: 0,
      epochs: {},
    });
  });
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

export async function createGroup(
  me: UserProfile,
  identity: Identity,
  title: string,
  memberIds: string[]
): Promise<string> {
  const ids = Array.from(new Set([me.uid, ...memberIds]));
  const groupKey = randomContentKey();
  const wraps = await wrapGroupKey(groupKey, me, identity, ids);
  const id = `g_${crypto.randomUUID()}`;
  const now = Date.now();
  const members: ChatRecord["members"] = {};
  ids.forEach((uid) => {
    members[uid] = { role: uid === me.uid ? "admin" : "member", joinedAt: now, unread: 0 };
  });
  const { firestore } = getFirebase();
  await runTransaction(firestore, async (tx) => {
    tx.set(doc(firestore, "chats", id), {
      type: "group",
      memberIds: ids,
      members,
      title: title.trim() || "Group",
      photoURL: "",
      updatedAt: now,
      lastMessage: null,
      disappearingMs: null,
      currentEpoch: 1,
      epochs: { "1": wraps },
    });
  });
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
  await updateDoc(doc(getFirebase().firestore, "chats", chat.id), {
    memberIds: [...chat.memberIds, uid],
    [`members.${uid}`]: { role: "member", joinedAt: Date.now(), unread: 0 },
    [`epochs.${epoch}.${uid}`]: wrap,
    updatedAt: Date.now(),
  });
}

export async function removeGroupMember(chat: ChatRecord, me: UserProfile, identity: Identity, uid: string) {
  if (chat.members[me.uid]?.role !== "admin") throw new Error("Only an admin can remove people.");
  if (uid === me.uid) throw new Error("Choose another admin before leaving.");
  const nextKey = randomContentKey();
  const remaining = chat.memberIds.filter((id) => id !== uid);
  const wraps = await wrapGroupKey(nextKey, me, identity, remaining);
  const nextEpoch = chat.currentEpoch + 1;
  const members = { ...chat.members };
  delete members[uid];
  await updateDoc(doc(getFirebase().firestore, "chats", chat.id), {
    memberIds: remaining,
    members,
    currentEpoch: nextEpoch,
    [`epochs.${nextEpoch}`]: wraps,
    updatedAt: Date.now(),
  });
}

export async function updateGroup(chatId: string, patch: { title?: string; photoURL?: string }) {
  await updateDoc(doc(getFirebase().firestore, "chats", chatId), { ...patch, updatedAt: Date.now() });
}

export async function setMemberFlag(
  chatId: string,
  uid: string,
  patch: Partial<{ pinned: boolean; archived: boolean; mutedUntil: number; unread: number }>
) {
  const update: Record<string, unknown> = {};
  Object.entries(patch).forEach(([key, value]) => {
    update[`members.${uid}.${key}`] = value;
  });
  await updateDoc(doc(getFirebase().firestore, "chats", chatId), update);
}

export async function setDisappearing(chatId: string, disappearingMs: number | null) {
  await updateDoc(doc(getFirebase().firestore, "chats", chatId), { disappearingMs });
}

export async function bumpUnread(chat: ChatRecord, senderId: string) {
  const update: Record<string, unknown> = {};
  chat.memberIds.forEach((uid) => {
    if (uid !== senderId) update[`members.${uid}.unread`] = increment(1);
  });
  if (Object.keys(update).length) await updateDoc(doc(getFirebase().firestore, "chats", chat.id), update);
}

export async function getChat(id: string): Promise<ChatRecord | null> {
  const snap = await getDoc(doc(getFirebase().firestore, "chats", id));
  return snap.exists() ? asChat(snap.id, snap.data() as Omit<ChatRecord, "id">) : null;
}

export async function ensureGroupWraps(chat: ChatRecord, me: UserProfile, identity: Identity) {
  if (chat.type !== "group") return;
  const epoch = String(chat.currentEpoch);
  const existing = chat.epochs?.[epoch] || {};
  if (!existing[me.uid]) return;
  const missing = chat.memberIds.filter((uid) => !existing[uid]);
  if (!missing.length) return;
  const groupKey = await currentGroupKey(chat, me, identity);
  const added: Record<string, string> = {};
  for (const uid of missing) {
    const profile = uid === me.uid ? me : await readProfile(uid);
    if (!profile) continue;
    added[`epochs.${epoch}.${uid}`] = await wrapContentKey(
      groupKey,
      identity.secret,
      b64ToBytes(profile.publicKey),
      me.uid
    );
  }
  if (Object.keys(added).length) await updateDoc(doc(getFirebase().firestore, "chats", chat.id), added);
}

export { currentGroupKey };
