export type IndustryProfile = {
  companyName: string;
  companyType: string;
  therapeuticAreas: string[];
  dealStages: string[];
  modalities: string[];
  onboardingDone: boolean;
};

const DEFAULT_PROFILE: IndustryProfile = {
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
