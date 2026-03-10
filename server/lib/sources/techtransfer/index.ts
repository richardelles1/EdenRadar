import type { RawSignal } from "../../types";
import { getStanfordListings } from "./stanford";
import { getMitListings } from "./mit";
import { getOxfordListings } from "./oxford";

export interface TechTransferAdapter {
  institution: string;
  getListings(): RawSignal[];
}

const adapters: TechTransferAdapter[] = [
  { institution: "Stanford University", getListings: getStanfordListings },
  { institution: "MIT", getListings: getMitListings },
  { institution: "University of Oxford", getListings: getOxfordListings },
];

function matchesQuery(signal: RawSignal, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const haystack = `${signal.title} ${signal.text}`.toLowerCase();
  return terms.some((t) => haystack.includes(t));
}

export async function searchTechTransfer(query: string, maxResults = 10): Promise<RawSignal[]> {
  const allListings = adapters.flatMap((a) => a.getListings());
  const matched = allListings.filter((s) => matchesQuery(s, query));

  if (matched.length === 0) {
    return allListings.slice(0, Math.min(5, maxResults));
  }

  return matched.slice(0, maxResults);
}
