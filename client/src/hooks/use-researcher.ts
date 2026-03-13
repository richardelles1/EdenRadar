import { useAuth } from "@/hooks/use-auth";

function getSupabaseUserId(): string {
  const keys = Object.keys(localStorage);
  const sbKey = keys.find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
  if (!sbKey) return "";
  try {
    const parsed = JSON.parse(localStorage.getItem(sbKey) || "");
    return parsed?.user?.id ?? "";
  } catch {
    return "";
  }
}

export function useResearcherId(): string {
  const { user } = useAuth();
  return user?.id ?? "";
}

export function getResearcherHeaders(): HeadersInit {
  return { "x-researcher-id": getSupabaseUserId() };
}

export function useResearcherHeaders(): HeadersInit {
  const { user } = useAuth();
  return { "x-researcher-id": user?.id ?? "" };
}

export function getResearcherProfile() {
  try {
    const raw = localStorage.getItem("eden-researcher-profile");
    if (raw) return JSON.parse(raw) as { name: string; institution: string; lab: string; researchAreas: string[] };
  } catch {}
  return { name: "", institution: "", lab: "", researchAreas: [] as string[] };
}

export function saveResearcherProfile(profile: { name: string; institution: string; lab: string; researchAreas: string[] }) {
  localStorage.setItem("eden-researcher-profile", JSON.stringify(profile));
}
