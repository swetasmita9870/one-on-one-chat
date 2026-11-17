import type { CSSProperties } from "react";

export const GRADIENT_WALLPAPERS = ["doodle", "aurora", "leaves", "midnight", "sand"] as const;
export type GradientWallpaperId = (typeof GRADIENT_WALLPAPERS)[number];

export const PHOTO_WALLPAPERS = [
  { id: "photo-dune", file: "dune-part-two-5120x2880-27736.jpg", label: "Dunes" },
  { id: "photo-kyle", file: "kyle-johnson-8Gl7Ew-q6D8-unsplash.jpg", label: "Valley" },
  { id: "photo-paul", file: "paul-lichtblau-fX-qWsXl5x8-unsplash.jpg", label: "Coast" },
  { id: "photo-valentin", file: "valentin-muller-bWtd1ZyEy6w-unsplash.jpg", label: "Peaks" },
  { id: "photo-tony", file: "tony-litvyak-5I2HWqQ-YhA-unsplash.jpg", label: "Forest" },
  { id: "photo-albert", file: "albert-oliveira-XKvHbIboVf0-unsplash.jpg", label: "Night" },
] as const;

export type PhotoWallpaperId = (typeof PHOTO_WALLPAPERS)[number]["id"];
export type WallpaperId = GradientWallpaperId | PhotoWallpaperId;

export const WALLPAPERS: WallpaperId[] = [...GRADIENT_WALLPAPERS, ...PHOTO_WALLPAPERS.map((row) => row.id)];

const gradientLabels: Record<GradientWallpaperId, string> = {
  doodle: "Doodle",
  aurora: "Aurora",
  leaves: "Leaves",
  midnight: "Midnight",
  sand: "Sand",
};

export const WALLPAPER_LABELS: Record<WallpaperId, string> = {
  ...gradientLabels,
  ...Object.fromEntries(PHOTO_WALLPAPERS.map((row) => [row.id, row.label])) as Record<PhotoWallpaperId, string>,
};

export function wallpaperPath(id: WallpaperId): string | null {
  const photo = PHOTO_WALLPAPERS.find((row) => row.id === id);
  return photo ? `/wallpapers/${photo.file}` : null;
}

export function wallpaperClassName(id: WallpaperId): string {
  return wallpaperPath(id) ? "wallpaper wallpaper-photo" : `wallpaper wallpaper-${id}`;
}

export function wallpaperStyle(id: WallpaperId): CSSProperties | undefined {
  const path = wallpaperPath(id);
  if (!path) return undefined;
  return {
    backgroundImage: `url(${path})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
}

export function isWallpaperId(value: string): value is WallpaperId {
  return (WALLPAPERS as string[]).includes(value);
}