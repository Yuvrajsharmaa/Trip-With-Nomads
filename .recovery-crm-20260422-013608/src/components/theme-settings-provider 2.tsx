"use client";

import * as React from "react";
import { type ThemePreset } from "@/lib/themes";

interface ThemeSettingsContextType {
  preset: ThemePreset;
  setPreset: (preset: ThemePreset) => void;
  radius: string;
  setRadius: (radius: string) => void;
}

const ThemeSettingsContext = React.createContext<ThemeSettingsContextType | undefined>(undefined);

export function ThemeSettingsProvider({ children }: { children: React.ReactNode }) {
  const [preset, setPreset] = React.useState<ThemePreset>("default");
  const [radius, setRadius] = React.useState("1.0");
  const [mounted, setMounted] = React.useState(false);

  // Load from localStorage
  React.useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("twn-theme-preset");
    if (saved) setPreset(saved as ThemePreset);
    const savedRadius = localStorage.getItem("twn-theme-radius");
    if (savedRadius) setRadius(savedRadius);
  }, []);

  const updatePreset = (p: ThemePreset) => {
    setPreset(p);
    localStorage.setItem("twn-theme-preset", p);
    // Apply class to body
    document.body.classList.forEach(c => {
      if (c.startsWith("theme-")) document.body.classList.remove(c);
    });
    if (p !== "default") document.body.classList.add(`theme-${p}`);
  };

  const updateRadius = (r: string) => {
    setRadius(r);
    localStorage.setItem("twn-theme-radius", r);
    document.documentElement.style.setProperty("--radius", `${r}rem`);
  };

  if (!mounted) {
    return (
      <ThemeSettingsContext.Provider 
        value={{ 
          preset: "default", 
          setPreset: updatePreset, 
          radius: "1.0", 
          setRadius: updateRadius 
        }}
      >
        {children}
      </ThemeSettingsContext.Provider>
    );
  }

  return (
    <ThemeSettingsContext.Provider 
      value={{ 
        preset, 
        setPreset: updatePreset, 
        radius, 
        setRadius: updateRadius 
      }}
    >
      <div className={preset !== "default" ? `theme-${preset}` : ""}>
        {children}
      </div>
    </ThemeSettingsContext.Provider>
  );
}

export function useThemeSettings() {
  const context = React.useContext(ThemeSettingsContext);
  if (!context) throw new Error("useThemeSettings must be used within ThemeSettingsProvider");
  return context;
}
