"use client";

import { LogOut } from "lucide-react";
import { getTodayAttendance } from "@/lib/actions/attendance";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { BreakLog } from "@/types/attendance";

export function LogoutButton({ agentId }: { agentId: string }) {
  const router = useRouter();

  const handleLogout = async () => {
    const log = await getTodayAttendance(agentId);
    
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

      if (netHours < 8) {
        toast.error("Shift Action Blocked", {
          description: `You have only completed ${netHours.toFixed(1)}/8h. You must complete your shift before logging out.`,
        });
        return;
      }
    }

    // Pass hour check (or no attendance record = admin/off-day)
    router.push("/logout");
  };

  return (
    <button
      onClick={handleLogout}
      className="ml-auto p-1.5 hover:bg-zinc-100 rounded-md text-zinc-300 hover:text-zinc-600 transition-colors"
      title="Logout"
    >
      <LogOut className="size-3" />
    </button>
  );
}
