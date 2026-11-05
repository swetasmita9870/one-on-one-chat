export const EMOJI_GROUPS = {
  Smileys: ["😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎", "🤩", "😋", "😢", "😭", "😤", "😴", "🤔", "🙄", "😅", "😇"],
  Gestures: ["👍", "👎", "👏", "🙏", "💪", "🤝", "✌️", "👋", "🤞", "👌", "🙌", "💯"],
  Hearts: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "✨", "🔥", "⭐"],
  Life: ["🎉", "🥳", "🎂", "🥂", "🌹", "☕", "🌙", "☀️", "🍀", "🎵", "📸", "💬"],
} as const;

export type EmojiGroup = keyof typeof EMOJI_GROUPS;

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
