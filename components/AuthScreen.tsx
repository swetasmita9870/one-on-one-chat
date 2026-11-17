"use client";

import { FormEvent, useState } from "react";
import { Eye, EyeOff, MessageCircle } from "lucide-react";
import type { Identity } from "@/lib/crypto";
import { getSupabase, toAppUser, type AppUser } from "@/lib/supabase";
import { createProfile } from "@/lib/users";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export function AuthScreen({ onSignedIn }: { onSignedIn: (user: AppUser) => void }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const auth = getSupabase().auth;
      const result = mode === "up"
        ? await auth.signUp({ email: email.trim(), password })
        : await auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (!result.data.user || !result.data.session) throw new Error("Check your email to confirm the account, then sign in.");
      onSignedIn(toAppUser(result.data.user));
    } catch (err) {
      setError(authError(err, mode));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    setError("");
    try {
      const { error } = await getSupabase().auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
      if (error) throw error;
    } catch (err) {
      setError(authError(err, mode));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(ellipse_at_top,rgba(30,201,160,0.22),#07111a_48%)] px-4 py-10">
      <Card className="w-full max-w-md border-white/10 bg-panel/85 p-2 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
        <CardHeader>
          <MessageCircle className="size-10 text-gold" />
          <CardTitle className="text-5xl">Pingora</CardTitle>
          <CardDescription>Every moment connected.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input id="password" className="pr-10" value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} minLength={6} required />
                <button className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground" type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <Button className="w-full" disabled={busy} type="submit" size="lg">{busy ? "Please wait…" : mode === "up" ? "Create account" : "Sign in"}</Button>
          </form>
          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground"><Separator className="flex-1" />or<Separator className="flex-1" /></div>
          <Button className="w-full" variant="outline" type="button" disabled={busy} onClick={google}>Continue with Google</Button>
          <div className="mt-3 text-center">
            <Button variant="link" type="button" onClick={() => { setMode(mode === "up" ? "in" : "up"); setError(""); }}>
              {mode === "up" ? "Have an account? Sign in" : "New here? Create an account"}
            </Button>
          </div>
          <p className="mt-4 min-h-5 text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    </main>
  );
}

export function ProfileSetup({ user, identity, onDone }: { user: AppUser; identity: Identity; onDone: () => void }) {
  const [displayName, setDisplayName] = useState(user.displayName || "");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^[a-z0-9_]{3,20}$/i.test(username)) {
      setError("Username must be 3–20 letters, numbers, or underscores.");
      return;
    }
    try {
      await createProfile({
        uid: user.uid,
        displayName: displayName || username,
        username,
        about: "Hey there, I'm using Pingora.",
        photoURL: user.photoURL || "",
        identity,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your profile.");
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(ellipse_at_top,#3a2a1c_0%,#09090b_52%)] px-4">
      <Card className="w-full max-w-md border-white/10 bg-panel/85 p-2 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
        <CardHeader>
          <p className="text-[11px] font-medium tracking-[0.32em] text-gold uppercase">Welcome</p>
          <CardTitle>Your profile</CardTitle>
          <CardDescription>Choose a username so people can start a chat with you. The encryption key stays on this browser.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input id="username" value={username} placeholder="letters, numbers, underscore" onChange={(event) => setUsername(event.target.value)} maxLength={20} required />
            </div>
            <Button className="w-full" type="submit" size="lg">Save profile</Button>
            <p className="min-h-5 text-sm text-destructive">{error}</p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function authError(err: unknown, mode: "in" | "up") {
  const code = typeof err === "object" && err && "code" in err ? String((err as { code: string }).code) : "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "That email and password don't match.";
  if (code.includes("email-already-in-use")) return "That email already has an account. Sign in instead.";
  if (code.includes("invalid-email")) return "Enter a valid email address.";
  if (code.includes("weak-password")) return "Use a password of at least 6 characters.";
  if (code.includes("popup-closed") || code.includes("cancelled")) return "Google sign-in was closed before it finished.";
  if (code.includes("too-many-requests")) return "Too many attempts. Wait a moment and try again.";
  return err instanceof Error ? err.message : mode === "up" ? "Could not create the account." : "Could not sign in.";
}
