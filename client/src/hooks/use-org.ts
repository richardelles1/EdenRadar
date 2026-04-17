import { useQuery } from "@tanstack/react-query";
import type { Organization, OrgMember } from "@shared/schema";

export interface OrgContext extends Organization {
  members: OrgMember[];
  seatCount: number;
}

export function useOrg() {
  return useQuery<OrgContext | null>({
    queryKey: ["/api/industry/org"],
    staleTime: 5 * 60 * 1000,
    select: (data) => {
      if (!data) return null;
      return { ...data, seatCount: data.members?.length ?? 0 };
    },
  });
}

export function planTierLabel(tier: string): string {
  if (tier === "individual") return "Individual Plan";
  if (tier === "enterprise") return "Enterprise Plan";
  return "Team Plan";
}

export function billingMethodLabel(method: string): string {
  if (method === "ach") return "Billed via ACH";
  if (method === "invoice") return "Billed via Invoice";
  return "Billed via Stripe";
}
