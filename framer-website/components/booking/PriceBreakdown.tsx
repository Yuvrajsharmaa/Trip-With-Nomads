"use client";

import { PricingBreakdown } from "@/lib/booking-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface PriceBreakdownProps {
  pricing: PricingBreakdown;
  tripTitle: string;
}

export function PriceBreakdownSummary({ pricing, tripTitle }: PriceBreakdownProps) {
  return (
    <TooltipProvider>
      <Card className="sticky top-24">
        <CardHeader>
          <CardTitle>Booking summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1">
            <p className="font-medium">{tripTitle}</p>
            <Badge variant="secondary">Group trip</Badge>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>
                {pricing.quantity} traveller{pricing.quantity > 1 ? "s" : ""} x ${pricing.basePrice}
              </span>
              <span>${pricing.subtotal.toFixed(2)}</span>
            </div>

            <div className="flex items-center justify-between text-muted-foreground">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="flex items-center gap-1 text-left">
                    <span>Service tax (2%)</span>
                    <span className="text-muted-foreground">i</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>Mandatory service tax applied to all travel bookings.</TooltipContent>
              </Tooltip>
              <span>${pricing.taxAmount.toFixed(2)}</span>
            </div>

            <Separator />

            <div className="flex items-center justify-between text-base font-semibold">
              <span>Total payable</span>
              <span>${pricing.total.toFixed(2)}</span>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex-col gap-3">
          <Button className="w-full">Secure checkout</Button>
          <p className="text-center text-xs text-muted-foreground">SSL encrypted and ready for payment gateway handoff.</p>
        </CardFooter>
      </Card>
    </TooltipProvider>
  );
}
