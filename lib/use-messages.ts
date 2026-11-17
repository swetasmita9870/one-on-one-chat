"use client";

import { useEffect } from "react";
import { watchMessages } from "./messages";
import { useAppStore } from "./store";
import type { MessageRecord } from "./types";

const holders = new Map<string, { n: number; limit: number; stop: () => void }>();
const emptyMessages: MessageRecord[] = [];

export function sameTextMap(current: Record<string, string>, next: Record<string, string>) {
  const currentKeys = Object.keys(current);
  const nextKeys = Object.keys(next);
  return currentKeys.length === nextKeys.length && nextKeys.every((key) => current[key] === next[key]);
}

function retainMessages(chatId: string, limit: number) {
  let holder = holders.get(chatId);
  if (!holder) {
    holder = {
      n: 0,
      limit,
      stop: watchMessages(chatId, limit, (rows) => useAppStore.getState().setMessages(chatId, rows)),
    };
    holders.set(chatId, holder);
  } else if (limit > holder.limit) {
    holder.stop();
    holder.limit = limit;
    holder.stop = watchMessages(chatId, limit, (rows) => useAppStore.getState().setMessages(chatId, rows));
  }
  holder.n += 1;
  return () => {
    const current = holders.get(chatId);
    if (!current) return;
    current.n -= 1;
    if (current.n <= 0) {
      current.stop();
      holders.delete(chatId);
    }
  };
}

export function useChatMessages(chatId: string, limit: number) {
  const rows = useAppStore((state) => state.messages[chatId] ?? emptyMessages);
  useEffect(() => retainMessages(chatId, limit), [chatId, limit]);
  return rows;
}
