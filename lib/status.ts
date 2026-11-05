import { addDoc, collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { b64ToBytes } from "./bytes";
import {
  decryptJson,
  encryptJson,
  randomContentKey,
  unwrapContentKey,
  wrapContentKey,
  type Identity,
} from "./crypto";
import { getFirebase } from "./firebase";
import type { StatusItem, UserProfile } from "./types";

export function watchStatus(uid: string, onData: (items: StatusItem[]) => void) {
  const items = query(collection(getFirebase().firestore, "statuses", uid, "items"), where("expiresAt", ">", Date.now() - 1000));
  return onSnapshot(items, (snap) => {
    const now = Date.now();
    onData(
      snap.docs
        .map((item) => ({ id: item.id, uid, ...(item.data() as Omit<StatusItem, "id" | "uid">) }))
        .filter((item) => item.expiresAt > now)
        .sort((a, b) => a.createdAt - b.createdAt)
    );
  });
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
  await addDoc(collection(getFirebase().firestore, "statuses", input.me.uid, "items"), {
    ciphertext: payload.ciphertext,
    nonce: payload.nonce,
    wraps,
    type: "text",
    filePath: null,
    fileNonce: null,
    createdAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    viewers: {},
  });
}

export async function markStatusViewed(uid: string, itemId: string, viewerId: string) {
  await updateDoc(doc(getFirebase().firestore, "statuses", uid, "items", itemId), {
    [`viewers.${viewerId}`]: Date.now(),
  });
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
