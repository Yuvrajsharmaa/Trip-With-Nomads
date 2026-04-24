import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth/request-context";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { AttendanceWidget } from "@/components/dashboard/attendance-widget";
import { ModeToggle } from "@/components/dashboard/mode-toggle";
import { NotificationsMenu } from "@/components/dashboard/notifications-menu";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await getRequestContext();
  if (!user) redirect("/login");

  if (!profile) redirect("/onboarding");
  if (profile.status === "pending") redirect("/pending-approval");
  if (profile.status === "suspended") redirect("/suspended");

  const allowedRoles = [
    "admin",
    "operations_manager",
    "sales_manager",
    "sales_agent",
    "finance_manager",
    "finance_agent",
  ];
  if (!allowedRoles.includes(profile.role)) redirect("/onboarding");

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-background w-full">
        <AppSidebar user={{ ...profile, email: profile.email || "" }} />

        <SidebarInset className="flex min-h-screen flex-col bg-background/50">
          {/* Minimal Header */}
          <header className="sticky top-0 flex h-12 w-full items-center gap-3 border-b border-border/50 bg-background/70 backdrop-blur-xl px-4 md:px-6 shrink-0 z-30">
            <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground transition-colors" />
            <Separator
              orientation="vertical"
              className="h-4 bg-border"
            />

            <div className="ml-auto flex items-center gap-2">
              <AttendanceWidget agentId={profile.id} />
              
              <div className="h-4 w-px bg-zinc-200/60 mx-1 hidden sm:block" />
              
              <ModeToggle />
              
              <NotificationsMenu />
              
              {/* Role badge */}
              <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider hidden sm:block">
                {profile.role?.replace(/_/g, " ")}
              </span>
            </div>
          </header>

          <main className="flex-1 flex flex-col w-full animate-in fade-in duration-500">
            {children}
          </main>
        </SidebarInset>

      </div>
    </SidebarProvider>
  );
}
