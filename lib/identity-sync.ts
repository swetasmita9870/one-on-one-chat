import { bytesToB64 } from "./bytes";
import { ensureIdentity, loadIdentity, saveIdentity } from "./keys";
import { packIdentityBackup, unpackIdentityBackup } from "./key-backup";
import { getKeyBackup, readProfile, saveKeyBackup } from "./users";

export async function uploadIdentityBackup(uid: string, password: string): Promise<void> {
  const identity = await loadIdentity(uid);
  if (!identity) return;
  await saveKeyBackup(uid, await packIdentityBackup(uid, password, identity));
}

/** After email sign-in: restore local key from backup or refresh cloud copy. */
export async function syncIdentityOnLogin(uid: string, password: string): Promise<void> {
  const profile = await readProfile(uid);
  const stored = await loadIdentity(uid);
  const backup = await getKeyBackup(uid);
  const remoteKey = profile?.publicKey || "";

  if (stored && (!remoteKey || bytesToB64(stored.publicKey) === remoteKey)) {
    await saveIdentity(uid, stored);
    await saveKeyBackup(uid, await packIdentityBackup(uid, password, stored));
    return;
  }

  if (backup && remoteKey) {
    const restored = await unpackIdentityBackup(uid, password, backup);
    if (bytesToB64(restored.publicKey) !== remoteKey) {
      throw new Error("The saved key does not match this account. Sign in on your old device and back up again, or reset the key.");
    }
    await saveIdentity(uid, restored);
    return;
  }

  if (remoteKey) throw new Error("NEEDS_UNLOCK");
}

export async function restoreIdentityWithPassword(uid: string, password: string): Promise<boolean> {
  const profile = await readProfile(uid);
  if (!profile?.publicKey) return false;
  const backup = await getKeyBackup(uid);
  if (!backup) return false;
  try {
    const restored = await unpackIdentityBackup(uid, password, backup);
    if (bytesToB64(restored.publicKey) !== profile.publicKey) return false;
    await saveIdentity(uid, restored);
    return true;
  } catch {
    return false;
  }
}

export async function createIdentityWithBackup(uid: string, password: string) {
  const identity = await ensureIdentity(uid);
  await saveKeyBackup(uid, await packIdentityBackup(uid, password, identity));
  return identity;
}