"use client"

import * as React from "react"

import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/dashboard/nav-user"
import Link from "next/link"
import Image from "next/image"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { 
  LayoutDashboard, 
  Users, 
  Clock, 
  Settings, 
  CheckSquare2,
} from "lucide-react"

const data = {
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: <LayoutDashboard className="size-4" />,
    },
    {
      title: "Leads",
      url: "/dashboard/leads",
      icon: <Users className="size-4" />,
    },
    {
      title: "Tasks",
      url: "/dashboard/tasks",
      icon: <CheckSquare2 className="size-4" />,
    },
    {
      title: "Attendance",
      url: "/dashboard/attendance",
      icon: <Clock className="size-4" />,
    },
    {
      title: "Team",
      url: "/dashboard/team",
      icon: <Users className="size-4" />,
    },
  ],
  navSecondary: [
    {
      title: "Settings",
      url: "/dashboard/settings",
      icon: <Settings className="size-4" />,
    },
  ],
}

const rolePermissions: Record<string, string[]> = {
  admin: ["Dashboard", "Leads", "Tasks", "Attendance", "Team"],
  operations_manager: ["Dashboard", "Leads", "Tasks", "Attendance", "Team"],
  sales_manager: ["Dashboard", "Leads", "Tasks", "Attendance", "Team"],
  sales_agent: ["Dashboard", "Leads", "Tasks", "Attendance"],
  finance_manager: ["Dashboard", "Leads", "Tasks", "Attendance", "Team"],
  finance_agent: ["Dashboard", "Leads", "Tasks", "Attendance"],
};

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user: {
    id: string;
    full_name: string | null;
    email: string;
    role: string;
    avatar_url?: string;
  };
}

export function AppSidebar({ user, ...props }: AppSidebarProps) {
  return (
    <Sidebar variant="inset" collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <Link href="/dashboard">
                <div className="size-6 overflow-hidden rounded">
                  <Image src="/twn.svg" alt="TWN" width={24} height={24} className="size-6" />
                </div>
                <span className="text-base font-bold tracking-tight text-foreground">TWN Workspace</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain.filter(item => (rolePermissions[user.role] || rolePermissions.sales_agent).includes(item.title))} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
