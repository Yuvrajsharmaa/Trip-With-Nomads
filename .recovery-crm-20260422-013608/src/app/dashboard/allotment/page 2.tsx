import { ComingSoon } from "@/components/dashboard/coming-soon";
import { Map } from "lucide-react";

export default function AllotmentPage() {
  return (
    <ComingSoon 
      moduleName="Allotment Grid"
      description="Intelligent resource and vehicle assignment protocols for upcoming mountain expeditions. Managing the logistics of the frontier."
      icon={<Map className="size-8 text-primary shadow-2xl" />}
    />
  );
}
