"use client";

import { CircleDot, MessageSquare, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

export type ShellTab = "chats" | "status" | "calls";

export const shellTabs: Array<{ id: ShellTab; label: string; icon: typeof MessageSquare }> = [
  { id: "chats", label: "Chats", icon: MessageSquare },
  { id: "status", label: "Status", icon: CircleDot },
  { id: "calls", label: "Calls", icon: Phone },
];

export function BottomNav({ active, onChange, className }: { active: ShellTab; onChange: (tab: ShellTab) => void; className?: string }) {
  return (
    <nav className={cn("z-50 grid h-16 shrink-0 grid-cols-3 border-t border-line bg-panel", className)} aria-label="Main">
      {shellTabs.map((item) => {
        const Icon = item.icon;
        const on = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            className={cn(
              "flex flex-col items-center justify-center gap-1 text-[11px] font-medium leading-none",
              on ? "text-gold" : "text-muted-foreground"
            )}
            aria-current={on ? "page" : undefined}
            onClick={() => onChange(item.id)}
          >
            <Icon className="size-5" strokeWidth={on ? 2.25 : 1.75} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
