import { redirect } from "next/navigation";

export default function LogsPage() {
  redirect("/dashboard/team?tab=activity");
}
