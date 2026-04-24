import { ComingSoon } from "@/components/dashboard/coming-soon";
import { Truck } from "lucide-react";

export default function HandoffsPage() {
  return (
    <ComingSoon 
      moduleName="Handoff Protocols"
      description="Streamlining sales-to-operations transitions. We are building a high-fidelity handoff interface with secure document exchange."
      icon={<Truck className="size-8 text-primary shadow-2xl" />}
    />
  );
}
