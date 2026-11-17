"use client";

import { CircleDot, MessageCircle, Phone } from "lucide-react";

export type ShellTab = "chats" | "status" | "calls";

import { cn } from "@/lib/utils";

export function BottomNav({ active, onChange, className }: { active: ShellTab; onChange: (tab: ShellTab) => void; className?: string }) {
  const items: Array<{ id: ShellTab; label: string; icon: typeof MessageCircle }> = [
    { id: "chats", label: "Chats", icon: MessageCircle },
    { id: "status", label: "Status", icon: CircleDot },
    { id: "calls", label: "Calls", icon: Phone },
  ];
  return (
    <nav className={cn("flex h-[3.35rem] shrink-0 border-t border-line bg-panel/95 backdrop-blur-md", className)} aria-label="Main">
      {items.map((item) => {
        const Icon = item.icon;
        const on = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition ${on ? "text-gold" : "text-muted-foreground"}`}
            aria-current={on ? "page" : undefined}
            onClick={() => onChange(item.id)}
          >
            <Icon className={`size-5 ${on ? "text-gold" : ""}`} strokeWidth={on ? 2.2 : 1.8} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}