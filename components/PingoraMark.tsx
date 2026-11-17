"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { ThemeMode } from "./ThemeToggle";

const ICON: Record<ThemeMode, string> = {
  dark: "/pingora-icon-dark.png",
  light: "/pingora-icon-light.png",
};

function currentTheme(): ThemeMode {
  if (typeof document === "undefined") return "dark";
  return document.body.dataset.theme === "light" ? "light" : "dark";
}

export function PingoraMark({ className = "size-10" }: { className?: string }) {
  const [theme, setTheme] = useState<ThemeMode>("dark");

  useEffect(() => {
    setTheme(currentTheme());
    const obs = new MutationObserver(() => setTheme(currentTheme()));
    obs.observe(document.body, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  return (
    <span className={cn("relative block shrink-0 overflow-hidden rounded-[22%]", className)}>
      <img src={ICON[theme]} alt="Pingora" className="size-full object-cover" />
    </span>
  );
}