/** Public site URL for SEO, OG tags, sitemap, and canonical links. */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://one-on-one-chat.vercel.app";
  return raw.replace(/\/$/, "");
}

export const site = {
  name: "Pingora",
  tagline: "Every moment connected.",
  description:
    "Pingora is a web messenger for private chats, voice and video calls, disappearing status, and groups — made for one-on-one connection.",
  locale: "en_US",
  keywords: [
    "Pingora",
    "messenger",
    "chat app",
    "private messaging",
    "video call",
    "voice call",
    "group chat",
    "status updates",
    "WebRTC",
  ],
} as const;