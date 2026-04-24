import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth/request-context";
import { SettingsPanel } from "@/components/dashboard/settings-panel";
import type { CRMRole } from "@/types/roles";

const DEBUG_ROLE_ALLOWED_EMAILS = new Set(["yuvrajsharma6367@gmail.com"]);

export default async function SettingsPage() {
  const { user, profile } = await getRequestContext();
  if (!user) redirect("/login");

  if (!profile) redirect("/onboarding");
  if (profile.status === "pending") redirect("/pending-approval");
  if (profile.status === "suspended") redirect("/suspended");

  const currentRole = (profile.role || "sales_agent") as CRMRole;
  const userEmail = (user.email || profile.email || "").toLowerCase();
  const canDebugRoleSwitch = currentRole === "admin" || DEBUG_ROLE_ALLOWED_EMAILS.has(userEmail);

  return (
    <SettingsPanel
      fullName={profile.full_name || "User"}
      email={userEmail || "—"}
      currentRole={currentRole as CRMRole}
      canDebugRoleSwitch={canDebugRoleSwitch}
    />
  );
}
