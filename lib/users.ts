import { bytesToB64 } from "./bytes";
import type { Identity } from "./crypto";
import { useAppStore } from "./store";
import { getSupabase, live } from "./supabase";
import type { Privacy, UserProfile } from "./types";

type ProfileRow = {
  id: string;
  display_name: string;
  username: string;
  username_lower: string;
  about: string;
  photo_url: string;
  public_key: string;
  last_seen: number;
  online: boolean;
  privacy: UserProfile["privacy"];
};

function asProfile(row: ProfileRow): UserProfile {
  return {
    uid: row.id,
    displayName: row.display_name,
    username: row.username,
    usernameLower: row.username_lower,
    about: row.about,
    photoURL: row.photo_url || "",
    publicKey: row.public_key,
    lastSeen: Number(row.last_seen || 0),
    online: Boolean(row.online),
    privacy: row.privacy || emptyPrivacy(),
  };
}

export function emptyPrivacy(): UserProfile["privacy"] {
  return { lastSeen: "everyone", photo: "everyone", about: "everyone" };
}

const profileLoads = new Map<string, Promise<UserProfile | null>>();

export async function readProfile(uid: string, fresh = false): Promise<UserProfile | null> {
  if (!fresh) {
    const cached = useAppStore.getState().profiles[uid];
    if (cached) return cached;
  }
  const pending = profileLoads.get(uid);
  if (pending) return pending;
  const request = (async () => {
    const { data } = await getSupabase().from("profiles").select("*").eq("id", uid).maybeSingle();
    const profile = data ? asProfile(data as ProfileRow) : null;
    if (profile) useAppStore.getState().putProfiles([profile]);
    return profile;
  })();
  profileLoads.set(uid, request);
  try {
    return await request;
  } finally {
    profileLoads.delete(uid);
  }
}

export async function ensureProfiles(ids: string[]) {
  const known = useAppStore.getState().profiles;
  const missing = Array.from(new Set(ids)).filter((id) => id && !known[id]);
  if (!missing.length) return;
  const { data } = await getSupabase().from("profiles").select("*").in("id", missing);
  if (data?.length) useAppStore.getState().putProfiles((data as ProfileRow[]).map(asProfile));
}

export function watchProfile(uid: string, onData: (profile: UserProfile | null) => void) {
  return live("profiles", async () => {
    onData(await readProfile(uid, true));
  }, `id=eq.${uid}`);
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
  const { error } = await getSupabase().from("profiles").insert({
    id: input.uid,
    display_name: input.displayName.trim(),
    username: usernameLower,
    username_lower: usernameLower,
    about: input.about.trim() || "Hey there, I'm using Pingora.",
    photo_url: input.photoURL,
    public_key: bytesToB64(input.identity.publicKey),
    last_seen: Date.now(),
    online: true,
    privacy: emptyPrivacy(),
  });
  if (error) throw new Error(error.code === "23505" ? "That username is taken." : error.message);
}

export async function updateProfile(
  current: UserProfile,
  patch: Partial<Pick<UserProfile, "displayName" | "about" | "photoURL" | "publicKey">> & {
    username?: string;
    privacy?: UserProfile["privacy"];
  }
): Promise<void> {
  const nextName = patch.username?.trim().toLowerCase();
  const row: Record<string, unknown> = {};
  if (patch.displayName !== undefined) row.display_name = patch.displayName;
  if (patch.about !== undefined) row.about = patch.about;
  if (patch.photoURL !== undefined) row.photo_url = patch.photoURL;
  if (patch.publicKey !== undefined) row.public_key = patch.publicKey;
  if (patch.privacy !== undefined) row.privacy = patch.privacy;
  if (nextName && nextName !== current.usernameLower) {
    row.username = nextName;
    row.username_lower = nextName;
  }
  const { error } = await getSupabase().from("profiles").update(row).eq("id", current.uid);
  if (error) throw new Error(error.code === "23505" ? "That username is taken." : error.message);
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

export async function listPeople(): Promise<UserProfile[]> {
  const { data, error } = await getSupabase().from("profiles").select("*").order("display_name").limit(200);
  if (error) throw new Error(error.message);
  return ((data || []) as ProfileRow[]).map(asProfile);
}

export async function searchPeople(query: string): Promise<UserProfile[]> {
  const key = query.trim().replace(/^@/, "").replace(/[%_,]/g, "");
  if (!key) return [];
  const { data, error } = await getSupabase()
    .from("profiles")
    .select("*")
    .or(`username_lower.ilike.%${key}%,display_name.ilike.%${key}%`)
    .limit(8);
  if (error) throw new Error(error.message);
  return ((data || []) as ProfileRow[]).map(asProfile);
}

export async function findByUsername(username: string): Promise<UserProfile | null> {
  const key = username.trim().toLowerCase().replace(/^@/, "");
  const people = await searchPeople(username);
  return people.find((person) => person.usernameLower === key)
    || people.find((person) => person.displayName.toLowerCase() === key)
    || (people.length === 1 ? people[0] : null);
}

export function startPresence(uid: string) {
  const beat = () => {
    void getSupabase().from("profiles").update({ online: true, last_seen: Date.now() }).eq("id", uid);
  };
  beat();
  const timer = window.setInterval(beat, 60000);
  const away = () => { void getSupabase().from("profiles").update({ online: false, last_seen: Date.now() }).eq("id", uid); };
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
