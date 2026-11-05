import { b64ToBytes, bytesToB64 } from "./bytes";
import { createIdentity, publicKeyFromSecret, type Identity } from "./crypto";

const DB_NAME = "justus-keys";
const STORE = "identities";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadIdentity(uid: string): Promise<Identity | null> {
  const db = await openDb();
  const secret = await new Promise<string | undefined>((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(uid);
    request.onsuccess = () => resolve(request.result as string | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  if (!secret) return null;
  const raw = b64ToBytes(secret);
  return { secret: raw, publicKey: publicKeyFromSecret(raw) };
}

export async function saveIdentity(uid: string, identity: Identity): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(bytesToB64(identity.secret), uid);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  db.close();
}

export async function ensureIdentity(uid: string): Promise<Identity> {
  const existing = await loadIdentity(uid);
  if (existing) return existing;
  const created = createIdentity();
  await saveIdentity(uid, created);
  return created;
}
