"use client"

import Link from "next/link"
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { 
  EllipsisVertical, 
  LogOut,
  ShieldCheck,
  Settings
} from "lucide-react"
import { toast } from "sonner"
import { clockOut, getTodayAttendance } from "@/lib/actions/attendance"
import type { BreakLog } from "@/types/attendance"

export function NavUser({
  user,
}: {
  user: {
    id: string;
    full_name: string | null;
    email: string;
    role: string;
    avatar_url?: string;
  }
}) {
  const { isMobile } = useSidebar()
  const userName = user?.full_name || "User"
  const userEmail = user?.email || "system@admin.com"
  const userRole = (user?.role || "sales_agent").replace(/_/g, " ")

  const handleLogout = async () => {
    // Check shift completion before logout
    try {
      const log = await getTodayAttendance(user?.id);
      if (log && log.clock_in && !log.clock_out) {
        const now = new Date().getTime();
        const clockInTime = new Date(log.clock_in).getTime();
        const grossMs = now - clockInTime;
        
        let totalBreakMs = 0;
        log.breaks.forEach((b: BreakLog) => {
          const start = new Date(b.start).getTime();
          const end = b.end ? new Date(b.end).getTime() : now;
          totalBreakMs += (end - start);
        });

        const netWorkMs = grossMs - totalBreakMs;
        const netHours = netWorkMs / (1000 * 60 * 60);

        if (netHours < 8 && user?.role !== "admin") {
          toast.error("Shift Active", {
            description: `You have completed ${netHours.toFixed(1)}/8h. End shift first, then logout.`,
          });
          return;
        }
      }
    } catch (e) {
      console.error("Logout check failed", e);
    }
    
    window.location.href = "/logout";
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground border border-border shadow-sm"
            >
              <Avatar className="h-8 w-8 rounded-lg bg-primary">
                <AvatarFallback className="rounded-lg bg-primary text-primary-foreground font-bold text-xs uppercase">
                  {userName.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-bold text-foreground">{userName}</span>
                <span className="truncate text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                  {userRole}
                </span>
              </div>
              <EllipsisVertical className="ml-auto size-4 text-muted-foreground/60" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-xl shadow-lg border-border bg-card"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg bg-primary">
                  <AvatarFallback className="rounded-lg bg-primary text-primary-foreground font-bold text-xs uppercase">
                    {userName.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-bold text-foreground">{userName}</span>
                  <span className="truncate text-[10px] text-muted-foreground font-medium">{userEmail}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings" className="flex w-full items-center cursor-pointer font-bold text-xs rounded-lg px-2">
                  <Settings className="mr-2 size-3.5 text-muted-foreground/60" />
                  Workspace Settings
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              className="cursor-pointer font-bold text-xs rounded-lg px-2"
              onClick={async () => {
                try {
                  await clockOut(user.id);
                  toast.success("Shift ended");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not end shift");
                }
              }}
            >
              <ShieldCheck className="mr-2 size-3.5" />
              End Shift
            </DropdownMenuItem>
            <DropdownMenuItem 
              className="cursor-pointer font-bold text-xs text-rose-600 focus:bg-rose-500/10 focus:text-rose-700 rounded-lg px-2"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 size-3.5" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
