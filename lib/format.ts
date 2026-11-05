import type { ChatRecord, UserProfile } from "./types";

export function formatDay(ts: number) {
  const date = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

export function emojiOnly(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return /^(\p{Extended_Pictographic}|\uFE0F|\u200D|\s)+$/u.test(trimmed) && trimmed.length <= 16;
}

export function formatTime(ts: number) {
  const date = new Date(ts);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function otherId(chat: ChatRecord, me: string) {
  return chat.memberIds.find((id) => id !== me) || "";
}

export function chatTitle(chat: ChatRecord, me: string, profiles: Record<string, UserProfile>) {
  if (chat.type === "group") return chat.title || "Group";
  return profiles[otherId(chat, me)]?.displayName || "Chat";
}

export function chatPhoto(chat: ChatRecord, me: string, profiles: Record<string, UserProfile>) {
  if (chat.type === "group") return chat.photoURL;
  return profiles[otherId(chat, me)]?.photoURL || "";
}

export function lastSeenLabel(profile: UserProfile | undefined, allowed: boolean) {
  if (!profile || !allowed) return "";
  if (profile.online && Date.now() - profile.lastSeen < 90000) return "online";
  if (!profile.lastSeen) return "";
  return `last seen ${formatTime(profile.lastSeen)}`;
}
