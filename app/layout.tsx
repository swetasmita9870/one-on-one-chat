import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Just Us",
  description: "Encrypted chats for two, or a group.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
