export type ThemePreset = 
  | "default" 
  | "underground" 
  | "rose-garden" 
  | "lake-view" 
  | "sunset-glow" 
  | "forest-whisper" 
  | "ocean-breeze" 
  | "lavender-dream";

export interface ThemeConfig {
  name: string;
  id: ThemePreset;
  color: string; // The primary brand color for the selector
}

export const THEME_PRESETS: ThemeConfig[] = [
  { name: "Default", id: "default", color: "#18181b" },
  { name: "Underground", id: "underground", color: "#166534" },
  { name: "Rose Garden", id: "rose-garden", color: "#e11d48" },
  { name: "Lake View", id: "lake-view", color: "#0d9488" },
  { name: "Sunset Glow", id: "sunset-glow", color: "#ea580c" },
  { name: "Forest Whisper", id: "forest-whisper", color: "#15803d" },
  { name: "Ocean Breeze", id: "ocean-breeze", color: "#2563eb" },
  { name: "Lavender Dream", id: "lavender-dream", color: "#8b5cf6" },
];
