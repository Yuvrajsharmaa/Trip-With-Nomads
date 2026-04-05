"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowUpRight,
  CalendarDays,
  CreditCard,
  Filter,
  Menu,
  PackageCheck,
  Settings2,
  Users,
} from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { SettingsDialog, type ProfileState } from "@/components/settings-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TRIPS } from "@/lib/booking-utils";
import { cn } from "@/lib/utils";

const storageKey = "twn-dashboard-profile";

const bookingsData = [
  { month: "Jan", leads: 24, bookings: 11, revenue: 15600 },
  { month: "Feb", leads: 28, bookings: 14, revenue: 18900 },
  { month: "Mar", leads: 32, bookings: 19, revenue: 24100 },
  { month: "Apr", leads: 39, bookings: 22, revenue: 29800 },
  { month: "May", leads: 48, bookings: 28, revenue: 36400 },
  { month: "Jun", leads: 52, bookings: 31, revenue: 41200 },
];

const sourceData = [
  { source: "Instagram", value: 38 },
  { source: "WhatsApp", value: 29 },
  { source: "Website", value: 21 },
  { source: "Referral", value: 12 },
];

const recentBookings = [
  { name: "Aanya Mehta", trip: "Kashmir", status: "Confirmed", amount: "$499" },
  { name: "Rohan Verma", trip: "Spiti", status: "Pending", amount: "$599" },
  { name: "Kriti Shah", trip: "Thailand", status: "Confirmed", amount: "$799" },
  { name: "Dev Patel", trip: "Kashmir", status: "On hold", amount: "$499" },
];

const leadsPipeline = [
  { label: "New", value: 42, progress: 86 },
  { label: "Qualified", value: 27, progress: 64 },
  { label: "Proposal", value: 18, progress: 46 },
  { label: "Won", value: 13, progress: 28 },
];

function readProfile(): ProfileState {
  if (typeof window === "undefined") {
    return {
      name: "CRM Admin",
      email: "ops@tripwithnomads.com",
      role: "Operations lead",
      bio: "Coordinates leads, bookings, customer follow-up, and admin workflows.",
      theme: "system",
    };
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      return JSON.parse(raw) as ProfileState;
    }
  } catch {
    // Ignore malformed local storage and fall back to defaults.
  }

  return {
    name: "CRM Admin",
    email: "ops@tripwithnomads.com",
    role: "Operations lead",
    bio: "Coordinates leads, bookings, customer follow-up, and admin workflows.",
    theme: "system",
  };
}

function NavLink({ active, children }: { active?: boolean; children: React.ReactNode }) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
      type="button"
    >
      {children}
    </button>
  );
}

function MetricCard({
  title,
  value,
  delta,
  icon,
}: {
  title: string;
  value: string;
  delta: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardDescription>{title}</CardDescription>
          <CardTitle className="text-2xl">{value}</CardTitle>
        </div>
        <div className="rounded-md border bg-muted p-2 text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowUpRight className="h-4 w-4 text-emerald-500" />
          {delta}
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardShell() {
  const [mounted, setMounted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileState>(readProfile());

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(profile));
    } catch {
      // Ignore storage write failures.
    }
  }, [profile]);

  const totalRevenue = useMemo(() => bookingsData.reduce((sum, item) => sum + item.revenue, 0), []);
  const totalBookings = useMemo(() => bookingsData.reduce((sum, item) => sum + item.bookings, 0), []);
  const totalLeads = useMemo(() => bookingsData.reduce((sum, item) => sum + item.leads, 0), []);

  return (
    <div className="min-h-screen bg-muted/30">
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        profile={profile}
        onSave={(nextProfile) => setProfile(nextProfile)}
      />

      <div className="mx-auto grid min-h-screen max-w-[1600px] gap-6 p-4 lg:grid-cols-[280px_1fr] lg:p-6">
        <aside className="hidden lg:flex lg:flex-col">
          <Card className="sticky top-6 flex h-[calc(100vh-3rem)] flex-col overflow-hidden">
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <PackageCheck className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">Nomads CRM</CardTitle>
                  <CardDescription>Leads, bookings, customers</CardDescription>
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <NavLink active>
                  <CalendarDays className="h-4 w-4" />
                  Dashboard
                </NavLink>
                <NavLink>
                  <Users className="h-4 w-4" />
                  Customers
                </NavLink>
                <NavLink>
                  <CreditCard className="h-4 w-4" />
                  Bookings
                </NavLink>
              </div>
            </CardHeader>

            <CardContent className="flex-1 space-y-4">
              <Card className="border-dashed">
                <CardHeader className="pb-3">
                  <CardDescription>Admin profile</CardDescription>
                  <CardTitle className="text-base">{profile.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-3">
                  <Avatar className="h-11 w-11">
                    <AvatarFallback>
                      {profile.name
                        .split(" ")
                        .map((part) => part.slice(0, 1))
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">{profile.role}</p>
                    <p className="text-xs text-muted-foreground">{profile.email}</p>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-2 rounded-lg border p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Profile completion</span>
                  <span className="font-medium">82%</span>
                </div>
                <Progress value={82} />
              </div>
            </CardContent>
          </Card>
        </aside>

        <main className="space-y-6">
          <header className="flex flex-col gap-4 rounded-xl border bg-background/80 p-4 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="lg:hidden">
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[320px]">
                  <SheetHeader>
                    <SheetTitle>Nomads CRM</SheetTitle>
                  </SheetHeader>
                  <div className="mt-6 space-y-2">
                    <NavLink active>
                      <CalendarDays className="h-4 w-4" />
                      Dashboard
                    </NavLink>
                    <NavLink>
                      <Users className="h-4 w-4" />
                      Leads
                    </NavLink>
                    <NavLink>
                      <CreditCard className="h-4 w-4" />
                      Bookings
                    </NavLink>
                  </div>
                </SheetContent>
              </Sheet>

              <div>
                <h1 className="text-2xl font-semibold tracking-tight">CRM dashboard</h1>
                <p className="text-sm text-muted-foreground">Control leads, bookings, customers, profile, and theme from one place.</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative hidden sm:block">
                <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="w-[260px] pl-9" placeholder="Search leads, bookings, customers..." />
              </div>
              <ThemeToggle />
              <Button variant="outline" onClick={() => setSettingsOpen(true)}>
                <Settings2 className="h-4 w-4" />
                Settings
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-10 gap-3 px-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        {profile.name
                          .split(" ")
                          .map((part) => part.slice(0, 1))
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden text-left md:block">
                      <p className="text-sm font-medium leading-none">{profile.name}</p>
                      <p className="text-xs text-muted-foreground">{profile.role}</p>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{profile.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setSettingsOpen(true)}>Profile settings</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSettingsOpen(true)}>Appearance</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4 lg:w-[520px]">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="bookings">Bookings</TabsTrigger>
              <TabsTrigger value="leads">Customers</TabsTrigger>
              <TabsTrigger value="operations">Operations</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard title="Revenue" value={`$${totalRevenue.toLocaleString()}`} delta="+18.4% from last period" icon={<CreditCard className="h-4 w-4" />} />
                <MetricCard title="Bookings" value={totalBookings.toString()} delta="+11 confirmed this week" icon={<PackageCheck className="h-4 w-4" />} />
                <MetricCard title="Leads" value={totalLeads.toString()} delta="+24 captured this month" icon={<Users className="h-4 w-4" />} />
                <MetricCard title="Trips live" value={Object.keys(TRIPS).length.toString()} delta="3 featured itineraries" icon={<CalendarDays className="h-4 w-4" />} />
              </div>

              <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
                <Card>
                  <CardHeader>
                    <CardTitle>Lead and booking trend</CardTitle>
                    <CardDescription>Monthly pipeline movement and conversions.</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[320px]">
                    {mounted && (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={bookingsData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="month" tickLine={false} axisLine={false} className="text-xs fill-muted-foreground" />
                          <YAxis tickLine={false} axisLine={false} className="text-xs fill-muted-foreground" />
                          <Tooltip
                            contentStyle={{
                              background: "hsl(var(--background))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: 12,
                            }}
                          />
                          <Line type="monotone" dataKey="leads" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="bookings" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Lead sources</CardTitle>
                    <CardDescription>Where the incoming pipeline is coming from.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {sourceData.map((item) => (
                      <div key={item.source} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{item.source}</span>
                          <span className="text-muted-foreground">{item.value}%</span>
                        </div>
                        <Progress value={item.value} />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="bookings" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Recent bookings</CardTitle>
                  <CardDescription>Live reservation activity pulled into the CRM.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Guest</TableHead>
                        <TableHead>Trip</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentBookings.map((booking) => (
                        <TableRow key={`${booking.name}-${booking.trip}`}>
                          <TableCell className="font-medium">{booking.name}</TableCell>
                          <TableCell>{booking.trip}</TableCell>
                          <TableCell>
                            <Badge variant={booking.status === "Confirmed" ? "default" : "secondary"}>{booking.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{booking.amount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="leads" className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {leadsPipeline.map((item) => (
                  <Card key={item.label}>
                    <CardHeader className="pb-3">
                      <CardDescription>{item.label}</CardDescription>
                      <CardTitle className="text-2xl">{item.value}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Progress value={item.progress} />
                      <p className="text-xs text-muted-foreground">{item.progress}% of the current target</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="operations" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Upcoming departures</CardTitle>
                  <CardDescription>Trips planned for the next release window.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                  {Object.values(TRIPS).map((trip) => (
                    <Card key={trip.id} className="border-dashed">
                      <CardHeader className="pb-3">
                        <CardDescription>{trip.dates}</CardDescription>
                        <CardTitle className="text-base">{trip.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Capacity</span>
                          <span className="font-medium">24 seats</span>
                        </div>
                        <Progress value={trip.id === "kashmir" ? 72 : trip.id === "spiti" ? 54 : 68} />
                      </CardContent>
                    </Card>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}
