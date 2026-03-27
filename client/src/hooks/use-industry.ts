import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/industry/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(profile),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = body.error ?? `HTTP ${res.status}`;
      console.warn("[use-industry] Server sync failed:", msg);
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    console.warn("[use-industry] Server sync failed:", msg);
    return { ok: false, error: msg };
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

// Profile reads throughout the app use getIndustryProfile() (synchronous, localStorage-first).
// DashboardLayout calls useIndustrySyncOnMount() which hydrates localStorage from the server
// before any child page renders (guarded by hydrated===true spinner gate), so all subsequent
// synchronous reads are guaranteed to see up-to-date server data.
export function useIndustrySyncOnMount(): { hydrated: boolean } {
  const { session, role } = useAuth();
  const [hydrated, setHydrated] = useState(false);
  const qc = useQueryClient();

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
          qc.invalidateQueries({ queryKey: ["/api/industry/profile"] });
        } else if (!isServerProfileEmpty(serverProfile) && !isProfileMeaningful(local)) {
          localStorage.setItem("eden-industry-profile", JSON.stringify({
            ...DEFAULT_PROFILE,
            userName: serverProfile.userName ?? "",
            companyName: serverProfile.companyName ?? "",
            companyType: serverProfile.companyType ?? "",
            therapeuticAreas: serverProfile.therapeuticAreas ?? [],
            dealStages: serverProfile.dealStages ?? [],
            modalities: serverProfile.modalities ?? [],
            onboardingDone: serverProfile.onboardingDone ?? false,
          }));
          qc.invalidateQueries({ queryKey: ["/api/industry/profile"] });
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
