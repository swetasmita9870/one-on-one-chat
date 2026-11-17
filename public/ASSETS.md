# Pingora — assets

All items below are in the repo and wired in the app.

| Asset | Path | Used for |
|-------|------|----------|
| Logo (dark / light) | `pingora-icon-dark.png`, `pingora-icon-light.png` | Sidebar, auth, splash |
| Favicon | `favicon.ico` | Tab + notifications |
| App icon | `app-icon-512.png` | Install / Apple touch |
| Message sound | `sounds/message.mp3` | New message (`lib/sounds.ts`) |
| Ringtone | `sounds/ringtone.mp3` | Incoming call |
| Wallpapers | `wallpapers/*.jpg` | Profile → Appearance, thread menu |

UI chrome icons use **Lucide** in code.

## Theme colors (`app/globals.css`)

| Role | Dark | Light |
|------|------|-------|
| Theme / background (`ink`) | `#07111a` | `#efeae2` |
| Panels (`panel`) | `#0e1822` | `#ffffff` |
| Accent (`gold`) | `#1ec9a0` | `#008069` |

Theme toggle: Chats header or **Profile → Dark / Light** (`pingora-theme` in localStorage).

## SEO

Set `NEXT_PUBLIC_SITE_URL` in Vercel to your production URL. The app serves `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest`, Open Graph/Twitter meta, and JSON-LD (`WebSite` + `WebApplication`).