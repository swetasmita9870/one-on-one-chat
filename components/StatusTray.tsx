"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { markStatusViewed, postStatus, statusText, watchStatus } from "@/lib/status";
import type { StatusItem, UserProfile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "./ChatList";
import { EmojiPicker } from "./EmojiPicker";

export function StatusTray({
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
  useEffect(() => watchStatus(me.uid, setMine), [me.uid]);

  async function add(text: string) {
    await postStatus({ me, text });
    setComposing(false);
  }

  return (
    <div className="border-b border-line">
      <div className="flex items-end gap-3 overflow-x-auto px-4 py-3">
        <button className="w-16 shrink-0 text-center" type="button" onClick={() => (mine.length ? onOpen(me.uid) : setComposing(true))}>
          <span className={`mx-auto grid size-12 place-items-center rounded-full p-0.5 ${mine.length ? "bg-gradient-to-br from-[#e4c4a4] to-[#8d5a32]" : "bg-line"}`}>
            <Avatar name={me.displayName} photo={me.photoURL} small />
          </span>
          <span className="mt-1 block truncate text-[11px] text-muted-foreground">{mine.length ? "My status" : "Add status"}</span>
        </button>
        {contacts.map((person) => (
          <button className="w-16 shrink-0 text-center" key={person.uid} type="button" onClick={() => onOpen(person.uid)}>
            <span className="mx-auto grid size-12 place-items-center rounded-full border border-gold/40 p-0.5">
              <Avatar name={person.displayName} photo={person.photoURL} small />
            </span>
            <span className="mt-1 block truncate text-[11px] text-muted-foreground">{person.displayName.split(" ")[0]}</span>
          </button>
        ))}
      </div>
      {composing || mine.length ? (
        <div className="px-3 pb-3">
          {mine.length && !composing ? (
            <Button variant="ghost" className="h-8 px-3 text-xs" type="button" onClick={() => setComposing(true)}>New status</Button>
          ) : (
            <StatusComposer onText={add} onCancel={() => setComposing(false)} />
          )}
        </div>
      ) : null}
    </div>
  );
}

export function StatusComposer({ onText, onCancel }: { onText: (text: string) => void; onCancel?: () => void }) {
  const [text, setText] = useState("");
  return (
    <div className="flex items-center gap-1">
      <EmojiPicker onPick={(emoji) => setText((value) => `${value}${emoji}`)} />
      <Input className="h-9 rounded-full" value={text} placeholder="A thought for 24 hours" onChange={(event) => setText(event.target.value)} />
      {onCancel ? <Button variant="ghost" size="icon" type="button" aria-label="Cancel status" onClick={onCancel}><X /></Button> : null}
      <Button variant="link" type="button" disabled={!text.trim()} onClick={() => { if (text.trim()) onText(text.trim()); setText(""); }}>Post</Button>
    </div>
  );
}

export function StatusViewer({
  uid,
  me,
  name,
  onClose,
}: {
  uid: string;
  me: UserProfile;
  name: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<StatusItem[]>([]);
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<{ text: string; url: string } | null>(null);
  useEffect(() => watchStatus(uid, setItems), [uid]);
  const item = items[index];

  useEffect(() => {
    if (!item) {
      setView(null);
      return;
    }
    setView({ text: statusText(item), url: "" });
    if (!item.viewers?.[me.uid]) void markStatusViewed(uid, item.id, me.uid);
  }, [item, me.uid, uid]);

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-black text-white">
      <div className="flex items-center gap-3 px-4 pt-4">
        <div className="flex flex-1 gap-1">
          {(items.length ? items : [null]).map((entry, entryIndex) => (
            <span className={`h-1 flex-1 rounded-full ${entry && entryIndex <= index ? "bg-gold" : "bg-white/20"}`} key={entry?.id || "empty"} />
          ))}
        </div>
        <button className="grid size-10 place-items-center rounded-full bg-white/10" type="button" onClick={onClose} aria-label="Close status"><X /></button>
      </div>
      <div className="relative grid flex-1 place-items-center px-6 text-center">
        {items.length > 1 ? (
          <>
            <button className="absolute inset-y-0 left-0 w-1/3" type="button" aria-label="Previous status" disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))} />
            <button className="absolute inset-y-0 right-0 w-1/3" type="button" aria-label="Next status" disabled={index >= items.length - 1} onClick={() => setIndex((value) => Math.min(items.length - 1, value + 1))} />
          </>
        ) : null}
        <div className="relative z-10 max-w-lg">
          <p className="text-[11px] tracking-[0.28em] text-gold uppercase">{name}</p>
          {!items.length ? <p className="mt-6 font-serif text-3xl font-light">No status in the last 24 hours.</p> : null}
          {view?.url ? (item?.type === "video" ? <video className="mt-6 max-h-[70dvh]" src={view.url} controls autoPlay /> : <img className="mt-6 max-h-[70dvh]" src={view.url} alt="" />) : null}
          {view?.text ? <p className="mt-6 font-serif text-3xl font-light">{view.text}</p> : null}
          {uid === me.uid && item ? <p className="mt-3 text-sm text-white/60">Seen by {Object.keys(item.viewers || {}).length}</p> : null}
        </div>
      </div>
    </div>
  );
}