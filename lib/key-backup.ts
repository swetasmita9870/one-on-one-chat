import { b64ToBytes, bytesToB64 } from "./bytes";
import { publicKeyFromSecret, type Identity } from "./crypto";

async function deriveKey(uid: string, password: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode(`pingora-key-v1:${uid}`), iterations: 120_000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function packIdentityBackup(uid: string, password: string, identity: Identity): Promise<string> {
  const key = await deriveKey(uid, password);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, identity.secret as BufferSource);
  const packed = new Uint8Array(12 + cipher.byteLength);
  packed.set(iv);
  packed.set(new Uint8Array(cipher), 12);
  return bytesToB64(packed);
}

export async function unpackIdentityBackup(uid: string, password: string, packed: string): Promise<Identity> {
  const raw = b64ToBytes(packed);
  const key = await deriveKey(uid, password);
  const secret = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, key, raw.slice(12)));
  return { secret, publicKey: publicKeyFromSecret(secret) };
}