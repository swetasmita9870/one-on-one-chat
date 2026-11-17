"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WALLPAPERS, useAppStore, type WallpaperId } from "@/lib/store";

export default function Page() {
  useEffect(() => {
    const saved = localStorage.getItem("justus-wallpaper");
    if (saved && WALLPAPERS.includes(saved as WallpaperId)) useAppStore.getState().setWallpaper(saved as WallpaperId);
  }, []);
  return (
    <TooltipProvider delayDuration={250}>
      <AppShell />
    </TooltipProvider>
  );
}
