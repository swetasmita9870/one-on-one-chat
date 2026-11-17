"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAppStore } from "@/lib/store";
import { isWallpaperId } from "@/lib/wallpapers";

export default function Page() {
  useEffect(() => {
    const saved = localStorage.getItem("justus-wallpaper");
    if (saved && isWallpaperId(saved)) useAppStore.getState().setWallpaper(saved);
  }, []);
  return (
    <TooltipProvider delayDuration={250}>
      <AppShell />
    </TooltipProvider>
  );
}
