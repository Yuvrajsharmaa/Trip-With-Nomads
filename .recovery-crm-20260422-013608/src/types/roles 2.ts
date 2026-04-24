export const CRM_ROLES = [
  "admin",
  "operations_manager",
  "sales_manager",
  "sales_agent",
  "finance_manager",
  "finance_agent",
] as const;

export type CRMRole = (typeof CRM_ROLES)[number];

export const MANAGER_ROLES: CRMRole[] = [
  "admin",
  "operations_manager",
  "sales_manager",
  "finance_manager",
];

export function isManagerRole(role: string | null | undefined): role is CRMRole {
  if (!role) return false;
  return MANAGER_ROLES.includes(role as CRMRole);
}
