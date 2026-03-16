import { useAuth } from "@/hooks/use-auth";

export type ResearcherProfile = {
  name: string;
  institution: string;
  lab: string;
  researchAreas: string[];
  careerStage: string;
  institutionType: string;
  alertTopics: string[];
  secondaryInterests: string[];
};

const DEFAULT_PROFILE: ResearcherProfile = {
  name: "",
  institution: "",
  lab: "",
  researchAreas: [],
  careerStage: "",
  institutionType: "",
  alertTopics: [],
  secondaryInterests: [],
};

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

export function getResearcherProfile(): ResearcherProfile {
  try {
    const raw = localStorage.getItem("eden-researcher-profile");
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_PROFILE, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_PROFILE };
}

export function saveResearcherProfile(profile: Partial<ResearcherProfile>) {
  const existing = getResearcherProfile();
  const merged = { ...existing, ...profile };
  localStorage.setItem("eden-researcher-profile", JSON.stringify(merged));
}
