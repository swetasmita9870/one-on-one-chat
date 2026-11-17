"use client";

import { Phone, PhoneOff, Video } from "lucide-react";
import { Avatar } from "./ChatList";

export function IncomingCall({
  callerName,
  callerPhoto,
  video,
  onDecline,
  onAccept,
}: {
  callerName: string;
  callerPhoto?: string;
  video: boolean;
  onDecline: () => void;
  onAccept: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#07111a] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,rgba(30,201,160,0.22),transparent_55%),radial-gradient(ellipse_at_80%_100%,rgba(14,70,90,0.45),transparent_50%)]" />
      <div className="relative flex flex-1 flex-col items-center justify-center px-8 text-center">
        <p className="animate-pulse text-[11px] font-medium tracking-[0.32em] text-gold uppercase">Incoming {video ? "video" : "voice"} call</p>
        <div className="relative mt-10">
          <span className="absolute inset-0 -m-4 animate-ping rounded-full bg-gold/15" aria-hidden />
          <span className="absolute inset-0 -m-8 animate-pulse rounded-full bg-gold/5" aria-hidden />
          <Avatar name={callerName} photo={callerPhoto} large />
        </div>
        <h2 className="mt-8 font-serif text-4xl font-light tracking-tight">{callerName}</h2>
        <p className="mt-2 text-sm text-white/60">{video ? "Wants to video chat" : "Voice call on Pingora"}</p>
      </div>
      <div className="relative flex items-center justify-center gap-14 px-8 pb-14 pt-6">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            className="grid size-16 place-items-center rounded-full bg-danger text-white shadow-lg shadow-danger/30 transition hover:brightness-110"
            aria-label="Decline call"
            onClick={onDecline}
          >
            <PhoneOff className="size-7" />
          </button>
          <span className="text-xs text-white/50">Decline</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            className="grid size-16 place-items-center rounded-full bg-gold text-gold-ink shadow-lg shadow-gold/25 transition hover:brightness-110"
            aria-label="Accept call"
            onClick={onAccept}
          >
            {video ? <Video className="size-7" /> : <Phone className="size-7" />}
          </button>
          <span className="text-xs text-white/50">Accept</span>
        </div>
      </div>
    </div>
  );
}