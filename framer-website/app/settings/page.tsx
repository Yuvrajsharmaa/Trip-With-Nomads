"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { ArrowLeft, Palette, UserCircle2 } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export type ProfileState = {
  name: string;
  email: string;
  role: string;
  bio: string;
  theme: string;
};

const storageKey = "twn-dashboard-profile";

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
    // Ignore localStorage failures.
  }

  return {
    name: "CRM Admin",
    email: "ops@tripwithnomads.com",
    role: "Operations lead",
    bio: "Coordinates leads, bookings, customer follow-up, and admin workflows.",
    theme: "system",
  };
}

export default function SettingsPage() {
  const { setTheme } = useTheme();
  const [profile, setProfile] = useState<ProfileState>(readProfile());
  const [savedAt, setSavedAt] = useState<string>("");

  useEffect(() => {
    setTheme(profile.theme);
  }, [profile.theme, setTheme]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(profile));
    } catch {
      // Ignore storage errors.
    }
  }, [profile]);

  const initials = useMemo(
    () =>
      profile.name
        .split(" ")
        .map((part) => part.slice(0, 1))
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    [profile.name]
  );

  const handleSave = () => {
    setTheme(profile.theme);
    setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
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
              <p className="text-xs text-muted-foreground">Settings and appearance</p>
            </div>
          </div>

          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">CRM settings</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Update your profile and theme preference for the entire dashboard.
            </p>
          </div>

          <Tabs defaultValue="profile" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="appearance">Appearance</TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserCircle2 className="h-4 w-4" />
                    Profile details
                  </CardTitle>
                  <CardDescription>Visible to the team and used across admin surfaces.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center gap-4 rounded-lg border bg-muted/30 p-4">
                    <Avatar className="h-14 w-14">
                      <AvatarFallback className="text-base">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="space-y-1">
                      <p className="font-medium leading-none">{profile.name}</p>
                      <p className="text-sm text-muted-foreground">{profile.email}</p>
                      <Badge variant="secondary" className="mt-1">
                        {profile.role}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">Name</Label>
                      <Input id="name" value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" value={profile.email} onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Input id="role" value={profile.role} onChange={(event) => setProfile((current) => ({ ...current, role: event.target.value }))} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bio">Bio</Label>
                    <Textarea
                      id="bio"
                      className="min-h-32"
                      value={profile.bio}
                      onChange={(event) => setProfile((current) => ({ ...current, bio: event.target.value }))}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="appearance" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Palette className="h-4 w-4" />
                    Theme preference
                  </CardTitle>
                  <CardDescription>Choose the appearance for the CRM and booking tools.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="theme">Theme</Label>
                    <Select value={profile.theme} onValueChange={(value) => setProfile((current) => ({ ...current, theme: value }))}>
                      <SelectTrigger id="theme">
                        <SelectValue placeholder="Choose theme" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                        <SelectItem value="system">System</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  <div className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">
                    The selected theme is saved locally and applied immediately across the CRM.
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleSave}>Save settings</Button>
            <Button asChild variant="outline">
              <Link href="/">Return to dashboard</Link>
            </Button>
            {savedAt ? <span className="text-sm text-muted-foreground">Saved at {savedAt}</span> : null}
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Live preview</CardTitle>
              <CardDescription>How this profile will appear throughout the CRM.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium leading-none">{profile.name}</p>
                  <p className="text-sm text-muted-foreground">{profile.email}</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="text-sm font-medium">Role</p>
                <p className="text-sm text-muted-foreground">{profile.role}</p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Theme</p>
                <p className="text-sm text-muted-foreground">{profile.theme}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
