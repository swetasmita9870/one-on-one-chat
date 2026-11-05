"use client";

import { useState } from "react";
import { signOut } from "firebase/auth";
import { createIdentity } from "@/lib/crypto";
import { getFirebase } from "@/lib/firebase";
import { saveIdentity } from "@/lib/keys";
import type { UserProfile } from "@/lib/types";
import { updateProfile, uploadAvatar } from "@/lib/users";
import { bytesToB64 } from "@/lib/bytes";
import { Avatar } from "./ChatList";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function ProfilePanel({
  profile,
  theme,
  onTheme,
  onClose,
  onKeyReset,
}: {
  profile: UserProfile;
  theme: "dark" | "light";
  onTheme: (theme: "dark" | "light") => void;
  onClose: () => void;
  onKeyReset: () => void;
}) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [about, setAbout] = useState(profile.about);
  const [username, setUsername] = useState(profile.username);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    try {
      await updateProfile(profile, { displayName, about, username, privacy: profile.privacy });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar name={displayName || profile.displayName} photo={profile.photoURL} />
            <label className="cursor-pointer text-sm text-gold">
              Change photo
              <input className="sr-only" type="file" accept="image/*" onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const url = await uploadAvatar(profile.uid, file);
                await updateProfile(profile, { photoURL: url });
              }} />
            </label>
          </div>
          <div className="space-y-1.5"><Label htmlFor="profile-name">Name</Label><Input id="profile-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="profile-username">Username</Label><Input id="profile-username" value={username} onChange={(event) => setUsername(event.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="profile-about">About</Label><Textarea id="profile-about" value={about} onChange={(event) => setAbout(event.target.value)} /></div>
          <div className="space-y-3 rounded-2xl border border-line p-3">
            <p className="text-sm font-medium">Who can see</p>
            {([
              ["lastSeen", "Last seen"],
              ["photo", "Profile photo"],
              ["about", "About"],
            ] as const).map(([field, label]) => (
              <div className="space-y-1.5" key={field}>
                <Label>{label}</Label>
                <Select value={profile.privacy[field]} onValueChange={(value) => updateProfile(profile, { privacy: { ...profile.privacy, [field]: value as UserProfile["privacy"]["lastSeen"] } })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="everyone">Everyone</SelectItem>
                    <SelectItem value="contacts">Contacts only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant={theme === "dark" ? "default" : "outline"} type="button" onClick={() => onTheme("dark")}>Dark</Button>
            <Button variant={theme === "light" ? "default" : "outline"} type="button" onClick={() => onTheme("light")}>Light</Button>
          </div>
          <div className="rounded-2xl border border-danger/40 p-3">
            <p className="text-sm">Resetting the encryption key makes older messages unreadable on this browser.</p>
            <Button variant="ghost" className="mt-2 px-0 text-danger" type="button" onClick={async () => {
              const identity = createIdentity();
              await saveIdentity(profile.uid, identity);
              await updateProfile(profile, { publicKey: bytesToB64(identity.publicKey) });
              onKeyReset();
            }}>Reset encryption key</Button>
          </div>
          <p className="min-h-5 text-sm text-destructive">{error}</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" type="button" onClick={() => signOut(getFirebase().auth)}>Sign out</Button>
          <Button variant="ghost" type="button" onClick={onClose}>Close</Button>
          <Button type="button" onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
