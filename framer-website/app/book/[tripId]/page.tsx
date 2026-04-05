"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, MapPin, ShieldCheck } from "lucide-react";

import { PriceBreakdownSummary } from "@/components/booking/PriceBreakdown";
import { TravellerForm } from "@/components/booking/TravellerForm";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TRIPS, calculateTripPricing, Traveller } from "@/lib/booking-utils";

export default function BookingPage() {
  const params = useParams();
  const tripId = params.tripId as string;
  const trip = TRIPS[tripId] || TRIPS.kashmir;

  const [travellers, setTravellers] = useState<Traveller[]>([{ id: "1", isSelf: true, name: "Current User", age: 28 }]);

  const pricing = calculateTripPricing(trip.price, travellers);

  const addTraveller = () => {
    const newId = (travellers.length + 1).toString();
    setTravellers([...travellers, { id: newId, isSelf: false, name: "", age: "" }]);
  };

  const removeTraveller = (id: string) => {
    if (travellers.length <= 1) {
      return;
    }

    setTravellers(travellers.filter((traveller) => traveller.id !== id));
  };

  const updateTraveller = (id: string, updates: Partial<Traveller>) => {
    setTravellers(travellers.map((traveller) => (traveller.id === id ? { ...traveller, ...updates } : traveller)));
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon">
              <Link href="/">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <p className="text-sm font-medium">Nomads CRM</p>
              <p className="text-xs text-muted-foreground">Booking record</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Badge variant="secondary" className="hidden sm:inline-flex">
              Trusted checkout
            </Badge>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1.6fr_0.9fr] lg:px-8">
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div
              className="h-56 bg-cover bg-center"
              style={{
                backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.45)), url(${trip.image})`,
              }}
            />
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{trip.id.toUpperCase()}</Badge>
                <Badge variant="outline">{trip.dates}</Badge>
              </div>
              <CardTitle className="text-3xl">{trip.title}</CardTitle>
              <CardDescription className="max-w-2xl">
                Review traveller details and hand the record off to payment or support.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Price</p>
                <p className="mt-1 text-lg font-semibold">${trip.price}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Duration</p>
                <p className="mt-1 text-lg font-semibold">7 days</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Theme</p>
                <p className="mt-1 text-lg font-semibold">Shadcn defaults</p>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {travellers.map((traveller, index) => (
              <TravellerForm
                key={traveller.id}
                traveller={traveller}
                index={index}
                onUpdate={updateTraveller}
                onRemove={removeTraveller}
                canRemove={travellers.length > 1}
              />
            ))}
          </div>

          <Button type="button" variant="outline" className="w-full" onClick={addTraveller}>
            Add another traveller
          </Button>
        </div>

        <div className="space-y-6">
          <PriceBreakdownSummary pricing={pricing} tripTitle={trip.title} />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4" />
                Booking notes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 text-foreground" />
                <p>Dates and pickup points are locked to the live trip inventory in the CRM.</p>
              </div>
              <Separator />
                <p>Profile and theme preferences are carried into the CRM settings for a consistent experience.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
