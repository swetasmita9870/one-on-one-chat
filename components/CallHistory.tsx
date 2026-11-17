"use client";

import { useEffect, useMemo, useState } from "react";
import { Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Search, Video } from "lucide-react";
import { loadCallHistory, watchCallHistory } from "@/lib/calls";
import { formatChatListTime } from "@/lib/format-chat-time";
import type { CallRecord, UserProfile } from "@/lib/types";
import { Avatar } from "./ChatList";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type CallFilter = "all" | "missed" | "voice" | "video";

function isMissed(call: CallRecord, me: string) {
  return call.calleeId === me && call.state === "ended" && !call.answer;
}

export function CallHistory({
  me,
  profiles,
  onCall,
}: {
  me: string;
  profiles: Record<string, UserProfile>;
  onCall: (peerId: string, video: boolean) => void;
}) {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [filter, setFilter] = useState<CallFilter>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    void loadCallHistory(me).then(setCalls);
    return watchCallHistory(me, setCalls);
  }, [me]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return calls.filter((call) => {
      const outgoing = call.callerId === me;
      const peerId = outgoing ? call.calleeId : call.callerId;
      const peer = profiles[peerId];
      const name = (peer?.displayName || "").toLowerCase();
      const user = (peer?.usernameLower || "").toLowerCase();
      if (needle && !name.includes(needle) && !user.includes(needle)) return false;
      if (filter === "missed" && !isMissed(call, me)) return false;
      if (filter === "voice" && call.video) return false;
      if (filter === "video" && !call.video) return false;
      return true;
    });
  }, [calls, filter, me, profiles, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 px-4 pb-2 pt-1">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="rounded-full pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search calls"
          />
        </div>
        <div className="flex gap-4 border-b border-line/60 px-1" role="tablist" aria-label="Call filters">
          {([
            ["all", "All"],
            ["missed", "Missed"],
            ["voice", "Voice"],
            ["video", "Video"],
          ] as const).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={filter === tab}
              className={`pb-2.5 text-sm capitalize transition ${filter === tab ? "border-b-2 border-gold font-medium text-fg" : "text-muted-foreground hover:text-fg"}`}
              onClick={() => setFilter(tab)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {visible.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Phone className="mx-auto mb-3 size-8 text-gold" />
            <p className="font-serif text-2xl font-light">{query ? "No matches" : "No calls yet"}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {query ? "Try another name." : "Calls from chats appear here."}
            </p>
          </div>
        ) : (
          visible.map((call) => (
            <CallRow key={call.id} call={call} me={me} profiles={profiles} onCall={onCall} />
          ))
        )}
      </ScrollArea>
    </div>
  );
}

function CallRow({
  call,
  me,
  profiles,
  onCall,
}: {
  call: CallRecord;
  me: string;
  profiles: Record<string, UserProfile>;
  onCall: (peerId: string, video: boolean) => void;
}) {
  const outgoing = call.callerId === me;
  const peerId = outgoing ? call.calleeId : call.callerId;
  const peer = profiles[peerId];
  const name = peer?.displayName || "Unknown";
  const missed = isMissed(call, me);
  const DirectionIcon = missed ? PhoneMissed : outgoing ? PhoneOutgoing : PhoneIncoming;

  return (
    <div className="mx-2 mb-1 flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-white/[0.04]">
      <button type="button" className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left" onClick={() => peerId && onCall(peerId, call.video)}>
        <Avatar name={name} photo={peer?.photoURL} small />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-fg">{name}</span>
          <span className={`flex items-center gap-1.5 text-xs ${missed ? "text-destructive" : "text-muted-foreground"}`}>
            <DirectionIcon className="size-3.5 shrink-0" />
            {call.video ? <Video className="size-3 shrink-0" /> : null}
            <span className="truncate capitalize">
              {call.state === "ringing" ? "Ringing" : call.state === "active" ? "Active" : missed ? "Missed call" : outgoing ? "Outgoing" : "Incoming"}
            </span>
          </span>
        </span>
        <time className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">{formatChatListTime(call.createdAt)}</time>
      </button>
      <button
        type="button"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-gold/15 text-gold transition hover:bg-gold/25"
        aria-label={`Call ${name}`}
        onClick={() => peerId && onCall(peerId, call.video)}
      >
        {call.video ? <Video className="size-4" /> : <Phone className="size-4" />}
      </button>
    </div>
  );
}