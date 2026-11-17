"use client";

import { useState, type ReactNode } from "react";
import { Archive, Clock, ImagePlus, Pin, Star, Timer, UserPlus, Users, X } from "lucide-react";
import { addGroupMember, removeGroupMember, setDisappearing, setMemberFlag, updateGroup } from "@/lib/chats";
import { chatPhoto, chatTitle, lastSeenLabel, otherId } from "@/lib/format";
import { messageText } from "@/lib/messages";
import { useChatMessages } from "@/lib/use-messages";
import type { ChatRecord, UserProfile } from "@/lib/types";
import { searchPeople, uploadAvatar, visibleField } from "@/lib/users";
import { Avatar } from "./ChatList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TIMERS: Array<{ label: string; value: string; ms: number | null }> = [
  { label: "Off", value: "off", ms: null },
  { label: "24 hours", value: "86400000", ms: 24 * 60 * 60 * 1000 },
  { label: "7 days", value: "604800000", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "90 days", value: "7776000000", ms: 90 * 24 * 60 * 60 * 1000 },
];

export function ChatInfo({
  chat,
  me,
  profiles,
  onClose,
}: {
  chat: ChatRecord;
  me: UserProfile;
  profiles: Record<string, UserProfile>;
  onClose: () => void;
}) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [groupTitle, setGroupTitle] = useState(chat.title);
  const messages = useChatMessages(chat.id, 200);
  const other = profiles[otherId(chat, me.uid)];
  const admin = chat.members[me.uid]?.role === "admin";
  const starred = messages.filter((message) => message.starredBy?.includes(me.uid) && !message.deletedForAll);
  const title = chatTitle(chat, me.uid, profiles);
  const photo = chatPhoto(chat, me.uid, profiles);
  const disappearingValue = chat.disappearingMs == null ? "off" : String(chat.disappearingMs);
  const mine = chat.members[me.uid];
  const muted = (mine?.mutedUntil || 0) > Date.now();
  const isContact = true;

  async function addPerson() {
    setError("");
    try {
      const people = (await searchPeople(username)).filter((person) => person.uid !== me.uid);
      const person = people.find((item) => item.usernameLower === username.trim().toLowerCase().replace(/^@/, "")) || (people.length === 1 ? people[0] : null);
      if (!person) throw new Error(people.length ? "More than one person matches. Use the full username." : "No one matches that name.");
      await addGroupMember(chat, me, person.uid);
      setUsername("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add them.");
    }
  }

  async function saveGroupTitle() {
    const next = groupTitle.trim();
    if (next !== chat.title) await updateGroup(chat.id, { title: next });
  }

  return (
    <aside className="absolute inset-0 z-10 flex flex-col bg-ink md:static md:z-auto md:w-[360px] md:shrink-0 md:border-l md:border-line">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-panel/95 px-3 backdrop-blur-sm">
        <button className="grid size-10 place-items-center rounded-full text-muted-foreground transition hover:bg-white/5 hover:text-fg" type="button" onClick={onClose} aria-label="Close info">
          <X className="size-5" />
        </button>
        <h2 className="text-base font-medium">{chat.type === "group" ? "Group info" : "Contact info"}</h2>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <section className="rounded-2xl bg-panel/90 px-4 py-6 text-center ring-1 ring-line">
          <div className="mx-auto w-fit rounded-full ring-4 ring-gold/25">
            <Avatar name={title} photo={photo} large />
          </div>
          <h2 className="mt-4 text-xl font-semibold tracking-tight">{title}</h2>
          {chat.type === "direct" && other ? (
            <>
              <p className="mt-1 text-sm text-gold">@{other.username}</p>
              <p className="mt-2 text-xs text-muted-foreground capitalize">
                {lastSeenLabel(other, visibleField(other, "lastSeen", isContact)) || "Last seen hidden"}
              </p>
              {other.about ? <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{other.about}</p> : null}
            </>
          ) : (
            <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
              <Users className="size-4 text-gold" />
              {chat.memberIds.length} members
            </p>
          )}
        </section>

        {chat.type === "group" ? (
          <section className="rounded-2xl bg-panel/90 ring-1 ring-line">
            <SectionHead icon={<Users className="size-4" />} title="Group" />
            <div className="space-y-3 px-4 pb-4">
              <Field label="Name">
                <Input
                  value={groupTitle}
                  onChange={(event) => setGroupTitle(event.target.value)}
                  onBlur={() => void saveGroupTitle()}
                  className="h-10 border-line bg-raised"
                />
              </Field>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-raised/50 py-3 text-sm text-muted-foreground transition hover:border-gold/40 hover:text-fg">
                <ImagePlus className="size-4 text-gold" />
                Change group photo
                <input
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const url = await uploadAvatar(me.uid, file);
                    await updateGroup(chat.id, { photoURL: url });
                  }}
                />
              </label>
              {admin ? (
                <>
                  <Field label="Add member">
                    <div className="flex gap-2">
                      <Input className="h-10 border-line bg-raised" value={username} placeholder="@username" onChange={(event) => setUsername(event.target.value)} />
                      <Button className="shrink-0" type="button" size="icon" aria-label="Add member" onClick={() => void addPerson()}>
                        <UserPlus className="size-4" />
                      </Button>
                    </div>
                  </Field>
                  {error ? <p className="text-xs text-destructive">{error}</p> : null}
                </>
              ) : null}
            </div>
            <div className="border-t border-line">
              {chat.memberIds.map((uid) => {
                const member = profiles[uid];
                const role = chat.members[uid]?.role;
                return (
                  <div className="flex items-center gap-3 px-4 py-3" key={uid}>
                    <Avatar name={member?.displayName || "?"} photo={member?.photoURL} small />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{member?.displayName || "Member"}</p>
                      <p className="truncate text-xs text-muted-foreground">@{member?.username || "…"}</p>
                    </div>
                    {role === "admin" ? <span className="text-[10px] font-medium tracking-wide text-gold uppercase">Admin</span> : null}
                    {admin && uid !== me.uid ? (
                      <button className="text-xs text-destructive hover:underline" type="button" onClick={() => void removeGroupMember(chat, me, uid)}>
                        Remove
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl bg-panel/90 ring-1 ring-line">
          <SectionHead icon={<Timer className="size-4" />} title="Chat settings" />
          <div className="divide-y divide-line px-4">
            <ToggleRow
              icon={<Pin className="size-4" />}
              label="Pinned"
              hint="Keep this chat at the top"
              on={Boolean(mine?.pinned)}
              onChange={(on) => void setMemberFlag(chat.id, me.uid, { pinned: on })}
            />
            <ToggleRow
              icon={<Archive className="size-4" />}
              label="Archived"
              hint="Hide from the main list"
              on={Boolean(mine?.archived)}
              onChange={(on) => void setMemberFlag(chat.id, me.uid, { archived: on })}
            />
            <ToggleRow
              icon={<Clock className="size-4" />}
              label="Mute notifications"
              hint="Silence alerts for this chat"
              on={muted}
              onChange={(on) => void setMemberFlag(chat.id, me.uid, { mutedUntil: on ? Date.now() + 365 * 24 * 60 * 60 * 1000 : 0 })}
            />
          </div>
          <div className="border-t border-line px-4 py-3">
            <p className="mb-2 text-xs text-muted-foreground">Disappearing messages</p>
            <Select
              value={disappearingValue}
              onValueChange={(value) => {
                const pick = TIMERS.find((item) => item.value === value);
                void setDisappearing(chat.id, pick?.ms ?? null);
              }}
            >
              <SelectTrigger className="h-10 w-full border-line bg-raised">
                <SelectValue placeholder="Off" />
              </SelectTrigger>
              <SelectContent>
                {TIMERS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        {starred.length ? (
          <section className="rounded-2xl bg-panel/90 ring-1 ring-line">
            <SectionHead icon={<Star className="size-4" />} title={`Starred (${starred.length})`} />
            <ul className="max-h-48 space-y-0 divide-y divide-line overflow-y-auto px-4 pb-2">
              {starred.slice(0, 30).map((message) => (
                <li className="py-2.5 text-sm text-muted-foreground" key={message.id}>
                  <span className="line-clamp-2 text-fg">{messageText(message) || message.fileName || "Attachment"}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

function SectionHead({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-line px-4 py-3">
      <span className="text-gold">{icon}</span>
      <span className="text-sm font-medium text-gold">{title}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function ToggleRow({
  icon,
  label,
  hint,
  on,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 py-3.5 text-left"
      onClick={() => onChange(!on)}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-gold" : "bg-raised"}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition ${on ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}