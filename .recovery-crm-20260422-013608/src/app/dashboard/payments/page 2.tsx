import { ComingSoon } from "@/components/dashboard/coming-soon";
import { CreditCard } from "lucide-react";

export default function PaymentsPage() {
  return (
    <ComingSoon 
      moduleName="Revenue Center"
      description="Financial tracking for partial/full payments. This module will secure all incoming nomadic revenue streams."
      icon={<CreditCard className="size-8 text-primary shadow-2xl" />}
    />
  );
}
