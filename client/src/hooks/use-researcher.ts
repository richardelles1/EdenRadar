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
  photoUrl: string;
  orcidId: string;
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
  photoUrl: "",
  orcidId: "",
};

export function getProfileCompleteness(profile: ResearcherProfile): { percent: number; filled: number; total: number; missing: string[] } {
  const fields: { key: string; label: string; check: () => boolean }[] = [
    { key: "name", label: "Full Name", check: () => !!profile.name.trim() },
    { key: "institution", label: "Institution", check: () => !!profile.institution.trim() },
    { key: "researchAreas", label: "Research Areas", check: () => profile.researchAreas.length > 0 },
    { key: "careerStage", label: "Career Stage", check: () => !!profile.careerStage.trim() },
    { key: "orcidId", label: "ORCID ID", check: () => !!profile.orcidId?.trim() },
    { key: "photoUrl", label: "Profile Photo", check: () => !!profile.photoUrl?.trim() },
    { key: "alertTopics", label: "Alert Topics", check: () => (profile.alertTopics?.length ?? 0) > 0 },
  ];
  const missing = fields.filter(f => !f.check()).map(f => f.label);
  const filled = fields.length - missing.length;
  return { percent: Math.round((filled / fields.length) * 100), filled, total: fields.length, missing };
}

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
