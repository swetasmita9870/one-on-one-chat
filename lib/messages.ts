import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore";
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
import { getFirebase } from "./firebase";
import type { ChatRecord, MessageKind, MessageRecord, UserProfile } from "./types";
import { readProfile } from "./users";

function messagesRef(chatId: string) {
  return collection(getFirebase().firestore, "chats", chatId, "messages");
}

function asMessage(id: string, data: Omit<MessageRecord, "id">): MessageRecord {
  return {
    senderId: data.senderId,
    createdAt: data.createdAt,
    type: data.type,
    ciphertext: data.ciphertext,
    nonce: data.nonce,
    wraps: data.wraps || {},
    epoch: data.epoch ?? null,
    contentKeyWrap: data.contentKeyWrap ?? null,
    replyTo: data.replyTo ?? null,
    editedAt: data.editedAt ?? null,
    deletedForAll: Boolean(data.deletedForAll),
    deletedFor: data.deletedFor || [],
    starredBy: data.starredBy || [],
    reactions: data.reactions || {},
    deliveredTo: data.deliveredTo || [],
    readBy: data.readBy || [],
    filePath: data.filePath ?? null,
    fileNonce: data.fileNonce ?? null,
    fileName: data.fileName ?? null,
    fileMime: data.fileMime ?? null,
    expiresAt: data.expiresAt ?? null,
    id,
  };
}

export function watchMessages(chatId: string, count: number, onData: (messages: MessageRecord[]) => void) {
  const messages = query(messagesRef(chatId), orderBy("createdAt", "desc"), limit(count));
  return onSnapshot(messages, (snap) => {
    onData(snap.docs.map((item) => asMessage(item.id, item.data() as Omit<MessageRecord, "id">)).reverse());
  });
}

export function watchTyping(chatId: string, onData: (typing: Record<string, number>) => void) {
  return onSnapshot(collection(getFirebase().firestore, "chats", chatId, "typing"), (snap) => {
    const typing: Record<string, number> = {};
    snap.docs.forEach((item) => {
      typing[item.id] = item.data().at as number;
    });
    onData(typing);
  });
}

export async function setTyping(chatId: string, uid: string, active: boolean) {
  const ref = doc(getFirebase().firestore, "chats", chatId, "typing", uid);
  if (active) await setDoc(ref, { at: Date.now() });
  else await deleteDoc(ref).catch(() => {});
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
  await addDoc(messagesRef(input.chat.id), {
    senderId: input.me.uid,
    createdAt: now,
    type: input.type,
    ciphertext: payload.ciphertext,
    nonce: payload.nonce,
    wraps,
    epoch: direct ? null : input.chat.currentEpoch,
    contentKeyWrap,
    replyTo: input.replyTo || null,
    editedAt: null,
    deletedForAll: false,
    deletedFor: [],
    starredBy: [],
    reactions: {},
    deliveredTo: [input.me.uid],
    readBy: [input.me.uid],
    filePath: null,
    fileNonce: null,
    fileName: null,
    fileMime: null,
    expiresAt,
  });
  await updateDoc(doc(getFirebase().firestore, "chats", input.chat.id), {
    updatedAt: now,
    lastMessage: {
      type: input.type,
      senderId: input.me.uid,
      at: now,
      preview: input.type === "text" ? input.text.trim().slice(0, 80) : previewOf[input.type],
    },
  });
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
  await updateDoc(doc(messagesRef(chat.id), message.id), {
    ciphertext: payload.ciphertext,
    nonce: payload.nonce,
    wraps: direct ? await wrapForDirect(contentKey, me, identity, chat.memberIds) : {},
    contentKeyWrap: direct ? null : await wrapForGroup(contentKey, await currentGroupKey(chat, me, identity)),
    epoch: direct ? null : chat.currentEpoch,
    editedAt: Date.now(),
    type: "text",
  });
}

export async function deleteForMe(chatId: string, messageId: string, uid: string) {
  await updateDoc(doc(messagesRef(chatId), messageId), { deletedFor: arrayUnion(uid) });
}

export async function deleteForEveryone(chatId: string, messageId: string) {
  await updateDoc(doc(messagesRef(chatId), messageId), {
    deletedForAll: true,
    ciphertext: "",
    filePath: null,
  });
}

export async function setReaction(chatId: string, messageId: string, uid: string, emoji: string, current?: string) {
  await updateDoc(doc(messagesRef(chatId), messageId), {
    [`reactions.${uid}`]: current === emoji ? deleteField() : emoji,
  });
}

export async function toggleStar(chatId: string, message: MessageRecord, uid: string) {
  await updateDoc(doc(messagesRef(chatId), message.id), {
    starredBy: message.starredBy?.includes(uid) ? arrayRemove(uid) : arrayUnion(uid),
  });
}

export async function markReceipt(chatId: string, messageId: string, uid: string, kind: "deliveredTo" | "readBy") {
  await updateDoc(doc(messagesRef(chatId), messageId), { [kind]: arrayUnion(uid) });
}

export async function clearUnread(chatId: string, uid: string) {
  await updateDoc(doc(getFirebase().firestore, "chats", chatId), { [`members.${uid}.unread`]: 0 });
}

export async function purgeExpired(messages: MessageRecord[], chatId: string) {
  const now = Date.now();
  await Promise.all(
    messages
      .filter((message) => message.expiresAt && message.expiresAt < now)
      .map((message) => deleteDoc(doc(messagesRef(chatId), message.id)))
  );
}
