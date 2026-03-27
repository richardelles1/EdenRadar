import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";

export type IndustryProfile = {
  userName: string;
  companyName: string;
  companyType: string;
  therapeuticAreas: string[];
  dealStages: string[];
  modalities: string[];
  onboardingDone: boolean;
};

const DEFAULT_PROFILE: IndustryProfile = {
  userName: "",
  companyName: "",
  companyType: "",
  therapeuticAreas: [],
  dealStages: [],
  modalities: [],
  onboardingDone: false,
};

export function getIndustryProfile(): IndustryProfile {
  try {
    const raw = localStorage.getItem("eden-industry-profile");
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_PROFILE, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_PROFILE };
}

export function saveIndustryProfile(profile: Partial<IndustryProfile>) {
  const existing = getIndustryProfile();
  const merged = { ...existing, ...profile };
  localStorage.setItem("eden-industry-profile", JSON.stringify(merged));
}

export async function syncIndustryProfileToServer(
  profile: IndustryProfile,
  accessToken: string
): Promise<void> {
  try {
    await fetch("/api/industry/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(profile),
    });
  } catch (err) {
    console.warn("[use-industry] Failed to sync profile to server:", err);
  }
}

export function useIndustryHeaders(): Record<string, string> {
  const { session } = useAuth();
  const headers: Record<string, string> = {};
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  return headers;
}

export function useIndustrySyncOnMount() {
  const { session, role } = useAuth();

  useEffect(() => {
    if (!session?.access_token || role !== "industry") return;

    async function hydrate() {
      try {
        const res = await fetch("/api/industry/profile", {
          headers: { Authorization: `Bearer ${session!.access_token}` },
        });
        if (!res.ok) return;
        const { profile: serverProfile } = await res.json();
        if (!serverProfile) {
          const local = getIndustryProfile();
          if (local.onboardingDone || local.companyName) {
            await syncIndustryProfileToServer(local, session!.access_token);
          }
          return;
        }
        const local = getIndustryProfile();
        const serverUpdated = new Date(serverProfile.updatedAt).getTime();
        const localHasData = local.onboardingDone || !!local.companyName;
        if (!localHasData || serverUpdated > Date.now() - 5000) {
          saveIndustryProfile({
            userName: serverProfile.userName ?? "",
            companyName: serverProfile.companyName ?? "",
            companyType: serverProfile.companyType ?? "",
            therapeuticAreas: serverProfile.therapeuticAreas ?? [],
            dealStages: serverProfile.dealStages ?? [],
            modalities: serverProfile.modalities ?? [],
            onboardingDone: serverProfile.onboardingDone ?? false,
          });
        }
      } catch (err) {
        console.warn("[use-industry] Hydration failed:", err);
      }
    }

    hydrate();
  }, [session?.access_token, role]);
}
