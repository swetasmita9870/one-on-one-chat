"use client";

import { useState } from "react";
import { Smile } from "lucide-react";
import { EMOJI_GROUPS, type EmojiGroup } from "@/lib/emoji";
import { Button } from "@/components/ui/button";

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<EmojiGroup>("Smileys");

  return (
    <div className="relative">
      <Button variant="ghost" size="icon" type="button" aria-label="Emoji" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Smile />
      </Button>
      {open ? (
        <div className="absolute bottom-12 left-0 z-20 w-72 rounded-3xl border border-line bg-panel p-3 shadow-2xl">
          <div className="mb-2 flex flex-wrap gap-1">
            {(Object.keys(EMOJI_GROUPS) as EmojiGroup[]).map((name) => (
              <button
                className={`grid size-8 place-items-center rounded-full text-base ${group === name ? "bg-gold/20" : "hover:bg-white/5"}`}
                key={name}
                type="button"
                title={name}
                aria-label={name}
                onClick={() => setGroup(name)}
              >
                {EMOJI_GROUPS[name][0]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-6 gap-1">
            {EMOJI_GROUPS[group].map((emoji) => (
              <button
                className="grid h-9 place-items-center rounded-xl text-xl hover:bg-white/10"
                key={emoji}
                type="button"
                onClick={() => onPick(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
