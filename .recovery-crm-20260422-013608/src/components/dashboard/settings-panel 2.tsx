"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck, UserCog, RefreshCw } from "lucide-react";

import { setMyDebugRole } from "@/lib/actions/crm-core";
import { CRM_ROLES, type CRMRole } from "@/types/roles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ThemeCustomizer } from "@/components/dashboard/theme-customizer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface SettingsPanelProps {
  fullName: string;
  email: string;
  currentRole: CRMRole;
  canDebugRoleSwitch: boolean;
}

function formatRole(role: string) {
  return role.replace(/_/g, " ");
}

export function SettingsPanel({
  fullName,
  email,
  currentRole,
  canDebugRoleSwitch,
}: SettingsPanelProps) {
  const router = useRouter();
  const [nextRole, setNextRole] = useState<CRMRole>(currentRole);
  const [isPending, startTransition] = useTransition();

  const roleChanged = useMemo(() => nextRole !== currentRole, [nextRole, currentRole]);

  const handleSwitchRole = () => {
    startTransition(async () => {
      try {
        await setMyDebugRole(nextRole);
        toast.success(`Switched to ${formatRole(nextRole)}`);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to switch role");
      }
    });
  };

  return (
    <div className="p-8 space-y-12 bg-card">
      {/* Profile Section */}
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">Personal Dossier</h2>
          <p className="text-xs text-muted-foreground font-medium">Your account identity and current access level.</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
           <div className="p-4 bg-muted/10 rounded-xl border border-border/50 flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground">Full Name</span>
              <span className="text-sm font-semibold text-foreground">{fullName}</span>
           </div>
           <div className="p-4 bg-muted/10 rounded-xl border border-border/50 flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground">Email Address</span>
              <span className="text-sm font-semibold text-foreground truncate">{email}</span>
           </div>
           <div className="p-4 bg-muted/10 rounded-xl border border-border/50 flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground">Verified Role</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground capitalize">{formatRole(currentRole)}</span>
                <div className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]" />
              </div>
           </div>
        </div>
      </div>

      {canDebugRoleSwitch && (
        <>
          <Separator className="shadow-none border-border/50" />
          <div className="space-y-6">
            <div className="space-y-1">
              <h2 className="text-sm font-bold uppercase tracking-widest text-foreground flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" /> Admin Debug Tools
              </h2>
              <p className="text-xs text-muted-foreground font-medium">Hot-swap roles to verify frontend permissions and UI workflows.</p>
            </div>
            
            <div className="max-w-md space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground ml-0.5">Simulate Lead Access</Label>
                <Select value={nextRole} onValueChange={(value) => setNextRole(value as CRMRole)}>
                  <SelectTrigger className="h-11 rounded-xl border-border bg-background shadow-none focus:ring-1 focus:ring-primary transition-all">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl shadow-2xl bg-card border-border">
                    {CRM_ROLES.map((role) => (
                      <SelectItem key={role} value={role} className="capitalize rounded-xl py-2.5 font-semibold">
                        {formatRole(role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center gap-2 pt-2">
                <Button 
                  onClick={handleSwitchRole} 
                  disabled={!roleChanged || isPending}
                  className="h-11 px-8 bg-primary text-primary-foreground hover:bg-primary/90 font-bold uppercase text-[10px] tracking-widest rounded-xl shadow-lg transition-all"
                >
                  {isPending ? "Switching..." : "Apply Role Switch"}
                </Button>
                <Button 
                  variant="outline" 
                   onClick={() => router.refresh()}
                  className="h-11 rounded-xl border-border text-muted-foreground hover:text-foreground font-bold text-[10px] uppercase tracking-widest"
                >
                  <RefreshCw className={cn("size-3.5 mr-2", isPending && "animate-spin")} />
                  Refresh
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Branding Section */}
      <Separator className="shadow-none border-border/50" />
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">Branding & Presets</h2>
          <p className="text-xs text-muted-foreground font-medium">Customize the visual workspace and primary brand colors.</p>
        </div>
        
        <div className="max-w-md">
           <ThemeCustomizer />
        </div>
      </div>
    </div>
  );
}
