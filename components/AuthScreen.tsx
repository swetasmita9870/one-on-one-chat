"use client";

import { FormEvent, useState } from "react";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { getSupabase, toAppUser, type AppUser } from "@/lib/supabase";
import { createProfile } from "@/lib/users";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { PingoraMark } from "./PingoraMark";

function GoogleGlyph() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.2-1.6 3.5-5.5 3.5-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C17.2 3 14.8 2 12 2 6.9 2 2.7 6.2 2.7 11.3S6.9 20.6 12 20.6c6.9 0 8.4-4.8 8.4-7.2 0-.5 0-1-.1-1.4H12z" />
    </svg>
  );
}

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
    <main className="auth-shell grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <AuthHeading />
        <Card className="auth-card rounded-[28px] border">
          <CardHeader className="pb-2">
            <CardTitle className="font-sans text-2xl font-semibold">{mode === "up" ? "Create account" : "Welcome back"}</CardTitle>
            <CardDescription>{mode === "up" ? "Join Pingora to start chatting." : "Sign in to continue to Pingora."}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="email" className="pl-10" value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="you@example.com" required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="password" className="pr-10 pl-10" value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} minLength={6} required />
                  <button className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-fg" type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              <Button className="btn-auth-primary h-12 w-full border-0 text-base shadow-lg" disabled={busy} type="submit" size="lg">
                {busy ? "Please wait…" : mode === "up" ? "Create account" : "Sign in"}
              </Button>
            </form>
            <div className="my-5 flex items-center gap-3 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              <Separator className="flex-1" />
              or
              <Separator className="flex-1" />
            </div>
            <Button className="h-12 w-full border-line bg-raised/80 hover:bg-raised" variant="outline" type="button" disabled={busy} onClick={google}>
              <GoogleGlyph />
              Continue with Google
            </Button>
            <p className="mt-5 text-center text-sm text-muted-foreground">
              {mode === "up" ? "Already have an account?" : "Don't have an account?"}{" "}
              <button className="font-medium text-gold hover:underline" type="button" onClick={() => { setMode(mode === "up" ? "in" : "up"); setError(""); }}>
                {mode === "up" ? "Sign in" : "Create one"}
              </button>
            </p>
            <p className="mt-4 min-h-5 text-center text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function AuthHeading() {
  return (
    <div className="mb-8 text-center">
      <PingoraMark className="mx-auto mb-4 size-16" />
      <h1 className="font-serif text-5xl font-light tracking-tight text-fg sm:text-6xl">Pingora</h1>
      <p className="mt-2 text-sm text-muted-foreground">Every moment connected.</p>
    </div>
  );
}

export function ProfileSetup({ user, onDone }: { user: AppUser; onDone: () => void }) {
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
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your profile.");
    }
  }

  return (
    <main className="auth-shell grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-md">
        <AuthHeading />
        <Card className="auth-card rounded-[28px] border">
          <CardHeader>
            <p className="text-[11px] font-medium tracking-[0.32em] text-gold uppercase">Welcome</p>
            <CardTitle className="font-sans text-2xl font-semibold">Your profile</CardTitle>
            <CardDescription>Choose a username so people can start a chat with you.</CardDescription>
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
              <Button className="btn-auth-primary h-12 w-full border-0" type="submit" size="lg">Save profile</Button>
              <p className="min-h-5 text-sm text-destructive">{error}</p>
            </form>
          </CardContent>
        </Card>
      </div>
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