import { useAuth } from "@/hooks/use-auth";

export function useResearcherId(): string {
  const { user } = useAuth();
  return user?.id ?? "";
}

export function useResearcherHeaders(): Record<string, string> {
  const { user, session } = useAuth();
  const headers: Record<string, string> = {
    "x-researcher-id": user?.id ?? "",
  };
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  return headers;
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
