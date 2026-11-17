import { create } from "zustand";
import type { ChatRecord, MessageRecord, UserProfile } from "./types";
import type { WallpaperId } from "./wallpapers";

export { WALLPAPERS, type WallpaperId } from "./wallpapers";

type AppState = {
  profiles: Record<string, UserProfile>;
  chats: ChatRecord[];
  messages: Record<string, MessageRecord[]>;
  wallpaper: WallpaperId;
  putProfiles: (rows: UserProfile[]) => void;
  setChats: (chats: ChatRecord[]) => void;
  setMessages: (chatId: string, rows: MessageRecord[]) => void;
  patchUnread: (chatId: string, uid: string) => void;
  setWallpaper: (wallpaper: WallpaperId) => void;
};

export const useAppStore = create<AppState>((set) => ({
  profiles: {},
  chats: [],
  messages: {},
  wallpaper: "doodle",
  putProfiles: (rows) => set((state) => {
    if (!rows.length) return state;
    const profiles = { ...state.profiles };
    rows.forEach((row) => { profiles[row.uid] = row; });
    return { profiles };
  }),
  setChats: (chats) => set({ chats }),
  setMessages: (chatId, rows) => set((state) => ({ messages: { ...state.messages, [chatId]: rows } })),
  patchUnread: (chatId, uid) => set((state) => ({
    chats: state.chats.map((chat) => chat.id === chatId
      ? { ...chat, members: { ...chat.members, [uid]: { ...chat.members[uid], unread: 0 } } }
      : chat),
  })),
  setWallpaper: (wallpaper) => {
    if (typeof window !== "undefined") localStorage.setItem("justus-wallpaper", wallpaper);
    set({ wallpaper });
  },
}));
