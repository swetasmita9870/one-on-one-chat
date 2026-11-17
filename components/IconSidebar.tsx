"use client";

import { cn } from "@/lib/utils";
import type { UserProfile } from "@/lib/types";
import { shellTabs, type ShellTab } from "./BottomNav";
import { PingoraMark } from "./PingoraMark";
import { Avatar } from "./ChatList";

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
      className="fixed inset-y-0 left-0 z-[60] hidden w-[4.5rem] flex-col items-center border-r border-line bg-[#0d1114] px-2 py-4 sm:flex"
      aria-label="Main navigation"
    >
      <button type="button" className="grid size-11 place-items-center" aria-label="Pingora home" onClick={() => onTab("chats")}>
        <PingoraMark className="size-11" />
      </button>
      <nav className="mt-6 flex w-full flex-col items-center gap-2" aria-label="Sections">
        {shellTabs.map((item) => {
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
                "relative grid size-11 place-items-center rounded-2xl text-muted-foreground transition hover:bg-white/[0.06] hover:text-fg",
                on && "bg-gold/15 text-gold"
              )}
            >
              {on ? <span className="absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gold" /> : null}
              <Icon className="size-5" strokeWidth={on ? 2.25 : 1.75} />
            </button>
          );
        })}
      </nav>
      <div className="min-h-4 flex-1" />
      <button
        type="button"
        className="grid size-11 place-items-center rounded-full ring-2 ring-transparent transition hover:ring-gold/45"
        aria-label="Profile and settings"
        onClick={onProfile}
      >
        <Avatar name={profile.displayName} photo={profile.photoURL} small />
      </button>
    </aside>
  );
}
