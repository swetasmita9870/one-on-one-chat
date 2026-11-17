"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type ThemeMode = "dark" | "light";

const KEY = "pingora-theme";

export function readSavedTheme(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  const saved = localStorage.getItem(KEY);
  return saved === "light" ? "light" : "dark";
}

export function writeTheme(theme: ThemeMode) {
  localStorage.setItem(KEY, theme);
  document.body.dataset.theme = theme;
}

export function ThemeToggle({ theme, onTheme }: { theme: ThemeMode; onTheme: (theme: ThemeMode) => void }) {
  const next = theme === "dark" ? "light" : "dark";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" type="button" aria-label={next === "light" ? "Light theme" : "Dark theme"} onClick={() => onTheme(next)}>
          {theme === "dark" ? <Sun /> : <Moon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{next === "light" ? "Light mode" : "Dark mode"}</TooltipContent>
    </Tooltip>
  );
}