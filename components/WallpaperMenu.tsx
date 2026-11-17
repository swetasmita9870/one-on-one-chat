"use client";

import { Check, ImageIcon } from "lucide-react";
import { WALLPAPERS, useAppStore, type WallpaperId } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const labels: Record<WallpaperId, string> = {
  doodle: "Doodle",
  aurora: "Aurora",
  leaves: "Leaves",
  midnight: "Midnight",
  sand: "Sand",
};

export function WallpaperMenu() {
  const wallpaper = useAppStore((state) => state.wallpaper);
  const setWallpaper = useAppStore((state) => state.setWallpaper);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" type="button" aria-label="Choose wallpaper">
          <ImageIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {WALLPAPERS.map((id) => (
          <DropdownMenuItem key={id} onSelect={() => setWallpaper(id)}>
            <span className={`wallpaper wallpaper-${id} size-6 rounded-md border border-line`} />
            {labels[id]}
            {wallpaper === id ? <Check className="ml-auto size-4 text-gold" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
