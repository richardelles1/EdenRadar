import { useEffect } from "react";
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
  onboardingDone?: boolean;
  /** Stored locally only — identifies which account this profile belongs to. Stripped before server sync. */
  _userId?: string | null;
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
  onboardingDone: false,
};

let _currentResearcherUserId: string | null = null;

export function setCurrentResearcherUserId(id: string | null) {
  _currentResearcherUserId = id;
}

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
  const merged = { ...existing, ...profile, _userId: _currentResearcherUserId ?? existing._userId ?? null };
  localStorage.setItem("eden-researcher-profile", JSON.stringify(merged));
}

/**
 * Returns a copy of the profile with the local-only `_userId` field removed,
 * safe to send as a server payload. Use this whenever syncing the researcher
 * profile to any API endpoint.
 */
export function toServerResearcherProfile(profile: ResearcherProfile): Omit<ResearcherProfile, "_userId"> {
  const { _userId: _discarded, ...serverPayload } = profile;
  return serverPayload;
}

/**
 * Keeps the module-level user ID in sync with the authenticated session.
 * Call this hook once near the top of the researcher layout.
 * If future server-sync logic is added to this hook, the same-user guard
 * (compare local._userId vs currentUserId before pushing) should be applied
 * here, mirroring the pattern in use-industry.ts.
 */
export function useResearcherInit() {
  const { session } = useAuth();

  useEffect(() => {
    const userId = session?.user?.id ?? null;
    setCurrentResearcherUserId(userId);

    // Same-user guard: if the stored profile was stamped with a different
    // account's ID, clear it so stale data cannot leak into this session.
    if (userId) {
      const local = getResearcherProfile();
      if (local._userId && local._userId !== userId) {
        console.warn("[use-researcher] Local profile belongs to a different account — discarding.");
        localStorage.removeItem("eden-researcher-profile");
      } else if (!local._userId) {
        // Stamp the current user onto an un-stamped profile.
        saveResearcherProfile({});
      }
    }
  }, [session?.user?.id]);
}
