export type PortalRole = "industry" | "researcher" | "concept";

export interface PortalConfig {
  role: PortalRole;
  label: string;
  tier: number;
  color: string;
  badgeClass: string;
  description: string;
  registerPath: string;
}

export const PORTAL_CONFIG: Record<PortalRole, PortalConfig> = {
  concept: {
    role: "concept",
    label: "Eden Discovery",
    tier: 1,
    color: "amber",
    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    description: "Concept registry for early-stage ideas seeking feedback and collaborators",
    registerPath: "/register?portal=concept",
  },
  researcher: {
    role: "researcher",
    label: "EdenLab",
    tier: 2,
    color: "violet",
    badgeClass: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
    description: "Researcher workspace with structured projects, data tools, and grant tracking",
    registerPath: "/register?portal=researcher",
  },
  industry: {
    role: "industry",
    label: "EdenRadar",
    tier: 3,
    color: "green",
    badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    description: "Industry intelligence platform for biotech asset scouting and deal flow",
    registerPath: "/register?portal=industry",
  },
};

export const ALL_PORTAL_ROLES: PortalRole[] = ["concept", "researcher", "industry"];

export function getPortalConfig(role: string | undefined | null): PortalConfig | null {
  if (!role) return null;
  return PORTAL_CONFIG[role as PortalRole] ?? null;
}
