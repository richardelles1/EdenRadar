import { useMemo } from "react";

function getOrCreateResearcherId(): string {
  let id = localStorage.getItem("eden-researcher-id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("eden-researcher-id", id);
  }
  return id;
}

export function useResearcherId(): string {
  return useMemo(() => getOrCreateResearcherId(), []);
}

export function getResearcherHeaders(): HeadersInit {
  return { "x-researcher-id": getOrCreateResearcherId() };
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
