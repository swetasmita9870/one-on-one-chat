"use client";

import { Check, ImageIcon } from "lucide-react";
import { WALLPAPERS, useAppStore, type WallpaperId } from "@/lib/store";
import { WALLPAPER_LABELS, wallpaperClassName, wallpaperStyle } from "@/lib/wallpapers";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

function Swatch({ id }: { id: WallpaperId }) {
  return (
    <span
      className={`${wallpaperClassName(id)} size-6 shrink-0 rounded-md border border-line`}
      style={wallpaperStyle(id)}
      aria-hidden
    />
  );
}

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
      <DropdownMenuContent align="end" className="max-h-[min(24rem,70dvh)] overflow-y-auto">
        {WALLPAPERS.map((id) => (
          <DropdownMenuItem key={id} onSelect={() => setWallpaper(id)}>
            <Swatch id={id} />
            {WALLPAPER_LABELS[id]}
            {wallpaper === id ? <Check className="ml-auto size-4 text-gold" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}