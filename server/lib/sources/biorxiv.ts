import type { RawSignal } from "../types";

const BASE = "https://api.biorxiv.org/details";

async function fetchRecentPreprints(server: "biorxiv" | "medrxiv", cursor = 0): Promise<any[]> {
  const today = new Date();
  const past = new Date();
  past.setDate(today.getDate() - 90);
  const from = past.toISOString().split("T")[0];
  const to = today.toISOString().split("T")[0];
  const url = `${BASE}/${server}/${from}/${to}/${cursor}/json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`${server} API error: ${res.status}`);
  const data = await res.json();
  return data?.collection ?? [];
}

function matchesQuery(text: string, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const haystack = text.toLowerCase();
  return terms.some((t) => haystack.includes(t));
}

function toRawSignal(item: any, server: string): RawSignal {
  return {
    id: `${server}-${item.doi ?? item.rel_doi ?? Math.random()}`,
    source_type: "preprint",
    title: item.title ?? item.rel_title ?? "",
    text: item.abstract ?? item.rel_abs ?? "",
    authors_or_owner: Array.isArray(item.authors)
      ? item.authors.map((a: any) => a.author_name ?? a).join(", ")
      : item.rel_authors ?? "",
    institution_or_sponsor: item.author_corresponding_institution ?? "",
    date: item.date ?? item.rel_date ?? "",
    stage_hint: "preclinical",
    url: item.doi
      ? `https://doi.org/${item.doi}`
      : item.rel_link ?? `https://www.${server}.org`,
    metadata: { doi: item.doi ?? item.rel_doi, category: item.category },
  };
}

export async function searchBiorxiv(query: string, maxResults = 10): Promise<RawSignal[]> {
  try {
    const items = await fetchRecentPreprints("biorxiv", 0);
    const matched = items
      .filter((item) => matchesQuery(`${item.title ?? item.rel_title} ${item.abstract ?? item.rel_abs}`, query))
      .slice(0, maxResults);
    return matched.map((item) => toRawSignal(item, "biorxiv"));
  } catch (err) {
    console.error("bioRxiv search error:", err);
    return [];
  }
}
