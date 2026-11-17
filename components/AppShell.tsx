"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowLeft, MessageCircle, MessageSquarePlus, Search, Users, X } from "lucide-react";
import { endCall, watchIncoming } from "@/lib/calls";
import { chatTitle } from "@/lib/format";
import { clearCallNotification, ensureNotifyPermission, notifyIncomingCall, notifyNewMessage } from "@/lib/notify";
import { playMessageSound, startRingtone, stopRingtone, unlockAudio } from "@/lib/sounds";
import { createGroup, openDirect, watchChats } from "@/lib/chats";
import { chatPhoto } from "@/lib/format";
import { getSupabase, isConfigured, toAppUser, type AppUser } from "@/lib/supabase";
import { clearUnread, sendPayload } from "@/lib/messages";
import type { CallRecord, ChatRecord, UserProfile } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { wallpaperClassName, wallpaperStyle } from "@/lib/wallpapers";
import { readSavedTheme, ThemeToggle, writeTheme, type ThemeMode } from "./ThemeToggle";
import { WallpaperMenu } from "./WallpaperMenu";
import { ensureProfiles, listPeople, startPresence, watchProfile } from "@/lib/users";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AuthScreen, ProfileSetup } from "./AuthScreen";
import { CallScreen } from "./CallScreen";
import { IncomingCall } from "./IncomingCall";
import { ChatInfo } from "./ChatInfo";
import { Avatar, ChatList } from "./ChatList";
import { ProfilePanel } from "./ProfilePanel";
import { BottomNav, type ShellTab } from "./BottomNav";
import { CallHistory } from "./CallHistory";
import { IconSidebar } from "./IconSidebar";
import { PingoraMark } from "./PingoraMark";
import { StatusTab } from "./StatusTab";
import { StatusViewer } from "./StatusTray";
import { Thread } from "./Thread";

const OPEN_CHAT_KEY = "pingora-open-chat";

function readSavedChat() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(OPEN_CHAT_KEY);
}

function writeSavedChat(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(OPEN_CHAT_KEY, id);
  else localStorage.removeItem(OPEN_CHAT_KEY);
}

type CallLaunch = { role: "caller" | "callee"; peerId: string; video: boolean; callId?: string };

export function AppShell() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const chats = useAppStore((state) => state.chats);
  const profiles = useAppStore((state) => state.profiles);
  const wallpaper = useAppStore((state) => state.wallpaper);
  const [selectedId, setSelectedId] = useState<string | null>(() => readSavedChat());
  const [listReady, setListReady] = useState(false);
  const [query, setQuery] = useState("");
  const [info, setInfo] = useState(false);
  const [dialog, setDialog] = useState<"profile" | "new" | "group" | "forward" | null>(null);
  const [forwardText, setForwardText] = useState("");
  const [statusUid, setStatusUid] = useState<string | null>(null);
  const [call, setCall] = useState<CallLaunch | null>(null);
  const [incoming, setIncoming] = useState<CallRecord | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(() => (typeof window !== "undefined" ? readSavedTheme() : "dark"));
  const [showArchived, setShowArchived] = useState(false);
  const [shellTab, setShellTab] = useState<ShellTab>("chats");
  const lastMessageAt = useRef<Record<string, number>>({});
  const messagesPrimed = useRef(false);
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;

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
    if (!user) { setProfile(null); setProfileLoaded(false); return; }
    let stop = () => {};
    return watchProfile(user.uid, (next) => {
      setProfile(next);
      if (next) {
        useAppStore.getState().putProfiles([next]);
        stop = startPresence(next.uid);
      }
      setProfileLoaded(true);
    });
  }, [user]);

  const profileUid = profile?.uid || "";

  useEffect(() => {
    if (!profileUid) return;
    setListReady(false);
    return watchChats(profileUid, (rows) => {
      useAppStore.getState().setChats(rows);
      setListReady(true);
    });
  }, [profileUid]);

  useEffect(() => {
    if (!listReady || !selectedId) return;
    if (!chats.some((chat) => chat.id === selectedId)) {
      setSelectedId(null);
      writeSavedChat(null);
    }
  }, [chats, listReady, selectedId]);

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

  useEffect(() => {
    if (!profile) return;
    void ensureNotifyPermission();
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    if (!messagesPrimed.current) {
      for (const chat of chats) {
        if (chat.lastMessage) lastMessageAt.current[chat.id] = chat.lastMessage.at;
      }
      if (chats.length > 0) messagesPrimed.current = true;
      return;
    }
    const looking = document.visibilityState === "visible" && document.hasFocus();
    for (const chat of chats) {
      const lm = chat.lastMessage;
      if (!lm) continue;
      const prev = lastMessageAt.current[chat.id] || 0;
      if (lm.at > prev && lm.senderId !== profile.uid) {
        const focusedChat = selectedId === chat.id && looking;
        if (!focusedChat) {
          playMessageSound();
          notifyNewMessage(chatTitle(chat, profile.uid, profilesRef.current), lm.preview || "New message");
        }
      }
      lastMessageAt.current[chat.id] = Math.max(prev, lm.at);
    }
  }, [chats, profile, selectedId]);

  useEffect(() => {
    if (!incoming || call) {
      stopRingtone();
      clearCallNotification();
      return;
    }
    startRingtone();
    const name = profilesRef.current[incoming.callerId]?.displayName || "Someone";
    notifyIncomingCall("Incoming call", `${name} · ${incoming.video ? "Video" : "Voice"}`);
    return () => {
      stopRingtone();
      clearCallNotification();
    };
  }, [incoming?.id, call]);

  const selected = chats.find((chat) => chat.id === selectedId) || null;
  const chatOpen = Boolean(selected || (selectedId && !listReady));
  const asideClass = shellTab === "chats"
    ? `${chatOpen ? "hidden md:flex" : "flex"}`
    : "flex";
  const mainClass = shellTab === "chats"
    ? `${chatOpen ? "flex" : "hidden md:flex"}`
    : "hidden md:flex";
  const contacts = useMemo(() => {
    const ids = new Set<string>();
    chats.forEach((chat) => chat.memberIds.forEach((id) => { if (profile && id !== profile.uid) ids.add(id); }));
    return Array.from(ids).map((id) => profiles[id]).filter(Boolean) as UserProfile[];
  }, [chats, profile, profiles]);

  if (!isConfigured) {
    return <main className="grid min-h-dvh place-items-center bg-ink px-6 text-center"><div><h1 className="font-serif text-4xl font-light">Add Supabase keys</h1><p className="mt-2 text-muted-foreground">Set the values in .env.local and restart the app.</p></div></main>;
  }
  if (!ready || (user && !profileLoaded)) {
    return <main className="grid min-h-dvh place-items-center bg-ink text-center"><div><PingoraMark className="mx-auto mb-4 size-16" /><h1 className="font-serif text-5xl font-light tracking-tight">Pingora</h1><p className="mt-2 text-sm text-muted-foreground">Every moment connected.</p></div></main>;
  }
  if (!user) return <AuthScreen onSignedIn={setUser} />;
  if (!profile) return <ProfileSetup user={user} onDone={() => undefined} />;

  async function forwardTo(chat: ChatRecord) {
    if (!profile) return;
    await sendPayload({ chat, me: profile, type: "text", text: forwardText });
    setDialog(null);
    setSelectedId(chat.id);
    writeSavedChat(chat.id);
  }

  function chooseChat(id: string | null) {
    setSelectedId(id);
    writeSavedChat(id);
    setInfo(false);
    if (id) setShellTab("chats");
  }

  function openTab(tab: ShellTab) {
    void unlockAudio();
    setShellTab(tab);
    if (tab !== "chats") chooseChat(null);
  }

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-ink pb-16 text-fg sm:pb-0">
      <div className="flex min-h-0 w-full flex-1 sm:pl-[4.5rem]">
        <IconSidebar profile={profile} active={shellTab} onTab={openTab} onProfile={() => setDialog("profile")} />
        <div className="grid min-h-0 min-w-0 flex-1 md:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <aside className={`${asideClass} h-full min-h-0 flex-col overflow-hidden border-r border-line bg-panel`}>
        {shellTab === "chats" ? (
          <>
            <header className="flex h-[4.25rem] shrink-0 items-center gap-2 px-3">
              <button className="grid size-9 place-items-center md:hidden" type="button" aria-label="Profile" onClick={() => setDialog("profile")}>
                <Avatar name={profile.displayName} photo={profile.photoURL} small />
              </button>
              <span className="min-w-0 flex-1 font-serif text-2xl tracking-tight">Chats</span>
              <div className="flex items-center gap-0.5">
                <ThemeToggle theme={theme} onTheme={setThemeMode} />
                <Button variant="ghost" size="icon" className="size-9" type="button" aria-label="New group" onClick={() => setDialog("group")}><Users /></Button>
                <Button variant="ghost" size="icon" className="size-9 text-gold" type="button" aria-label="New chat" onClick={() => setDialog("new")}><MessageSquarePlus /></Button>
              </div>
            </header>
            <ChatList me={profile.uid} chats={chats} profiles={profiles} selectedId={selectedId} query={query} onQuery={setQuery} archived={showArchived} onSelect={(id) => chooseChat(id)} />
            <button className="flex shrink-0 items-center gap-2 border-t border-line px-4 py-3 text-left text-sm text-muted-foreground hover:bg-white/5 hover:text-fg" type="button" onClick={() => setShowArchived((value) => !value)}>
              <Archive className="size-4 text-gold" />
              {showArchived ? "Back to chats" : "Archived"}
              <span className="ml-auto text-xs">{chats.filter((chat) => chat.members[profile.uid]?.archived).length}</span>
            </button>
          </>
        ) : null}
        {shellTab === "status" ? (
          <>
            <header className="flex h-[4.25rem] shrink-0 items-center gap-2 px-4">
              <button className="md:hidden" type="button" aria-label="Profile" onClick={() => setDialog("profile")}>
                <Avatar name={profile.displayName} photo={profile.photoURL} small />
              </button>
              <span className="min-w-0 flex-1 font-serif text-2xl tracking-tight">Status</span>
            </header>
            <StatusTab me={profile} contacts={contacts} onOpen={(uid) => { setStatusUid(uid); }} />
          </>
        ) : null}
        {shellTab === "calls" ? (
          <>
            <header className="flex h-[4.25rem] shrink-0 items-center gap-2 px-4">
              <button className="md:hidden" type="button" aria-label="Profile" onClick={() => setDialog("profile")}>
                <Avatar name={profile.displayName} photo={profile.photoURL} small />
              </button>
              <span className="min-w-0 flex-1 font-serif text-2xl tracking-tight">Calls</span>
            </header>
            <CallHistory
              me={profile.uid}
              profiles={profiles}
              onCall={(peerId, video) => setCall({ role: "caller", peerId, video })}
            />
          </>
        ) : null}
      </aside>
      <main className={`${mainClass} relative flex h-full min-h-0 min-w-0 overflow-hidden bg-ink ${selected ? "flex-row" : "flex-col"}`}>
        {selected ? (
          <>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <Thread
              chat={selected}
              me={profile}
              profiles={profiles}
              isContact
              onBack={() => chooseChat(null)}
              onInfo={() => setInfo(true)}
              onCall={(video) => {
                const peerId = selected.memberIds.find((id) => id !== profile.uid) || "";
                setCall({ role: "caller", peerId, video });
              }}
              onForward={(text) => { setForwardText(text); setDialog("forward"); }}
            />
            </div>
            {info ? (
              <ChatInfo
                chat={selected}
                me={profile}
                profiles={profiles}
                onClose={() => setInfo(false)}
              />
            ) : null}
          </>
        ) : selectedId && !listReady ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">Opening chat…</div>
        ) : shellTab !== "chats" ? (
          <div className="grid h-full place-items-center px-6 text-center text-sm text-muted-foreground md:hidden">
            <p>Use <strong className="text-fg">Chats</strong> for messages. Status and calls live in the left panel.</p>
          </div>
        ) : (
          <div className={`${wallpaperClassName(wallpaper)} grid h-full w-full place-items-center px-6`} style={wallpaperStyle(wallpaper)}>
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
      </div>
      <BottomNav className="fixed inset-x-0 bottom-0 z-20 sm:hidden" active={shellTab} onChange={openTab} />
      {dialog === "profile" ? (
        <>
          <button className="absolute inset-0 z-30 bg-black/40 md:left-[calc(4.5rem+380px)]" type="button" aria-label="Close profile" onClick={() => setDialog(null)} />
          <ProfilePanel profile={profile} theme={theme} onTheme={setThemeMode} onClose={() => setDialog(null)} />
        </>
      ) : null}
      {dialog === "new" || dialog === "group" ? (
        <>
          <button className="absolute inset-0 z-30 bg-black/40 md:left-[calc(4.5rem+380px)]" type="button" aria-label="Close" onClick={() => setDialog(null)} />
          <PeopleDialog
            mode={dialog}
            me={profile}
            onClose={() => setDialog(null)}
            onOpen={(id) => { chooseChat(id); setDialog(null); }}
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
          name={profiles[statusUid]?.displayName || "Status"}
          onClose={() => setStatusUid(null)}
        />
      ) : null}
      {incoming && !call ? (
        <IncomingCall
          callerName={profiles[incoming.callerId]?.displayName || "Someone"}
          callerPhoto={profiles[incoming.callerId]?.photoURL}
          video={incoming.video}
          onDecline={() => { stopRingtone(); void endCall(incoming.id); setIncoming(null); }}
          onAccept={() => {
            stopRingtone();
            setIncoming(null);
            setCall({ role: "callee", peerId: incoming.callerId, video: incoming.video, callId: incoming.id });
          }}
        />
      ) : null}
      {call ? (
        <CallScreen
          me={profile.uid}
          peerId={call.peerId}
          peerName={profiles[call.peerId]?.displayName || "Call"}
          peerPhoto={profiles[call.peerId]?.photoURL}
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
  onClose,
  onOpen,
}: {
  mode: "new" | "group";
  me: UserProfile;
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
    <aside className="absolute inset-y-0 left-0 z-40 flex w-full animate-in slide-in-from-left duration-200 flex-col bg-ink shadow-2xl sm:left-[4.5rem] sm:w-[380px]">
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
          <Button className="w-full" type="button" disabled={!picked.length} onClick={async () => onOpen(await createGroup(me, title, picked.map((person) => person.uid)))}>Create group</Button>
        </div>
      ) : null}
    </aside>
  );
}
