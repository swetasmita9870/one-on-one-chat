"use client";

import { useEffect, useState } from "react";
import { BellOff, MessagesSquare, Pin, Search } from "lucide-react";
import { chatPhoto, chatTitle } from "@/lib/format";
import { formatChatListTime } from "@/lib/format-chat-time";
import type { ChatRecord, UserProfile } from "@/lib/types";
import { Avatar as ShadAvatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function Avatar({ name, photo, small, large }: { name: string; photo?: string; small?: boolean; large?: boolean }) {
  const size = large ? "size-28 text-3xl" : small ? "size-10 text-sm" : "size-12";
  return (
    <ShadAvatar className={size}>
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
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const needle = query.trim().toLowerCase();
  const visible = chats.filter((chat) => {
    const isArchived = Boolean(chat.members[me]?.archived);
    if (archived ? !isArchived : isArchived) return false;
    if (!archived && filter === "unread" && !(chat.members[me]?.unread || 0)) return false;
    if (!archived && filter === "groups" && chat.type !== "group") return false;
    const other = chat.type === "direct" ? profiles[chat.memberIds.find((id) => id !== me) || ""] : undefined;
    const haystack = [chatTitle(chat, me, profiles), other?.username || "", chat.lastMessage?.preview || ""].join(" ").toLowerCase();
    return haystack.includes(needle);
  });
  return (
    <>
      <div className="space-y-3 px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="rounded-full pl-9" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search your chats" />
        </div>
        {archived ? null : (
          <Tabs value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="unread">Unread</TabsTrigger>
              <TabsTrigger value="groups">Groups</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {visible.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <MessagesSquare className="mx-auto mb-3 size-8 text-gold" />
            <p className="font-serif text-2xl font-light">{needle ? "No matches" : archived ? "Archive is empty" : "No chats yet"}</p>
            <p className="mt-2 text-sm text-muted-foreground">{needle ? "Try another name." : archived ? "Archived chats will wait here." : "Start a chat or a group from the buttons above."}</p>
          </div>
        ) : null}
        {visible.map((chat) => {
          const unread = chat.id === selectedId ? 0 : (chat.members[me]?.unread || 0);
          const muted = (chat.members[me]?.mutedUntil || 0) > Date.now();
          const title = chatTitle(chat, me, profiles);
          const other = chat.type === "direct" ? profiles[chat.memberIds.find((id) => id !== me) || ""] : undefined;
          const online = Boolean(other?.online && Date.now() - other.lastSeen < 90000);
          const selected = chat.id === selectedId;
          return (
            <button
              className={`grid w-full grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line/70 px-4 py-3 text-left transition hover:bg-white/[0.04] ${selected ? "bg-gold/10" : ""}`}
              key={chat.id}
              onClick={() => onSelect(chat.id)}
              type="button"
            >
              <span className="relative">
                <Avatar name={title} photo={chatPhoto(chat, me, profiles)} />
                {online ? <span className="absolute right-0 bottom-0 size-3 rounded-full border-2 border-panel bg-emerald-400" /> : null}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className={`truncate text-[15px] text-fg ${unread ? "font-semibold" : "font-medium"}`}>{title}</span>
                  {chat.members[me]?.pinned ? <Pin className="size-3 shrink-0 text-gold" /> : null}
                  {muted ? <BellOff className="size-3 shrink-0 text-muted-foreground" /> : null}
                </span>
                <span className={`mt-0.5 block truncate text-[13px] ${unread ? "font-medium text-fg/80" : "text-muted-foreground"}`}>{chat.lastMessage?.preview || "No messages yet"}</span>
              </span>
              <span className="flex flex-col items-end gap-1.5 self-start pt-0.5">
                <span className={`text-[11px] whitespace-nowrap ${unread ? "font-medium text-gold" : "text-muted-foreground"}`}>{chat.lastMessage ? formatChatListTime(chat.lastMessage.at) : ""}</span>
                {unread > 0 ? <Badge className="min-w-5 justify-center px-1.5">{unread > 99 ? "99+" : unread}</Badge> : null}
              </span>
            </button>
          );
        })}
      </ScrollArea>
    </>
  );
}
