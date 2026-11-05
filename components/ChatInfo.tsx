"use client";

import { useEffect, useState } from "react";
import { safetyCode } from "@/lib/crypto";
import type { Identity } from "@/lib/crypto";
import { addGroupMember, removeGroupMember, setDisappearing, setMemberFlag, updateGroup } from "@/lib/chats";
import { chatTitle, otherId } from "@/lib/format";
import { decryptMessage, watchMessages } from "@/lib/messages";
import type { ChatRecord, MessageRecord, UserProfile } from "@/lib/types";
import { findByUsername, uploadAvatar } from "@/lib/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TIMERS: Array<[string, number | null]> = [
  ["Off", null],
  ["24 hours", 24 * 60 * 60 * 1000],
  ["7 days", 7 * 24 * 60 * 60 * 1000],
  ["90 days", 90 * 24 * 60 * 60 * 1000],
];

export function ChatInfo({
  chat,
  me,
  identity,
  profiles,
  onClose,
}: {
  chat: ChatRecord;
  me: UserProfile;
  identity: Identity;
  profiles: Record<string, UserProfile>;
  onClose: () => void;
}) {
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const other = profiles[otherId(chat, me.uid)];
  const admin = chat.members[me.uid]?.role === "admin";
  const starred = messages.filter((message) => message.starredBy?.includes(me.uid));

  useEffect(() => watchMessages(chat.id, 200, setMessages), [chat.id]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const message of messages) {
        if (!message.starredBy?.includes(me.uid) || message.deletedForAll) continue;
        try {
          next[message.id] = (await decryptMessage(chat, message, me, identity)).text || message.fileName || "Attachment";
        } catch {
          next[message.id] = "Encrypted message";
        }
      }
      if (!cancel) setTexts(next);
    })();
    return () => { cancel = true; };
  }, [chat, identity, me, messages]);

  useEffect(() => {
    if (chat.type !== "direct" || !other?.publicKey) return;
    void safetyCode(me.publicKey, other.publicKey).then(setCode);
  }, [chat.type, me.publicKey, other?.publicKey]);

  async function addPerson() {
    setError("");
    try {
      const person = await findByUsername(username);
      if (!person) throw new Error("No one uses that username.");
      await addGroupMember(chat, me, identity, person.uid);
      setUsername("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add them.");
    }
  }

  return (
    <aside className="absolute inset-0 z-10 overflow-auto border-l border-line bg-panel md:static md:w-[360px]">
      <header className="flex h-16 items-center px-4">
        <strong className="flex-1 font-serif text-xl font-light">Chat info</strong>
        <button className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-white/5" type="button" onClick={onClose}>✕</button>
      </header>
      <div className="space-y-5 px-4 pb-8">
        <div>
          <h2 className="font-serif text-3xl font-light">{chatTitle(chat, me.uid, profiles)}</h2>
          {chat.type === "direct" && other?.about ? <p className="mt-1 text-sm text-muted-foreground">{other.about}</p> : null}
          {chat.type === "group" ? <p className="mt-1 text-sm text-muted-foreground">{chat.memberIds.length} people</p> : null}
        </div>
        {code ? (
          <div className="rounded-3xl border border-line bg-raised p-4">
            <strong className="text-sm tracking-wide text-gold">Safety code</strong>
            <p className="mt-1 text-sm text-muted-foreground">Read this beside {other?.displayName}. The same numbers mean you both have the same keys.</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {code.split(" ").map((group, index) => <span className="rounded-xl bg-panel py-2 text-center font-serif tracking-widest" key={`${group}-${index}`}>{group}</span>)}
            </div>
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label>Disappearing messages</Label>
          <Select value={String(chat.disappearingMs || "off")} onValueChange={(value) => void setDisappearing(chat.id, value === "off" ? null : Number(value))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIMERS.map(([label, value]) => <SelectItem key={label} value={value ? String(value) : "off"}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button variant={chat.members[me.uid]?.pinned ? "default" : "outline"} size="sm" type="button" onClick={() => setMemberFlag(chat.id, me.uid, { pinned: !chat.members[me.uid]?.pinned })}>{chat.members[me.uid]?.pinned ? "Pinned" : "Pin"}</Button>
          <Button variant={chat.members[me.uid]?.archived ? "default" : "outline"} size="sm" type="button" onClick={() => setMemberFlag(chat.id, me.uid, { archived: !chat.members[me.uid]?.archived })}>{chat.members[me.uid]?.archived ? "Archived" : "Archive"}</Button>
          <Button variant={(chat.members[me.uid]?.mutedUntil || 0) > Date.now() ? "default" : "outline"} size="sm" type="button" onClick={() => setMemberFlag(chat.id, me.uid, { mutedUntil: (chat.members[me.uid]?.mutedUntil || 0) > Date.now() ? 0 : Date.now() + 8 * 60 * 60 * 1000 })}>{(chat.members[me.uid]?.mutedUntil || 0) > Date.now() ? "Muted" : "Mute 8h"}</Button>
        </div>
        {chat.type === "group" ? (
          <div>
            <h3 className="font-serif text-xl font-light">People</h3>
            {chat.memberIds.map((uid) => (
              <div className="flex items-center gap-2 py-1" key={uid}>
                <span className="flex-1 text-sm">{profiles[uid]?.displayName || uid} · {chat.members[uid]?.role}</span>
                {admin && uid !== me.uid ? <button className="text-sm text-gold" type="button" onClick={() => removeGroupMember(chat, me, identity, uid)}>Remove</button> : null}
              </div>
            ))}
            {admin ? (
              <div className="flex gap-2">
                <input className="w-full rounded-2xl border border-line bg-raised px-4 py-2 text-sm outline-none" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Add by username" />
                <button className="rounded-full bg-gold px-4 text-sm font-semibold text-gold-ink" type="button" onClick={addPerson}>Add</button>
              </div>
            ) : null}
            {admin ? (
              <label className="block text-sm text-muted-foreground">Group name
                <input className="mt-1.5 w-full rounded-2xl border border-line bg-raised px-4 py-3 text-fg outline-none" defaultValue={chat.title} onBlur={(event) => void updateGroup(chat.id, { title: event.target.value })} />
              </label>
            ) : null}
            {admin ? (
              <label className="mt-3 block text-sm text-muted-foreground">Group photo
                <span className="mt-1.5 flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-fg">Choose a photo
                  <input className="sr-only" type="file" accept="image/*" onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const url = await uploadAvatar(me.uid, file);
                    await updateGroup(chat.id, { photoURL: url });
                  }} />
                </span>
              </label>
            ) : null}
          </div>
        ) : null}
        <h3 className="font-serif text-xl font-light">Starred</h3>
        {starred.length === 0 ? <p className="text-sm text-muted-foreground">No starred messages.</p> : starred.map((message) => <p className="text-sm" key={message.id}>{texts[message.id] || message.fileName || "Attachment"}</p>)}
        <p className="text-sm text-danger">{error}</p>
      </div>
    </aside>
  );
}
