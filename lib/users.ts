import { doc, getDoc, onSnapshot, runTransaction, updateDoc } from "firebase/firestore";
import { bytesToB64 } from "./bytes";
import type { Identity } from "./crypto";
import { clearQuota, getFirebase, noteQuota } from "./firebase";
import type { Privacy, UserProfile } from "./types";

function userRef(uid: string) {
  return doc(getFirebase().firestore, "users", uid);
}

export function emptyPrivacy(): UserProfile["privacy"] {
  return { lastSeen: "everyone", photo: "everyone", about: "everyone" };
}

export async function readProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(userRef(uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export function watchProfile(uid: string, onData: (profile: UserProfile | null) => void) {
  return onSnapshot(
    userRef(uid),
    (snap) => {
      if (!snap.metadata.fromCache) clearQuota();
      onData(snap.exists() ? (snap.data() as UserProfile) : null);
    },
    (err) => {
      if (String(err.code).includes("resource-exhausted")) noteQuota();
    }
  );
}

export async function createProfile(input: {
  uid: string;
  displayName: string;
  username: string;
  about: string;
  photoURL: string;
  identity: Identity;
}): Promise<void> {
  const usernameLower = input.username.trim().toLowerCase();
  const { firestore } = getFirebase();
  await runTransaction(firestore, async (tx) => {
    const nameRef = doc(firestore, "usernames", usernameLower);
    const taken = await tx.get(nameRef);
    if (taken.exists() && taken.data().uid !== input.uid) throw new Error("That username is taken.");
    tx.set(nameRef, { uid: input.uid });
    tx.set(userRef(input.uid), {
      uid: input.uid,
      displayName: input.displayName.trim(),
      username: usernameLower,
      usernameLower,
      about: input.about.trim() || "Hey there, I'm using Just Us.",
      photoURL: input.photoURL,
      publicKey: bytesToB64(input.identity.publicKey),
      lastSeen: Date.now(),
      online: true,
      privacy: emptyPrivacy(),
    } satisfies UserProfile);
  });
}

export async function updateProfile(
  current: UserProfile,
  patch: Partial<Pick<UserProfile, "displayName" | "about" | "photoURL" | "publicKey">> & {
    username?: string;
    privacy?: UserProfile["privacy"];
  }
): Promise<void> {
  const { firestore } = getFirebase();
  const nextName = patch.username?.trim().toLowerCase();
  if (nextName && nextName !== current.usernameLower) {
    await runTransaction(firestore, async (tx) => {
      const nameRef = doc(firestore, "usernames", nextName);
      const taken = await tx.get(nameRef);
      if (taken.exists() && taken.data().uid !== current.uid) throw new Error("That username is taken.");
      tx.delete(doc(firestore, "usernames", current.usernameLower));
      tx.set(nameRef, { uid: current.uid });
      tx.update(userRef(current.uid), {
        ...patch,
        username: nextName,
        usernameLower: nextName,
      });
    });
    return;
  }
  await updateDoc(userRef(current.uid), patch);
}

export async function uploadAvatar(_uid: string, file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that photo.");
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  ctx.drawImage(bitmap, (size - bitmap.width * scale) / 2, (size - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale);
  return canvas.toDataURL("image/jpeg", 0.72);
}

export function quotaMessage(err: unknown) {
  const code = typeof err === "object" && err && "code" in err ? String((err as { code: string }).code) : "";
  if (code.includes("resource-exhausted")) {
    noteQuota();
    return "Firebase's free daily quota is used up. Search will work again after it resets, usually within a day.";
  }
  return err instanceof Error ? err.message : "Could not search.";
}

export async function findByUsername(username: string): Promise<UserProfile | null> {
  const key = username.trim().toLowerCase().replace(/^@/, "");
  if (!key) return null;
  try {
    const snap = await getDoc(doc(getFirebase().firestore, "usernames", key));
    if (!snap.exists()) return null;
    return readProfile(snap.data().uid as string);
  } catch (err) {
    throw new Error(quotaMessage(err));
  }
}

export function startPresence(uid: string) {
  const ref = userRef(uid);
  const beat = () => {
    updateDoc(ref, { online: true, lastSeen: Date.now() })
      .then(() => clearQuota())
      .catch((err: unknown) => {
        const code = typeof err === "object" && err && "code" in err ? String((err as { code: string }).code) : "";
        if (code.includes("resource-exhausted")) noteQuota();
      });
  };
  beat();
  const timer = window.setInterval(beat, 60000);
  const away = () => updateDoc(ref, { online: false, lastSeen: Date.now() }).catch(() => {});
  window.addEventListener("pagehide", away);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("pagehide", away);
  };
}

export function visibleField(profile: UserProfile, field: keyof UserProfile["privacy"], isContact: boolean) {
  const setting: Privacy = profile.privacy?.[field] || "everyone";
  return setting === "everyone" || isContact;
}
