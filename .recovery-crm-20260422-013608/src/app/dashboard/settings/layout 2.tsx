"use client"

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  User, 
  Settings as SettingsIcon, 
  CreditCard, 
  Paintbrush, 
  Bell, 
  Monitor 
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full bg-background/50">
      <div className="px-6 md:px-8 py-8 md:py-12 max-w-5xl mx-auto w-full">
        <div className="space-y-1 mb-8">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Settings</h1>
          <p className="text-muted-foreground font-medium">Manage your workspace identity and visual preferences.</p>
        </div>

        <div className="bg-card rounded-[32px] border border-border shadow-sm overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
