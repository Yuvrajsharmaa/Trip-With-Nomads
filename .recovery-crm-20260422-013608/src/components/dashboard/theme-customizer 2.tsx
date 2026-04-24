"use client";

import * as React from "react";
import { Check, Moon, Sun, Monitor, Paintbrush } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { THEME_PRESETS, type ThemePreset } from "@/lib/themes";
import { Separator } from "@/components/ui/separator";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { useThemeSettings } from "@/components/theme-settings-provider";

export function ThemeCustomizer() {
  const { theme, setTheme } = useTheme();
  const { preset, setPreset, radius, setRadius } = useThemeSettings();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Paintbrush className="size-4 text-muted-foreground" />
          <h4 className="text-sm font-bold uppercase tracking-widest text-foreground">Theme Preset</h4>
        </div>
        <Select value={preset} onValueChange={(val) => setPreset(val as ThemePreset)}>
          <SelectTrigger className="w-full h-11 px-4 rounded-xl border-border bg-card shadow-sm hover:bg-muted transition-colors text-[13px] font-semibold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-card border-border rounded-xl shadow-2xl p-1">
            {THEME_PRESETS.map((p) => (
              <SelectItem 
                key={p.id} 
                value={p.id} 
                className="rounded-lg h-9 text-xs font-semibold focus:bg-muted"
              >
                <div className="flex items-center gap-2.5">
                  <span 
                    className="size-2.5 rounded-full shrink-0 shadow-sm" 
                    style={{ backgroundColor: p.color }}
                  />
                  {p.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator className="bg-border/50" />

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Monitor className="size-4 text-muted-foreground" />
          <h4 className="text-sm font-bold uppercase tracking-widest text-foreground">Color Mode</h4>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: "light", icon: Sun, label: "Light" },
            { id: "dark", icon: Moon, label: "Dark" },
            { id: "system", icon: Monitor, label: "System" },
          ].map((mode) => (
            <Button
              key={mode.id}
              variant={theme === mode.id ? "default" : "outline"}
              size="sm"
              className={cn(
                "flex-col h-14 gap-2 rounded-xl border-border shadow-none",
                theme === mode.id && "bg-primary text-primary-foreground border-primary shadow-sm"
              )}
              onClick={() => setTheme(mode.id)}
            >
              <mode.icon className="size-3.5" />
              <span className="text-[10px] font-bold uppercase">{mode.label}</span>
            </Button>
          ))}
        </div>
      </div>
      
      <Button 
        variant="ghost" 
        className="w-full h-11 text-muted-foreground font-bold rounded-xl mt-2 hover:bg-muted"
        onClick={() => {
          setPreset("default");
        }}
      >
        Reset to Default
      </Button>
    </div>
  );
}
