"use client";

import { CircleDot, MessageCircle, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@/lib/types";
import type { ShellTab } from "./BottomNav";
import { PingoraMark } from "./PingoraMark";
import { Avatar } from "./ChatList";

const tabs: Array<{ id: ShellTab; label: string; icon: typeof MessageCircle }> = [
  { id: "chats", label: "Chats", icon: MessageCircle },
  { id: "status", label: "Status", icon: CircleDot },
  { id: "calls", label: "Calls", icon: Phone },
];

export function IconSidebar({
  profile,
  active,
  onTab,
  onProfile,
}: {
  profile: UserProfile;
  active: ShellTab;
  onTab: (tab: ShellTab) => void;
  onProfile: () => void;
}) {
  return (
    <aside
      className="hidden w-[4.25rem] shrink-0 flex-col items-center border-r border-line bg-[#0d1114] py-3 md:flex"
      aria-label="Main navigation"
    >
      <PingoraMark className="mb-5 size-10" />
      <nav className="flex w-full flex-col items-center gap-1 px-2" aria-label="Sections">
        {tabs.map((item) => {
          const Icon = item.icon;
          const on = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              title={item.label}
              aria-label={item.label}
              aria-current={on ? "page" : undefined}
              onClick={() => onTab(item.id)}
              className={cn(
                "relative grid size-11 w-full place-items-center rounded-xl text-muted-foreground transition hover:bg-white/[0.06] hover:text-fg",
                on && "bg-gold/15 text-gold"
              )}
            >
              {on ? <span className="absolute top-1/2 left-0 h-8 w-0.5 -translate-y-1/2 rounded-r bg-gold" /> : null}
              <Icon className="size-[1.35rem]" strokeWidth={on ? 2.2 : 1.75} />
            </button>
          );
        })}
      </nav>
      <div className="min-h-4 flex-1" />
      <button
        type="button"
        className="mb-1 rounded-full ring-2 ring-transparent transition hover:ring-gold/45"
        aria-label="Profile and settings"
        onClick={onProfile}
      >
        <Avatar name={profile.displayName} photo={profile.photoURL} small />
      </button>
    </aside>
  );
}