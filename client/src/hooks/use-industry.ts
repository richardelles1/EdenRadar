import { useEffect, useState } from "react";
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

let _currentAccessToken: string | null = null;

export function setCurrentAccessToken(token: string | null) {
  _currentAccessToken = token;
}

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

export function saveIndustryProfile(profile: Partial<IndustryProfile>) {
  const existing = getIndustryProfile();
  const merged = { ...existing, ...profile };
  localStorage.setItem("eden-industry-profile", JSON.stringify(merged));
  if (_currentAccessToken) {
    syncIndustryProfileToServer(merged, _currentAccessToken);
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

function isProfileMeaningful(p: IndustryProfile): boolean {
  return (
    !!p.companyName ||
    p.therapeuticAreas.length > 0 ||
    p.modalities.length > 0 ||
    p.dealStages.length > 0 ||
    p.onboardingDone
  );
}

function isServerProfileEmpty(p: { companyName?: string; therapeuticAreas?: string[]; onboardingDone?: boolean }): boolean {
  return !p.companyName && (!p.therapeuticAreas || p.therapeuticAreas.length === 0) && !p.onboardingDone;
}

export function useIndustrySyncOnMount(): { hydrated: boolean } {
  const { session, role } = useAuth();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCurrentAccessToken(session?.access_token ?? null);

    if (!session?.access_token || role !== "industry") {
      setHydrated(true);
      return;
    }

    async function hydrate() {
      try {
        const res = await fetch("/api/industry/profile", {
          headers: { Authorization: `Bearer ${session!.access_token}` },
        });
        if (!res.ok) {
          setHydrated(true);
          return;
        }
        const { profile: serverProfile } = await res.json();
        const local = getIndustryProfile();

        if (isServerProfileEmpty(serverProfile) && isProfileMeaningful(local)) {
          await syncIndustryProfileToServer(local, session!.access_token);
        } else if (!isServerProfileEmpty(serverProfile) && !isProfileMeaningful(local)) {
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
      } finally {
        setHydrated(true);
      }
    }

    hydrate();
  }, [session?.access_token, role]);

  return { hydrated };
}
