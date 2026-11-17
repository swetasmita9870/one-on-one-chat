import type { ChatRecord, UserProfile } from "./types";
import { formatLastSeen } from "./format-chat-time";

export function emojiOnly(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return /^(\p{Extended_Pictographic}|\uFE0F|\u200D|\s)+$/u.test(trimmed) && trimmed.length <= 16;
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
  return formatLastSeen(profile.lastSeen);
}
