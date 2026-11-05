"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Archive, MessageSquarePlus, Users, X } from "lucide-react";
import type { User } from "firebase/auth";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { bytesToB64 } from "@/lib/bytes";
import { endCall, watchIncoming } from "@/lib/calls";
import { createGroup, openDirect, watchChats } from "@/lib/chats";
import type { Identity } from "@/lib/crypto";
import { chatPhoto, chatTitle } from "@/lib/format";
import { getFirebase, isConfigured, onQuota } from "@/lib/firebase";
import { ensureIdentity, loadIdentity } from "@/lib/keys";
import { sendPayload } from "@/lib/messages";
import type { CallRecord, ChatRecord, UserProfile } from "@/lib/types";
import { findByUsername, readProfile, startPresence, watchProfile } from "@/lib/users";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthScreen, ProfileSetup } from "./AuthScreen";
import { CallScreen } from "./CallScreen";
import { ChatInfo } from "./ChatInfo";
import { Avatar, ChatList } from "./ChatList";
import { ProfilePanel } from "./ProfilePanel";
import { StatusTray, StatusViewer } from "./StatusTray";
import { Thread } from "./Thread";

type CallLaunch = { role: "caller" | "callee"; peerId: string; video: boolean; callId?: string };

export function AppShell() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [keyProblem, setKeyProblem] = useState("");
  const [chats, setChats] = useState<ChatRecord[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [info, setInfo] = useState(false);
  const [dialog, setDialog] = useState<"profile" | "new" | "group" | "forward" | null>(null);
  const [forwardText, setForwardText] = useState("");
  const [statusUid, setStatusUid] = useState<string | null>(null);
  const [call, setCall] = useState<CallLaunch | null>(null);
  const [incoming, setIncoming] = useState<CallRecord | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    document.body.dataset.theme = theme;
  }, [theme]);

  useEffect(() => onQuota(setQuotaExceeded), []);

  useEffect(() => {
    if (!isConfigured) { setReady(true); return; }
    return onAuthStateChanged(getFirebase().auth, (next) => {
      if (next?.isAnonymous) {
        void signOut(getFirebase().auth);
        setUser(null);
        setReady(true);
        return;
      }
      setUser(next);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!user) { setProfile(null); setIdentity(null); setProfileLoaded(false); return; }
    return watchProfile(user.uid, (next) => {
      setProfile(next);
      setProfileLoaded(true);
    });
  }, [user]);

  const publicKey = profile?.publicKey || "";

  useEffect(() => {
    if (!user) return;
    let stop = () => {};
    let cancelled = false;
    (async () => {
      const stored = await loadIdentity(user.uid);
      if (cancelled) return;
      if (!publicKey) {
        setIdentity(stored || await ensureIdentity(user.uid));
        setKeyProblem("");
        return;
      }
      if (stored && bytesToB64(stored.publicKey) === publicKey) {
        setIdentity(stored);
        setKeyProblem("");
        stop = startPresence(user.uid);
        return;
      }
      if (!stored) {
        setIdentity(null);
        setKeyProblem("This browser does not have the encryption key for this account.");
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [publicKey, user]);

  const profileUid = profile?.uid || "";
  const profileRef = useRef(profile);
  const profilesRef = useRef(profiles);
  profileRef.current = profile;
  profilesRef.current = profiles;

  useEffect(() => {
    if (!profileUid) return;
    return watchChats(profileUid, setChats);
  }, [profileUid]);

  useEffect(() => {
    const me = profileRef.current;
    if (!me) return;
    const ids = new Set<string>([me.uid]);
    chats.forEach((chat) => chat.memberIds.forEach((id) => ids.add(id)));
    ids.forEach(async (uid) => {
      if (profilesRef.current[uid]) return;
      const next = uid === me.uid ? me : await readProfile(uid);
      if (!next) return;
      setProfiles((current) => (current[uid] ? current : { ...current, [uid]: next }));
    });
  }, [chats, profileUid]);

  useEffect(() => {
    if (!profileUid || call) return;
    return watchIncoming(profileUid, (rows) => setIncoming(rows[0] || null));
  }, [call, profileUid]);

  const selected = chats.find((chat) => chat.id === selectedId) || null;
  const contacts = useMemo(() => {
    const ids = new Set<string>();
    chats.forEach((chat) => chat.memberIds.forEach((id) => { if (profile && id !== profile.uid) ids.add(id); }));
    return Array.from(ids).map((id) => profiles[id]).filter(Boolean) as UserProfile[];
  }, [chats, profile, profiles]);

  if (!isConfigured) {
    return <main className="grid min-h-dvh place-items-center bg-ink px-6 text-center"><div><h1 className="font-serif text-4xl font-light">Add Firebase keys</h1><p className="mt-2 text-muted-foreground">Set the values in .env.local and restart the app.</p></div></main>;
  }
  if (!ready || (user && !profileLoaded) || (user && profile && !identity && !keyProblem)) {
    return <main className="grid min-h-dvh place-items-center bg-ink"><h1 className="font-serif text-5xl font-light tracking-tight">Just Us</h1></main>;
  }
  if (!user) return <AuthScreen onSignedIn={setUser} />;
  if (keyProblem) {
    return (
      <main className="grid min-h-dvh place-items-center bg-ink px-4">
        <section className="max-w-md rounded-[28px] border border-line bg-panel p-8 text-center">
        <h1 className="font-serif text-4xl font-light">Encryption key missing</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{keyProblem} Resetting creates a new key. Older messages stay readable only on the browser that created them.</p>
        <button className="mt-6 rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-gold-ink" type="button" onClick={async () => {
          const next = await ensureIdentity(user.uid);
          const { updateProfile } = await import("@/lib/users");
          const current = profile || await readProfile(user.uid);
          if (current) await updateProfile(current, { publicKey: bytesToB64(next.publicKey) });
          setIdentity(next);
          setKeyProblem("");
        }}>Reset key</button>
        </section>
      </main>
    );
  }
  if (!profile) {
    if (!identity) return <main className="grid min-h-dvh place-items-center bg-ink"><h1 className="font-serif text-5xl font-light">Just Us</h1></main>;
    return <ProfileSetup user={user} identity={identity} onDone={() => undefined} />;
  }
  if (!identity) return <main className="grid min-h-dvh place-items-center bg-ink"><h1 className="font-serif text-5xl font-light">Just Us</h1></main>;

  async function forwardTo(chat: ChatRecord) {
    if (!profile || !identity) return;
    await sendPayload({ chat, me: profile, identity, type: "text", text: forwardText });
    setDialog(null);
    setSelectedId(chat.id);
  }

  return (
    <div className="flex h-dvh flex-col bg-ink text-fg">
      {quotaExceeded ? (
        <p className="border-b border-line bg-raised px-4 py-2 text-center text-sm text-gold">
          Firebase&apos;s free daily quota is used up. Chats, search, status, and calls reconnect after it resets at midnight Pacific time.
        </p>
      ) : null}
      <div className="grid min-h-0 flex-1 md:grid-cols-[380px_1fr]">
      <aside className={`${selected ? "hidden md:flex" : "flex"} min-h-0 flex-col border-r border-line bg-panel`}>
        <header className="flex h-[72px] items-center gap-2 px-4">
          <button className="flex min-w-0 flex-1 items-center gap-3 text-left" type="button" onClick={() => setDialog("profile")} aria-label="Profile">
            <Avatar name={profile.displayName} photo={profile.photoURL} small />
            <span className="min-w-0">
              <span className="block font-serif text-lg leading-none tracking-tight">Just Us</span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">@{profile.username}</span>
            </span>
          </button>
          <Button variant="ghost" size="icon" type="button" aria-label="New group" onClick={() => setDialog("group")}><Users /></Button>
          <Button size="icon" type="button" aria-label="New chat" onClick={() => setDialog("new")}><MessageSquarePlus /></Button>
        </header>
        {showArchived ? null : <StatusTray me={profile} identity={identity} contacts={contacts} onOpen={setStatusUid} />}
        <ChatList me={profile.uid} chats={chats} profiles={profiles} selectedId={selectedId} query={query} onQuery={setQuery} archived={showArchived} onSelect={(id) => { setSelectedId(id); setInfo(false); }} />
        <button className="flex items-center gap-2 border-t border-line px-4 py-3 text-left text-sm text-muted-foreground hover:bg-white/5 hover:text-fg" type="button" onClick={() => setShowArchived((value) => !value)}>
          <Archive className="size-4 text-gold" />
          {showArchived ? "Back to chats" : "Archived"}
          <span className="ml-auto text-xs">{chats.filter((chat) => chat.members[profile.uid]?.archived).length}</span>
        </button>
      </aside>
      <main className={`${selected ? "flex" : "hidden md:flex"} relative min-w-0 bg-ink`}>
        {selected ? (
          <>
            <Thread
              chat={selected}
              me={profile}
              identity={identity}
              profiles={profiles}
              isContact
              onBack={() => setSelectedId(null)}
              onInfo={() => setInfo(true)}
              onCall={(video) => {
                const peerId = selected.memberIds.find((id) => id !== profile.uid) || "";
                setCall({ role: "caller", peerId, video });
              }}
              onForward={(text) => { setForwardText(text); setDialog("forward"); }}
            />
            {info ? (
              <ChatInfo
                chat={selected}
                me={profile}
                identity={identity}
                profiles={profiles}
                onClose={() => setInfo(false)}
              />
            ) : null}
          </>
        ) : (
          <div className="m-auto max-w-md px-8 text-center">
            <p className="text-[11px] tracking-[0.32em] text-gold uppercase">A quiet room</p>
            <h1 className="mt-3 font-serif text-5xl font-light">Just Us</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Pick a chat, or start a new one. Messages, emoji, groups, status, and one-to-one calls stay on the free plan.</p>
            <div className="mt-6 flex justify-center gap-2">
              <Button type="button" onClick={() => setDialog("new")}>New chat</Button>
              <Button variant="outline" type="button" onClick={() => setDialog("group")}>New group</Button>
            </div>
          </div>
        )}
      </main>
      </div>
      {dialog === "profile" ? (
        <ProfilePanel profile={profile} theme={theme} onTheme={setTheme} onClose={() => setDialog(null)} onKeyReset={() => window.location.reload()} />
      ) : null}
      {dialog === "new" || dialog === "group" ? (
        <PeopleDialog
          mode={dialog}
          me={profile}
          identity={identity}
          onClose={() => setDialog(null)}
          onOpen={(id) => { setSelectedId(id); setDialog(null); }}
        />
      ) : null}
      {dialog === "forward" ? (
        <Dialog open onOpenChange={(open) => { if (!open) setDialog(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Forward</DialogTitle>
              <DialogDescription>Choose a chat.</DialogDescription>
            </DialogHeader>
            <div className="max-h-72 space-y-1 overflow-auto">
            {chats.filter((chat) => !chat.members[profile.uid]?.archived).map((chat) => (
              <Button variant="ghost" className="w-full justify-start gap-3" key={chat.id} type="button" onClick={() => forwardTo(chat)}>
                <Avatar name={chatTitle(chat, profile.uid, profiles)} photo={chatPhoto(chat, profile.uid, profiles)} small />
                {chatTitle(chat, profile.uid, profiles)}
              </Button>
            ))}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
      {statusUid ? (
        <StatusViewer
          uid={statusUid}
          me={profile}
          identity={identity}
          name={profiles[statusUid]?.displayName || "Status"}
          onClose={() => setStatusUid(null)}
        />
      ) : null}
      {incoming && !call ? (
        <Dialog open onOpenChange={(open) => { if (!open) { void endCall(incoming.id); setIncoming(null); } }}>
          <DialogContent className="text-center">
            <DialogHeader className="items-center">
              <p className="text-[11px] tracking-[0.28em] text-gold uppercase">Incoming</p>
              <DialogTitle>{profiles[incoming.callerId]?.displayName || "Someone"} is calling</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">{incoming.video ? "Video call" : "Voice call"}</p>
            <DialogFooter className="justify-center sm:justify-center">
              <Button variant="destructive" type="button" onClick={() => { void endCall(incoming.id); setIncoming(null); }}>Decline</Button>
              <Button type="button" onClick={() => setCall({ role: "callee", peerId: incoming.callerId, video: incoming.video, callId: incoming.id })}>Accept</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      {call ? (
        <CallScreen
          me={profile.uid}
          peerId={call.peerId}
          peerName={profiles[call.peerId]?.displayName || "Call"}
          video={call.video}
          role={call.role}
          existingId={call.callId}
          onClose={() => setCall(null)}
        />
      ) : null}
    </div>
  );
}

function PeopleDialog({
  mode,
  me,
  identity,
  onClose,
  onOpen,
}: {
  mode: "new" | "group";
  me: UserProfile;
  identity: Identity;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<UserProfile[]>([]);
  const [error, setError] = useState("");

  async function lookup(event?: FormEvent) {
    event?.preventDefault();
    setError("");
    try {
      const person = await findByUsername(username);
      if (!person || person.uid === me.uid) { setError("No one uses that username."); return; }
      if (mode === "new") {
        onOpen(await openDirect(me, person));
        return;
      }
      setPicked((current) => current.some((item) => item.uid === person.uid) ? current : [...current, person]);
      setUsername("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not search.");
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "new" ? "New chat" : "New group"}</DialogTitle>
          <DialogDescription>Find someone by username.</DialogDescription>
        </DialogHeader>
        {mode === "group" ? <div className="space-y-1.5"><Label htmlFor="group-name">Group name</Label><Input id="group-name" value={title} placeholder="Saturday plans" onChange={(event) => setTitle(event.target.value)} /></div> : null}
        <form className="flex items-end gap-2" onSubmit={lookup}>
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="find-username">Username</Label>
            <Input id="find-username" value={username} placeholder="their_name" onChange={(event) => setUsername(event.target.value)} />
          </div>
          <Button type="submit">Find</Button>
        </form>
        {picked.length ? (
          <div className="flex flex-wrap gap-2">
            {picked.map((person) => (
              <button className="inline-flex items-center gap-1 rounded-full bg-raised px-3 py-1 text-sm" key={person.uid} type="button" onClick={() => setPicked((current) => current.filter((item) => item.uid !== person.uid))}>
                {person.displayName}
                <X className="size-3 text-muted-foreground" />
              </button>
            ))}
          </div>
        ) : null}
        <p className="min-h-5 text-sm text-destructive">{error}</p>
        <DialogFooter>
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          {mode === "group" ? (
            <Button type="button" disabled={!picked.length} onClick={async () => onOpen(await createGroup(me, identity, title, picked.map((person) => person.uid)))}>Create</Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
