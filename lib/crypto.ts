import { x25519 } from "@noble/curves/ed25519";
import { b64ToBytes, bytesToB64 } from "./bytes";

function buffer(bytes: Uint8Array): BufferSource {
  return new Uint8Array(bytes) as BufferSource;
}

export type Identity = { secret: Uint8Array; publicKey: Uint8Array };

export function publicKeyFromSecret(secret: Uint8Array): Uint8Array {
  return x25519.getPublicKey(secret);
}

export function createIdentity(): Identity {
  const secret = x25519.utils.randomSecretKey();
  return { secret, publicKey: publicKeyFromSecret(secret) };
}

async function wrappingKey(mySecret: Uint8Array, theirPublic: Uint8Array): Promise<CryptoKey> {
  const shared = x25519.getSharedSecret(mySecret, theirPublic);
  const digest = await crypto.subtle.digest("SHA-256", buffer(shared));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export function randomContentKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export async function wrapContentKey(
  contentKey: Uint8Array,
  mySecret: Uint8Array,
  theirPublic: Uint8Array,
  wrappedBy: string
): Promise<string> {
  const key = await wrappingKey(mySecret, theirPublic);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, buffer(contentKey)));
  const packed = new Uint8Array(iv.length + cipher.length);
  packed.set(iv);
  packed.set(cipher, iv.length);
  return `${wrappedBy}:${bytesToB64(packed)}`;
}

export function wrapAuthor(packed: string): string {
  return packed.slice(0, packed.indexOf(":"));
}

export async function unwrapContentKey(
  packed: string,
  mySecret: Uint8Array,
  authorPublic: Uint8Array
): Promise<Uint8Array> {
  const packedBytes = b64ToBytes(packed.slice(packed.indexOf(":") + 1));
  const key = await wrappingKey(mySecret, authorPublic);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: buffer(packedBytes.slice(0, 12)) },
    key,
    buffer(packedBytes.slice(12))
  );
  return new Uint8Array(plain);
}

export async function encryptBytes(plain: Uint8Array, contentKey: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aes = await crypto.subtle.importKey("raw", buffer(contentKey), "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, buffer(plain)));
  return { nonce: bytesToB64(iv), ciphertext: cipher };
}

export async function decryptBytes(ciphertext: Uint8Array, nonce: string, contentKey: Uint8Array) {
  const aes = await crypto.subtle.importKey("raw", buffer(contentKey), "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: buffer(b64ToBytes(nonce)) },
    aes,
    buffer(ciphertext)
  );
  return new Uint8Array(plain);
}

export async function encryptJson(value: unknown, contentKey: Uint8Array) {
  const encoded = await encryptBytes(new TextEncoder().encode(JSON.stringify(value)), contentKey);
  return { nonce: encoded.nonce, ciphertext: bytesToB64(encoded.ciphertext) };
}

export async function decryptJson<T>(ciphertext: string, nonce: string, contentKey: Uint8Array): Promise<T> {
  const plain = await decryptBytes(b64ToBytes(ciphertext), nonce, contentKey);
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

export async function safetyCode(first: string, second: string): Promise<string> {
  const material = [first, second].sort().join("|");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material)));
  const groups: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    const value = (digest[i * 2] << 8) | digest[i * 2 + 1];
    groups.push(String(value % 10000).padStart(4, "0"));
  }
  return groups.join(" ");
}
