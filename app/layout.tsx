import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteJsonLd } from "@/components/SiteJsonLd";
import { site, siteUrl } from "@/lib/site";

const base = siteUrl();
const defaultTitle = `${site.name} — ${site.tagline}`;

export const metadata: Metadata = {
  metadataBase: new URL(base),
  title: {
    default: defaultTitle,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  keywords: [...site.keywords],
  applicationName: site.name,
  authors: [{ name: site.name, url: base }],
  creator: site.name,
  publisher: site.name,
  category: "communication",
  alternates: {
    canonical: "/",
  },
  appleWebApp: {
    capable: true,
    title: site.name,
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: site.locale,
    url: base,
    siteName: site.name,
    title: defaultTitle,
    description: site.description,
    images: [
      {
        url: "/app-icon-512.png",
        width: 512,
        height: 512,
        alt: `${site.name} logo`,
      },
    ],
  },
  twitter: {
    card: "summary",
    title: defaultTitle,
    description: site.description,
    images: ["/app-icon-512.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/favicon.ico",
    apple: { url: "/app-icon-512.png", sizes: "512x512", type: "image/png" },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#07111a" },
    { media: "(prefers-color-scheme: light)", color: "#efeae2" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <SiteJsonLd />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,460;9..144,560&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}