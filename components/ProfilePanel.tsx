"use client";

import { useState } from "react";
import { ArrowLeft, Camera, LogOut, Moon, Sun } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { useAppStore } from "@/lib/store";
import { GRADIENT_WALLPAPERS, PHOTO_WALLPAPERS, WALLPAPER_LABELS, wallpaperClassName, wallpaperStyle, type WallpaperId } from "@/lib/wallpapers";
import type { UserProfile } from "@/lib/types";
import { updateProfile, uploadAvatar } from "@/lib/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ProfilePanel({
  profile,
  theme,
  onTheme,
  onClose,
}: {
  profile: UserProfile;
  theme: "dark" | "light";
  onTheme: (theme: "dark" | "light") => void;
  onClose: () => void;
}) {
  const wallpaper = useAppStore((state) => state.wallpaper);
  const setWallpaper = useAppStore((state) => state.setWallpaper);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [about, setAbout] = useState(profile.about);
  const [username, setUsername] = useState(profile.username);
  const [error, setError] = useState("");
  const dirty = displayName !== profile.displayName || about !== profile.about || username !== profile.username;

  async function save() {
    setError("");
    try {
      await updateProfile(profile, { displayName, about, username, privacy: profile.privacy });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  function setPrivacy(field: keyof UserProfile["privacy"], value: UserProfile["privacy"]["lastSeen"]) {
    void updateProfile(profile, { privacy: { ...profile.privacy, [field]: value } });
  }

  return (
    <aside className="absolute inset-y-0 left-0 z-40 flex w-full animate-in slide-in-from-left duration-200 flex-col bg-ink shadow-2xl md:w-[380px]">
      <header className="flex h-16 shrink-0 items-center gap-4 bg-gradient-to-br from-[#14967a] to-[#0b4f45] px-3 text-white">
        <button className="grid size-10 place-items-center rounded-full hover:bg-white/10" type="button" aria-label="Back" onClick={onClose}>
          <ArrowLeft />
        </button>
        <h2 className="text-xl font-medium">Profile</h2>
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-4">
        <section className="bg-panel px-6 pb-6 pt-7 text-center">
          <label className="relative mx-auto block size-36 cursor-pointer">
            <span className="grid size-36 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[#1ec9a0] to-[#0b4f45] text-4xl text-white ring-4 ring-ink">
              {profile.photoURL ? <img src={profile.photoURL} alt="" className="size-full object-cover" /> : (displayName || "?").slice(0, 1).toUpperCase()}
            </span>
            <span className="absolute right-1 bottom-1 grid size-9 place-items-center rounded-full bg-gold text-gold-ink shadow-lg">
              <Camera className="size-4" />
            </span>
            <input className="sr-only" type="file" accept="image/*" onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const url = await uploadAvatar(profile.uid, file);
              await updateProfile(profile, { photoURL: url });
            }} />
          </label>
          <p className="mt-4 text-lg font-medium">{displayName || profile.displayName}</p>
          <p className="text-sm text-muted-foreground">@{username || profile.username}</p>
        </section>

        <section className="divide-y divide-line bg-panel px-5">
          <Field label="Name" value={displayName} onChange={setDisplayName} />
          <Field label="Username" value={username} onChange={setUsername} />
          <Field label="About" value={about} onChange={setAbout} multiline />
        </section>

        <section className="bg-panel px-5 py-2">
          <p className="px-0 py-2 text-xs font-medium tracking-wide text-gold">Privacy</p>
          {([
            ["lastSeen", "Last seen"],
            ["photo", "Profile photo"],
            ["about", "About"],
          ] as const).map(([field, label]) => (
            <div className="flex items-center justify-between gap-3 py-2.5" key={field}>
              <span className="text-sm">{label}</span>
              <select
                className="rounded-full bg-raised px-3 py-1.5 text-sm text-muted-foreground outline-none"
                value={profile.privacy[field]}
                onChange={(event) => setPrivacy(field, event.target.value as UserProfile["privacy"]["lastSeen"])}
              >
                <option value="everyone">Everyone</option>
                <option value="contacts">Contacts</option>
              </select>
            </div>
          ))}
        </section>

        <section className="bg-panel px-5 py-4">
          <p className="text-xs font-medium tracking-wide text-gold">Appearance</p>
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-full bg-raised p-1">
            <button className={`flex items-center justify-center gap-2 rounded-full py-2 text-sm transition ${theme === "dark" ? "bg-panel text-fg shadow ring-1 ring-line" : "text-muted-foreground hover:bg-white/5"}`} type="button" onClick={() => onTheme("dark")}><Moon className="size-4" /> Dark</button>
            <button className={`flex items-center justify-center gap-2 rounded-full py-2 text-sm transition ${theme === "light" ? "bg-white text-ink shadow ring-1 ring-line" : "text-muted-foreground hover:bg-white/5"}`} type="button" onClick={() => onTheme("light")}><Sun className="size-4" /> Light</button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Chat background</p>
          <div className="mt-2 grid grid-cols-5 gap-2">
            {GRADIENT_WALLPAPERS.map((id) => (
              <button key={id} type="button" aria-label={WALLPAPER_LABELS[id]} title={WALLPAPER_LABELS[id]} onClick={() => setWallpaper(id)} className={`${wallpaperClassName(id)} h-12 rounded-xl ring-2 ring-offset-2 ring-offset-panel ${wallpaper === id ? "ring-gold" : "ring-transparent"}`} />
            ))}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {PHOTO_WALLPAPERS.map(({ id }) => (
              <button
                key={id}
                type="button"
                aria-label={WALLPAPER_LABELS[id]}
                title={WALLPAPER_LABELS[id]}
                onClick={() => setWallpaper(id)}
                className={`${wallpaperClassName(id)} h-12 rounded-xl ring-2 ring-offset-2 ring-offset-panel ${wallpaper === id ? "ring-gold" : "ring-transparent"}`}
                style={wallpaperStyle(id)}
              />
            ))}
          </div>
        </section>

        <section className="bg-panel">
          <button className="flex w-full items-center gap-3 px-5 py-4 text-left text-sm hover:bg-white/[0.03]" type="button" onClick={() => getSupabase().auth.signOut()}>
            <LogOut className="size-4 text-gold" />
            Sign out
          </button>
        </section>
        {error ? <p className="px-5 text-sm text-destructive">{error}</p> : null}
      </div>
      {dirty ? (
        <div className="shrink-0 border-t border-line bg-panel p-3">
          <Button className="w-full" type="button" onClick={save}>Save</Button>
        </div>
      ) : null}
    </aside>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  const className = "mt-1 w-full bg-transparent text-[15px] text-fg outline-none placeholder:text-muted-foreground";
  return (
    <label className="block py-3">
      <span className="text-xs text-gold">{label}</span>
      {multiline ? (
        <textarea className={`${className} min-h-12 resize-none`} rows={2} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input className={className} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}
