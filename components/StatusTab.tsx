"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { postStatus, watchStatus } from "@/lib/status";
import type { StatusItem, UserProfile } from "@/lib/types";
import { listPeople } from "@/lib/users";
import { Avatar } from "./ChatList";
import { StatusComposer } from "./StatusTray";

export function StatusTab({
  me,
  contacts,
  onOpen,
}: {
  me: UserProfile;
  contacts: UserProfile[];
  onOpen: (uid: string) => void;
}) {
  const [mine, setMine] = useState<StatusItem[]>([]);
  const [composing, setComposing] = useState(false);
  const [people, setPeople] = useState<UserProfile[]>(contacts);

  useEffect(() => watchStatus(me.uid, setMine), [me.uid]);
  useEffect(() => {
    if (contacts.length) {
      setPeople(contacts);
      return;
    }
    void listPeople().then((rows) => setPeople(rows.filter((p) => p.uid !== me.uid)));
  }, [contacts, me.uid]);

  async function add(text: string) {
    await postStatus({ me, text });
    setComposing(false);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 py-3">
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-2xl bg-raised/80 p-3 text-left ring-1 ring-line"
          onClick={() => (mine.length ? onOpen(me.uid) : setComposing(true))}
        >
          <span className="relative">
            <Avatar name={me.displayName} photo={me.photoURL} />
            <span className="absolute -right-1 -bottom-1 grid size-6 place-items-center rounded-full bg-gold text-gold-ink">
              <Plus className="size-4" />
            </span>
          </span>
          <span>
            <span className="block text-sm font-medium">Your status</span>
            <span className="text-xs text-muted-foreground">{mine.length ? "Tap to view · 24h" : "Share an update for 24 hours"}</span>
          </span>
        </button>
        {composing ? (
          <div className="mt-3">
            <StatusComposer onText={add} onCancel={() => setComposing(false)} />
          </div>
        ) : null}
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto border-t border-line">
        {people.map((person) => (
          <li key={person.uid}>
            <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04]" onClick={() => onOpen(person.uid)}>
              <span className="rounded-full p-0.5 ring-2 ring-gold/45">
                <Avatar name={person.displayName} photo={person.photoURL} small />
              </span>
              <span className="min-w-0 text-left">
                <span className="block truncate font-medium">{person.displayName}</span>
                <span className="text-xs text-muted-foreground">@{person.username}</span>
              </span>
            </button>
          </li>
        ))}
        {!people.length ? <li className="px-4 py-8 text-center text-sm text-muted-foreground">Start a chat to see contacts here.</li> : null}
      </ul>
    </div>
  );
}