import { ComingSoon } from "@/components/dashboard/coming-soon";
import { BarChart3 } from "lucide-react";

export default function PerformancePage() {
  return (
    <ComingSoon 
      moduleName="Elite Leaderboard"
      description="Competitive performance analytics and sales agent achievements. Only for the most dedicated explorers."
      icon={<BarChart3 className="size-8 text-primary shadow-2xl" />}
    />
  );
}
