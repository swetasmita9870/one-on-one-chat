"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, ArrowLeft, MessageCircle, MessageSquarePlus, Search, Users, X } from "lucide-react";
import { bytesToB64 } from "@/lib/bytes";
import { endCall, watchIncoming } from "@/lib/calls";
import { createGroup, openDirect, watchChats } from "@/lib/chats";
import type { Identity } from "@/lib/crypto";
import { chatPhoto, chatTitle } from "@/lib/format";
import { getSupabase, isConfigured, toAppUser, type AppUser } from "@/lib/supabase";
import { ensureIdentity, loadIdentity } from "@/lib/keys";
import { clearUnread, sendPayload } from "@/lib/messages";
import type { CallRecord, ChatRecord, UserProfile } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { readSavedTheme, ThemeToggle, writeTheme, type ThemeMode } from "./ThemeToggle";
import { WallpaperMenu } from "./WallpaperMenu";
import { ensureProfiles, listPeople, readProfile, startPresence, watchProfile } from "@/lib/users";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [keyProblem, setKeyProblem] = useState("");
  const chats = useAppStore((state) => state.chats);
  const profiles = useAppStore((state) => state.profiles);
  const wallpaper = useAppStore((state) => state.wallpaper);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [info, setInfo] = useState(false);
  const [dialog, setDialog] = useState<"profile" | "new" | "group" | "forward" | null>(null);
  const [forwardText, setForwardText] = useState("");
  const [statusUid, setStatusUid] = useState<string | null>(null);
  const [call, setCall] = useState<CallLaunch | null>(null);
  const [incoming, setIncoming] = useState<CallRecord | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(() => (typeof window !== "undefined" ? readSavedTheme() : "dark"));
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    writeTheme(theme);
  }, [theme]);

  function setThemeMode(next: ThemeMode) {
    setTheme(next);
  }

  useEffect(() => {
    if (!isConfigured) { setReady(true); return; }
    const { data } = getSupabase().auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? toAppUser(session.user) : null);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) { setProfile(null); setIdentity(null); setProfileLoaded(false); return; }
    return watchProfile(user.uid, (next) => {
      setProfile(next);
      if (next) useAppStore.getState().putProfiles([next]);
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

  useEffect(() => {
    if (!profileUid) return;
    return watchChats(profileUid, (rows) => useAppStore.getState().setChats(rows));
  }, [profileUid]);

  useEffect(() => {
    if (!profileUid || !selectedId) return;
    const open = chats.find((chat) => chat.id === selectedId);
    if (!open?.members[profileUid]?.unread) return;
    useAppStore.getState().patchUnread(selectedId, profileUid);
    void clearUnread(selectedId, profileUid);
  }, [chats, profileUid, selectedId]);

  useEffect(() => {
    if (!profile) return;
    const ids = [profile.uid];
    chats.forEach((chat) => ids.push(...chat.memberIds));
    void ensureProfiles(ids);
  }, [chats, profile]);

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
    return <main className="grid min-h-dvh place-items-center bg-ink px-6 text-center"><div><h1 className="font-serif text-4xl font-light">Add Supabase keys</h1><p className="mt-2 text-muted-foreground">Set the values in .env.local and restart the app.</p></div></main>;
  }
  if (!ready || (user && !profileLoaded) || (user && profile && !identity && !keyProblem)) {
    return <main className="grid min-h-dvh place-items-center bg-ink text-center"><div><h1 className="font-serif text-5xl font-light tracking-tight">Pingora</h1><p className="mt-2 text-sm text-muted-foreground">Every moment connected.</p></div></main>;
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
    if (!identity) return <main className="grid min-h-dvh place-items-center bg-ink text-center"><div><h1 className="font-serif text-5xl font-light">Pingora</h1><p className="mt-2 text-sm text-muted-foreground">Every moment connected.</p></div></main>;
    return <ProfileSetup user={user} identity={identity} onDone={() => undefined} />;
  }
  if (!identity) return <main className="grid min-h-dvh place-items-center bg-ink text-center"><div><h1 className="font-serif text-5xl font-light">Pingora</h1><p className="mt-2 text-sm text-muted-foreground">Every moment connected.</p></div></main>;

  async function forwardTo(chat: ChatRecord) {
    if (!profile || !identity) return;
    await sendPayload({ chat, me: profile, identity, type: "text", text: forwardText });
    setDialog(null);
    setSelectedId(chat.id);
  }

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-ink text-fg">
      <div className="grid min-h-0 w-full flex-1 md:grid-cols-[380px_minmax(0,1fr)]">
      <aside className={`${selected ? "hidden md:flex" : "flex"} h-full min-h-0 flex-col overflow-hidden border-r border-line bg-panel`}>
        <header className="flex h-[76px] items-center gap-2 px-4">
          <button className="flex min-w-0 flex-1 items-center gap-3 text-left" type="button" onClick={() => setDialog("profile")} aria-label="Profile">
            <Avatar name={profile.displayName} photo={profile.photoURL} small />
            <span className="min-w-0">
              <span className="block font-serif text-[1.35rem] leading-none tracking-tight">Pingora</span>
              <span className="mt-1.5 block truncate text-[11px] tracking-wide text-muted-foreground">@{profile.username}</span>
            </span>
          </button>
          <ThemeToggle theme={theme} onTheme={setThemeMode} />
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
      <main className={`${selected ? "flex" : "hidden md:flex"} relative h-full min-h-0 min-w-0 overflow-hidden bg-ink`}>
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
          <div className={`wallpaper wallpaper-${wallpaper} grid h-full w-full place-items-center px-6`}>
            <div className="max-w-sm text-center">
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-gold/15 text-gold ring-1 ring-gold/30">
                <MessageCircle className="size-7" />
              </span>
              <h1 className="mt-6 font-serif text-6xl font-medium tracking-tight text-fg">Pingora</h1>
              <p className="mt-3 text-sm tracking-wide text-muted-foreground">Every moment connected.</p>
              <div className="mt-8 flex justify-center gap-2">
                <Button type="button" onClick={() => setDialog("new")}><MessageSquarePlus /> New chat</Button>
                <Button variant="secondary" type="button" onClick={() => setDialog("group")}><Users /> New group</Button>
              </div>
              <div className="mt-5 flex justify-center"><WallpaperMenu /></div>
            </div>
          </div>
        )}
      </main>
      </div>
      {dialog === "profile" ? (
        <>
          <button className="absolute inset-0 z-30 bg-black/40 md:left-[380px]" type="button" aria-label="Close profile" onClick={() => setDialog(null)} />
          <ProfilePanel profile={profile} theme={theme} onTheme={setThemeMode} onClose={() => setDialog(null)} onKeyReset={() => window.location.reload()} />
        </>
      ) : null}
      {dialog === "new" || dialog === "group" ? (
        <>
          <button className="absolute inset-0 z-30 bg-black/40 md:left-[380px]" type="button" aria-label="Close" onClick={() => setDialog(null)} />
          <PeopleDialog
            mode={dialog}
            me={profile}
            identity={identity}
            onClose={() => setDialog(null)}
            onOpen={(id) => { setSelectedId(id); setDialog(null); }}
          />
        </>
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
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [people, setPeople] = useState<UserProfile[]>([]);
  const [picked, setPicked] = useState<UserProfile[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void listPeople()
      .then((rows) => setPeople(rows.filter((person) => person.uid !== me.uid)))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load people."));
  }, [me.uid]);

  const needle = query.trim().toLowerCase().replace(/^@/, "");
  const shown = people.filter((person) => !needle || person.displayName.toLowerCase().includes(needle) || person.usernameLower.includes(needle));

  async function choose(person: UserProfile) {
    if (mode === "new") {
      onOpen(await openDirect(me, person));
      return;
    }
    setPicked((current) => current.some((item) => item.uid === person.uid) ? current.filter((item) => item.uid !== person.uid) : [...current, person]);
  }

  return (
    <aside className="absolute inset-y-0 left-0 z-40 flex w-full animate-in slide-in-from-left duration-200 flex-col bg-ink shadow-2xl md:w-[380px]">
      <header className="flex h-16 shrink-0 items-center gap-4 bg-gradient-to-br from-[#14967a] to-[#0b4f45] px-3 text-white">
        <button className="grid size-10 place-items-center rounded-full hover:bg-white/10" type="button" aria-label="Back" onClick={onClose}>
          <ArrowLeft />
        </button>
        <h2 className="text-xl font-medium">{mode === "new" ? "New chat" : "New group"}</h2>
      </header>
      <div className="bg-panel px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="rounded-full pl-9" value={query} placeholder="Search name or username" onChange={(event) => setQuery(event.target.value)} />
        </div>
        {mode === "group" ? <Input className="mt-2" value={title} placeholder="Group name" onChange={(event) => setTitle(event.target.value)} /> : null}
      </div>
      {picked.length ? (
        <div className="flex gap-2 overflow-x-auto bg-panel px-4 pb-3">
          {picked.map((person) => (
            <button className="inline-flex shrink-0 items-center gap-1 rounded-full bg-raised px-3 py-1 text-sm" key={person.uid} type="button" onClick={() => setPicked((current) => current.filter((item) => item.uid !== person.uid))}>
              {person.displayName}
              <X className="size-3 text-muted-foreground" />
            </button>
          ))}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto bg-panel">
        {shown.map((person) => {
          const selected = picked.some((item) => item.uid === person.uid);
          const online = person.online && Date.now() - person.lastSeen < 90000;
          return (
            <button className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04] ${selected ? "bg-white/[0.06]" : ""}`} key={person.uid} type="button" onClick={() => void choose(person)}>
              <span className="relative">
                <Avatar name={person.displayName} photo={person.photoURL} />
                {online ? <span className="absolute right-0 bottom-0 size-3 rounded-full border-2 border-panel bg-emerald-400" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{person.displayName}</span>
                <span className="block truncate text-sm text-muted-foreground">@{person.username}</span>
              </span>
            </button>
          );
        })}
        {!shown.length ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">{people.length ? "No one matches that name." : error || "Loading people…"}</p> : null}
      </div>
      {mode === "group" ? (
        <div className="border-t border-line bg-panel p-3">
          <Button className="w-full" type="button" disabled={!picked.length} onClick={async () => onOpen(await createGroup(me, identity, title, picked.map((person) => person.uid)))}>Create group</Button>
        </div>
      ) : null}
    </aside>
  );
}
