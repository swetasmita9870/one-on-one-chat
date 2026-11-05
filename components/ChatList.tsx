"use client";

import { useState } from "react";
import { BellOff, Pin } from "lucide-react";
import { chatPhoto, chatTitle, formatTime } from "@/lib/format";
import type { ChatRecord, UserProfile } from "@/lib/types";
import { Avatar as ShadAvatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

export function Avatar({ name, photo, small }: { name: string; photo?: string; small?: boolean }) {
  return (
    <ShadAvatar className={small ? "size-10 text-sm" : "size-12"}>
      {photo ? <AvatarImage src={photo} alt="" /> : null}
      <AvatarFallback>{(name || "?").slice(0, 1).toUpperCase()}</AvatarFallback>
    </ShadAvatar>
  );
}

export function ChatList({
  me,
  chats,
  profiles,
  selectedId,
  query,
  onQuery,
  onSelect,
  archived,
}: {
  me: string;
  chats: ChatRecord[];
  profiles: Record<string, UserProfile>;
  selectedId: string | null;
  query: string;
  onQuery: (value: string) => void;
  onSelect: (id: string) => void;
  archived?: boolean;
}) {
  const [filter, setFilter] = useState<"all" | "unread" | "groups">("all");
  const needle = query.trim().toLowerCase();
  const visible = chats.filter((chat) => {
    const isArchived = Boolean(chat.members[me]?.archived);
    if (archived ? !isArchived : isArchived) return false;
    if (!archived && filter === "unread" && !(chat.members[me]?.unread || 0)) return false;
    if (!archived && filter === "groups" && chat.type !== "group") return false;
    return chatTitle(chat, me, profiles).toLowerCase().includes(needle);
  });
  return (
    <>
      <div className="space-y-3 px-4 py-3">
        <Input className="rounded-full" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search your chats" />
        {archived ? null : (
          <div className="flex gap-2">
            {(["all", "unread", "groups"] as const).map((item) => (
              <button className={`rounded-full px-3 py-1 text-xs capitalize ${filter === item ? "bg-gold text-gold-ink" : "bg-raised text-muted-foreground"}`} key={item} type="button" onClick={() => setFilter(item)}>{item}</button>
            ))}
          </div>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {visible.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-serif text-2xl font-light">{needle ? "No matches" : archived ? "Archive is empty" : "No chats yet"}</p>
            <p className="mt-2 text-sm text-muted-foreground">{needle ? "Try another name." : archived ? "Archived chats will wait here." : "Start a chat or a group from the buttons above."}</p>
          </div>
        ) : null}
        {visible.map((chat) => {
          const unread = chat.members[me]?.unread || 0;
          const muted = (chat.members[me]?.mutedUntil || 0) > Date.now();
          const title = chatTitle(chat, me, profiles);
          const other = chat.type === "direct" ? profiles[chat.memberIds.find((id) => id !== me) || ""] : undefined;
          const online = Boolean(other?.online && Date.now() - other.lastSeen < 90000);
          return (
            <button className={`grid w-full grid-cols-[48px_1fr_auto] items-center gap-3 border-b border-line/70 px-4 py-3 text-left transition hover:bg-white/5 ${chat.id === selectedId ? "border-l-2 border-l-gold bg-raised" : ""}`} key={chat.id} onClick={() => onSelect(chat.id)} type="button">
              <span className="relative">
                <Avatar name={title} photo={chatPhoto(chat, me, profiles)} />
                {online ? <span className="absolute right-0 bottom-0 size-3 rounded-full border-2 border-panel bg-emerald-400" /> : null}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 truncate font-medium text-fg">
                  <span className={`truncate ${unread ? "font-semibold" : ""}`}>{title}</span>
                  {chat.members[me]?.pinned ? <Pin className="size-3 shrink-0 text-gold" /> : null}
                  {muted ? <BellOff className="size-3 shrink-0 text-muted-foreground" /> : null}
                </span>
                <span className="block truncate text-sm text-muted-foreground">{chat.lastMessage?.preview || "No messages yet"}</span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <span className="text-xs text-muted-foreground">{chat.lastMessage ? formatTime(chat.lastMessage.at) : ""}</span>
                {unread > 0 ? <Badge className="min-w-5 justify-center px-1.5">{unread}</Badge> : null}
              </span>
            </button>
          );
        })}
      </ScrollArea>
    </>
  );
}
