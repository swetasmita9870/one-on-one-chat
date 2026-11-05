"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Copy, Forward, MoreHorizontal, Pencil, Phone, Reply, Search, Star, Trash2, Video, X } from "lucide-react";
import { QUICK_REACTIONS } from "@/lib/emoji";
import { chatPhoto, chatTitle, emojiOnly, formatDay, formatTime, lastSeenLabel, otherId } from "@/lib/format";
import {
  clearUnread,
  decryptMessage,
  deleteForEveryone,
  deleteForMe,
  editMessage,
  markReceipt,
  purgeExpired,
  sendPayload,
  setReaction,
  setTyping,
  toggleStar,
  watchMessages,
  watchTyping,
} from "@/lib/messages";
import type { Identity } from "@/lib/crypto";
import type { ChatRecord, MessageRecord, UserProfile } from "@/lib/types";
import { visibleField } from "@/lib/users";
import { Avatar } from "./ChatList";
import { Composer } from "./Composer";

export function Thread({
  chat,
  me,
  identity,
  profiles,
  isContact,
  onBack,
  onInfo,
  onCall,
  onForward,
}: {
  chat: ChatRecord;
  me: UserProfile;
  identity: Identity;
  profiles: Record<string, UserProfile>;
  isContact: boolean;
  onBack: () => void;
  onInfo: () => void;
  onCall: (video: boolean) => void;
  onForward: (text: string) => void;
}) {
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [typing, setTypingState] = useState<Record<string, number>>({});
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<MessageRecord | null>(null);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [limitCount, setLimitCount] = useState(80);
  const endRef = useRef<HTMLDivElement>(null);
  const title = chatTitle(chat, me.uid, profiles);
  const other = profiles[otherId(chat, me.uid)];
  const presence = chat.type === "direct" ? lastSeenLabel(other, visibleField(other || me, "lastSeen", isContact)) : `${chat.memberIds.length} ${chat.memberIds.length === 1 ? "person" : "people"}`;

  useEffect(() => {
    return watchMessages(chat.id, limitCount, (rows) => {
      setMessages(rows);
      void purgeExpired(rows, chat.id);
    });
  }, [chat.id, limitCount]);

  useEffect(() => watchTyping(chat.id, setTypingState), [chat.id]);
  useEffect(() => { void clearUnread(chat.id, me.uid); }, [chat.id, me.uid]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const message of messages) {
        if (message.deletedForAll || message.deletedFor?.includes(me.uid)) continue;
        try {
          const payload = await decryptMessage(chat, message, me, identity);
          next[message.id] = payload.text || "";
        } catch {
          next[message.id] = "Encrypted message";
        }
      }
      if (!cancel) setTexts(next);
    })();
    return () => { cancel = true; };
  }, [chat, identity, me, messages]);

  useEffect(() => {
    messages.forEach((message) => {
      if (message.senderId === me.uid || message.deletedForAll) return;
      if (!message.deliveredTo?.includes(me.uid)) void markReceipt(chat.id, message.id, me.uid, "deliveredTo");
      if (!message.readBy?.includes(me.uid)) void markReceipt(chat.id, message.id, me.uid, "readBy");
    });
  }, [chat.id, me.uid, messages]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return messages.filter((message) => {
      if (message.deletedFor?.includes(me.uid)) return false;
      if (!needle) return true;
      return (texts[message.id] || "").toLowerCase().includes(needle);
    });
  }, [me.uid, messages, search, texts]);

  const newest = messages[messages.length - 1]?.id;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [newest]);

  const typers = Object.entries(typing)
    .filter(([uid, at]) => uid !== me.uid && Date.now() - at < 4000)
    .map(([uid]) => profiles[uid]?.displayName || "Someone");

  async function send(text: string) {
    if (editing) {
      await editMessage(chat, editing, me, identity, text);
      setEditing(null);
      return;
    }
    await sendPayload({ chat, me, identity, type: "text", text, replyTo });
    setReplyTo(null);
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-16 items-center gap-1 border-b border-line bg-panel/80 px-2 backdrop-blur">
        <button className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-white/5 md:hidden" type="button" onClick={onBack} aria-label="Back"><ArrowLeft /></button>
        <button className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-1 text-left hover:bg-white/5" type="button" onClick={onInfo}>
          <span className="relative">
            <Avatar name={title} photo={chatPhoto(chat, me.uid, profiles)} small />
            {presence === "online" ? <span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-panel bg-emerald-400" /> : null}
          </span>
          <span className="min-w-0">
            <strong className="block truncate text-fg">{title}</strong>
            <span className={`block truncate text-xs ${presence === "online" || typers.length ? "text-emerald-400" : "text-muted-foreground"}`}>{typers.length ? `${typers.join(", ")} is typing…` : presence || "Open chat info"}</span>
          </span>
        </button>
        <button className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-white/5" type="button" aria-label="Search messages" onClick={() => setSearchOpen((value) => !value)}><Search /></button>
        {chat.type === "direct" ? (
          <>
            <button className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-white/5 hover:text-fg" type="button" onClick={() => onCall(false)} aria-label="Voice call"><Phone /></button>
            <button className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-white/5 hover:text-fg" type="button" onClick={() => onCall(true)} aria-label="Video call"><Video /></button>
          </>
        ) : null}
      </header>
      {searchOpen ? (
        <div className="border-b border-line bg-panel px-4 py-2">
          <input className="w-full rounded-full border border-line bg-raised px-4 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-gold/60" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search in this chat" />
        </div>
      ) : null}
      <div className="chat-wallpaper flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-3 py-5 sm:px-8">
        {messages.length >= limitCount ? <button className="self-center rounded-full bg-panel/80 px-3 py-1 text-sm text-gold" type="button" onClick={() => setLimitCount((count) => count + 80)}>Load earlier</button> : null}
        {shown.length === 0 ? (
          <div className="m-auto max-w-xs rounded-3xl border border-line bg-panel/90 px-6 py-5 text-center shadow-lg">
            <p className="font-serif text-2xl font-light">{search ? "Nothing matches" : "Start the conversation"}</p>
            <p className="mt-2 text-sm text-muted-foreground">{search ? "Try a different word from this chat." : "Messages are encrypted on this browser. Emoji, replies, and reactions are ready when you are."}</p>
          </div>
        ) : null}
        {shown.map((message, index) => {
          const mine = message.senderId === me.uid;
          const others = chat.memberIds.filter((id) => id !== message.senderId);
          const read = others.every((id) => message.readBy?.includes(id));
          const delivered = others.some((id) => message.deliveredTo?.includes(id) || message.readBy?.includes(id));
          const reply = messages.find((item) => item.id === message.replyTo);
          const body = texts[message.id] || "";
          const previous = shown[index - 1];
          const showDay = !previous || formatDay(previous.createdAt) !== formatDay(message.createdAt);
          const reactionCounts = Object.values(message.reactions || {}).reduce<Record<string, number>>((counts, emoji) => {
            counts[emoji] = (counts[emoji] || 0) + 1;
            return counts;
          }, {});
          return (
            <div key={message.id}>
              {showDay ? <div className="mx-auto my-2 w-fit rounded-full bg-panel/80 px-3 py-1 text-[11px] tracking-wide text-muted-foreground">{formatDay(message.createdAt)}</div> : null}
              <article className={`relative max-w-[min(82%,36rem)] rounded-3xl px-3.5 py-2 shadow-sm ${mine ? "ml-auto rounded-br-md bg-mine text-fg" : "rounded-bl-md border border-line bg-theirs"}`}>
                {!mine && chat.type === "group" ? <div className="text-xs text-gold">{profiles[message.senderId]?.displayName}</div> : null}
                {reply ? <div className="mb-1 rounded-xl border-l-2 border-gold bg-black/10 px-2 py-1 text-xs text-muted-foreground">{texts[reply.id] || "Message"}</div> : null}
                {message.deletedForAll ? <div className="text-sm italic text-muted-foreground">This message was deleted</div> : (
                  body ? <div className={`whitespace-pre-wrap break-words ${emojiOnly(body) ? "text-4xl leading-tight" : "pr-8 text-[15px] leading-relaxed"}`}>{body}</div> : null
                )}
                <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                  {message.starredBy?.includes(me.uid) ? <Star className="size-3 fill-gold text-gold" /> : null}
                  {message.editedAt ? "edited" : ""}
                  {formatTime(message.createdAt)}
                  {mine ? <span className={read ? "text-sky-300" : ""}>{delivered ? "✓✓" : "✓"}</span> : null}
                  {!message.deletedForAll ? (
                    <button className="grid size-6 place-items-center rounded-full hover:bg-white/10" type="button" aria-label="Message actions" onClick={() => setMenuId(menuId === message.id ? null : message.id)}><MoreHorizontal className="size-3.5" /></button>
                  ) : null}
                </div>
                {Object.keys(reactionCounts).length ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {Object.entries(reactionCounts).map(([emoji, count]) => (
                      <button className={`rounded-full px-2 py-0.5 text-xs ${message.reactions?.[me.uid] === emoji ? "bg-gold/20 text-fg" : "bg-black/10 text-muted-foreground"}`} key={emoji} type="button" onClick={() => void setReaction(chat.id, message.id, me.uid, emoji, message.reactions?.[me.uid])}>{emoji} {count}</button>
                    ))}
                  </div>
                ) : null}
                {menuId === message.id && !message.deletedForAll ? (
                  <div className={`absolute bottom-full z-10 mb-2 w-56 rounded-2xl border border-line bg-panel p-1.5 shadow-2xl ${mine ? "right-0" : "left-0"}`}>
                    <div className="mb-1 flex justify-between px-1">
                      {QUICK_REACTIONS.map((emoji) => (
                        <button className="grid size-8 place-items-center rounded-full text-lg hover:bg-white/10" key={emoji} type="button" onClick={() => { void setReaction(chat.id, message.id, me.uid, emoji, message.reactions?.[me.uid]); setMenuId(null); }}>{emoji}</button>
                      ))}
                    </div>
                    <MenuButton icon={<Reply />} label="Reply" onClick={() => { setReplyTo(message.id); setMenuId(null); }} />
                    <MenuButton icon={<Forward />} label="Forward" onClick={() => { onForward(body || "Message"); setMenuId(null); }} />
                    <MenuButton icon={<Copy />} label="Copy" onClick={() => { void navigator.clipboard.writeText(body); setMenuId(null); }} />
                    <MenuButton icon={<Star />} label={message.starredBy?.includes(me.uid) ? "Unstar" : "Star"} onClick={() => { void toggleStar(chat.id, message, me.uid); setMenuId(null); }} />
                    {mine && message.type === "text" ? <MenuButton icon={<Pencil />} label="Edit" onClick={() => { setEditing(message); setMenuId(null); }} /> : null}
                    <MenuButton icon={<Trash2 />} label="Delete for me" onClick={() => { void deleteForMe(chat.id, message.id, me.uid); setMenuId(null); }} />
                    {mine ? <MenuButton icon={<Trash2 />} label="Delete for everyone" onClick={() => { void deleteForEveryone(chat.id, message.id); setMenuId(null); }} /> : null}
                  </div>
                ) : null}
              </article>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {replyTo ? <DraftBar label="Replying" text={texts[replyTo] || "Message"} onClear={() => setReplyTo(null)} /> : null}
      {editing ? <DraftBar label="Editing" text={texts[editing.id] || "Message"} onClear={() => setEditing(null)} /> : null}
      <Composer onSend={send} onTyping={(active) => void setTyping(chat.id, me.uid, active)} />
    </section>
  );
}

function DraftBar({ label, text, onClear }: { label: string; text: string; onClear: () => void }) {
  return (
    <div className="flex items-center gap-3 border-t border-line bg-raised px-4 py-2">
      <span className="w-16 shrink-0 text-xs font-medium text-gold">{label}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{text}</span>
      <button className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-white/10" type="button" onClick={onClear} aria-label="Cancel"><X className="size-4" /></button>
    </div>
  );
}

function MenuButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm text-fg hover:bg-white/10 [&_svg]:size-4" type="button" onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}
