"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmojiPicker } from "./EmojiPicker";

export function Composer({
  onSend,
  onTyping,
}: {
  onSend: (text: string) => Promise<void>;
  onTyping: (active: boolean) => void;
}) {
  const [text, setText] = useState("");
  const timer = useRef<number>(0);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function insert(emoji: string) {
    const area = field.current;
    const start = area?.selectionStart ?? text.length;
    const end = area?.selectionEnd ?? text.length;
    const next = `${text.slice(0, start)}${emoji}${text.slice(end)}`;
    setText(next);
    requestAnimationFrame(() => {
      area?.focus();
      const caret = start + emoji.length;
      area?.setSelectionRange(caret, caret);
    });
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText("");
    onTyping(false);
    await onSend(value);
  }

  return (
    <form className="flex items-end gap-2 border-t border-line bg-panel/80 px-3 py-3 backdrop-blur" onSubmit={submit}>
      <EmojiPicker onPick={insert} />
      <textarea
        ref={field}
        rows={1}
        className="max-h-32 min-h-10 flex-1 resize-none rounded-3xl border border-input bg-transparent px-4 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-gold/60"
        value={text}
        placeholder="Type a message"
        onChange={(event) => {
          setText(event.target.value);
          event.target.style.height = "auto";
          event.target.style.height = `${Math.min(event.target.scrollHeight, 128)}px`;
          onTyping(true);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => onTyping(false), 1500);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void submit();
          }
        }}
      />
      <Button className="size-11 shrink-0" size="icon" type="submit" aria-label="Send" disabled={!text.trim()}><Send /></Button>
    </form>
  );
}
