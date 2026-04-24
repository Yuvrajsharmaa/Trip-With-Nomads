"use client";
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Users, 
  MapPin, 
  Calendar, 
  Settings, 
  ChefHat, 
  UserSquare,
  ChevronLeft,
  LayoutDashboard,
  Utensils
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider
} from "@/components/ui/tooltip";

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: ChefHat, label: 'Kitchen Display', href: '/kitchen' },
  { icon: Utensils, label: 'Catalog', href: '/catalog' },
  { icon: MapPin, label: 'Stations', href: '/stations' },
  { icon: UserSquare, label: 'Kiosks', href: '/kiosks' },
  { icon: Calendar, label: 'Scheduler', href: '/scheduler' },
  { icon: Users, label: 'Team', href: '/team' },
  { icon: Settings, label: 'Settings', href: '/settings' },
];

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <TooltipProvider>
      <aside 
        className={cn(
          "fixed left-0 top-16 h-[calc(100vh-64px)] bg-white border-r border-[#FBD600]/20 transition-all duration-300 ease-in-out z-40 flex flex-col overflow-hidden",
          isCollapsed ? "w-20" : "w-64"
        )}
      >
        <div className="flex-1 py-4 overflow-y-auto overflow-x-hidden">
          <nav className="px-3 space-y-1">
            {menuItems.map((item) => (
              <Tooltip key={item.href} delayDuration={0}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center h-12 rounded-lg transition-all duration-200 group relative mb-1",
                      pathname === item.href 
                        ? "bg-[#FBD600] text-[#523F1E] shadow-sm" 
                        : "text-[#886B3E] hover:bg-[#FBD600]/10 hover:text-[#523F1E]"
                    )}
                  >
                    <div className={cn(
                      "flex items-center justify-center shrink-0 w-14 h-full",
                      pathname === item.href ? "opacity-100" : "opacity-70 group-hover:opacity-100"
                    )}>
                      <item.icon className="h-5 w-5" />
                    </div>
                    {!isCollapsed && (
                      <span className="font-medium whitespace-nowrap overflow-hidden pr-4">{item.label}</span>
                    )}
                  </Link>
                </TooltipTrigger>
                {isCollapsed && (
                  <TooltipContent side="right" className="bg-white text-[#523F1E] border-[#FBD600]/30 shadow-md">
                    {item.label}
                  </TooltipContent>
                )}
              </Tooltip>
            ))}
          </nav>
        </div>
        <div className="p-4 border-t border-[#FBD600]/10 shrink-0">
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="flex w-full items-center justify-center h-10 rounded-lg hover:bg-[#FBD600]/10 transition-colors group cursor-pointer"
              >
                <ChevronLeft className={cn(
                  "h-5 w-5 text-[#886B3E] transition-transform duration-300",
                  isCollapsed && "rotate-180"
                )} />
              </button>
            </TooltipTrigger>
            {isCollapsed && (
              <TooltipContent side="right" className="bg-white text-[#523F1E] border-[#FBD600]/30 shadow-md">
                Expand sidebar
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
