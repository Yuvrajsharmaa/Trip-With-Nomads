"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { approveUser, approveWeeklyOff } from "@/lib/actions/crm-core";
import { CRM_ROLES, type CRMRole } from "@/types/roles";
import type { PendingUserApproval, PendingWeeklyOffApproval } from "@/types/crm-core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function normalizeRole(role: CRMRole | null | undefined): CRMRole {
  return role && CRM_ROLES.includes(role) ? role : "sales_agent";
}

export function ApprovalsBoard({
  pendingUsers,
  pendingWeeklyOff,
}: {
  pendingUsers: PendingUserApproval[];
  pendingWeeklyOff: PendingWeeklyOffApproval[];
}) {
  const [isPending, startTransition] = useTransition();
  const [userRoleSelections, setUserRoleSelections] = useState<Record<string, CRMRole>>(() =>
    Object.fromEntries(pendingUsers.map((user) => [user.id, normalizeRole(user.role)]))
  );

  const [weeklyDaySelections, setWeeklyDaySelections] = useState<Record<string, string>>(() =>
    Object.fromEntries(pendingWeeklyOff.map((row) => [row.id, String(row.requested_day_of_week)]))
  );

  const handleApproveUser = (userId: string, status: "active" | "suspended") => {
    startTransition(async () => {
      try {
        await approveUser({
          userId,
          role: userRoleSelections[userId] || "sales_agent",
          status,
        });
        toast.success(`User ${status === "active" ? "approved" : "updated"}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to process user approval");
      }
    });
  };

  const handleWeeklyOff = (requestId: string, status: "approved" | "rejected") => {
    startTransition(async () => {
      try {
        await approveWeeklyOff({
          requestId,
          status,
          approvedDayOfWeek:
            status === "approved" ? Number.parseInt(weeklyDaySelections[requestId] || "0", 10) : null,
        });
        toast.success(`Weekly off ${status}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to process weekly off request");
      }
    });
  };

  return (
    <div className="p-6 md:p-8 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Approvals</h1>
        <p className="text-sm text-muted-foreground mt-1">Pending user onboarding and weekly-off requests.</p>
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-foreground">User Access Requests ({pendingUsers.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending user approvals.</p>
            ) : (
              pendingUsers.map((user) => (
                <div key={user.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{user.full_name || "Unnamed user"}</p>
                    <p className="text-xs text-muted-foreground">{user.email || "No email"}</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Role assignment</Label>
                    <Select
                      value={userRoleSelections[user.id] || "sales_agent"}
                      onValueChange={(value) =>
                        setUserRoleSelections((prev) => ({
                          ...prev,
                          [user.id]: value as CRMRole,
                        }))
                      }
                    >
                      <SelectTrigger className="h-8 border-border bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-border">
                        {CRM_ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {role.replace(/_/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-8 bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={() => handleApproveUser(user.id, "active")}
                      disabled={isPending}
                    >
                      <Check className="size-3.5 mr-1" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-border text-foreground hover:bg-muted"
                      onClick={() => handleApproveUser(user.id, "suspended")}
                      disabled={isPending}
                    >
                      <X className="size-3.5 mr-1" /> Reject
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-foreground">Weekly-Off Requests ({pendingWeeklyOff.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingWeeklyOff.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending weekly-off requests.</p>
            ) : (
              pendingWeeklyOff.map((request) => (
                <div key={request.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{request.user_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Requested day: {DAYS[request.requested_day_of_week]} · Week of {request.requested_week_start}
                    </p>
                  </div>

                  {request.reason && <p className="text-xs text-muted-foreground italic">“{request.reason}”</p>}

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Approved day (if changed)</Label>
                    <Select
                      value={weeklyDaySelections[request.id] || String(request.requested_day_of_week)}
                      onValueChange={(value) =>
                        setWeeklyDaySelections((prev) => ({
                          ...prev,
                          [request.id]: value,
                        }))
                      }
                    >
                      <SelectTrigger className="h-8 border-border bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-border">
                        {DAYS.map((day, index) => (
                          <SelectItem key={day} value={String(index)}>
                            {day}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-8 bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={() => handleWeeklyOff(request.id, "approved")}
                      disabled={isPending}
                    >
                      <Check className="size-3.5 mr-1" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-border text-foreground hover:bg-muted"
                      onClick={() => handleWeeklyOff(request.id, "rejected")}
                      disabled={isPending}
                    >
                      <X className="size-3.5 mr-1" /> Reject
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
