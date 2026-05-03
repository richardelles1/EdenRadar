import type { RawSignal } from "../types";

const OPENALEX_BASE = "https://api.openalex.org/works";

function toRawSignal(work: any): RawSignal {
  const doi = work.doi?.replace("https://doi.org/", "") ?? "";
  const url = work.doi ?? work.id ?? "https://openalex.org";
  const authors = (work.authorships ?? [])
    .slice(0, 4)
    .map((a: any) => a.author?.display_name ?? "")
    .filter(Boolean)
    .join(", ");
  const institution = (work.authorships ?? [])[0]?.institutions?.[0]?.display_name ?? "";
  const pubDate: string = work.publication_date ?? work.publication_year?.toString() ?? "";
  const abstractText = work.abstract ?? invertedAbstractToText(work.abstract_inverted_index) ?? "";
  const journal = work.primary_location?.source?.display_name ?? "";

  return {
    id: `openalex-${work.id?.split("/").pop() ?? Math.random()}`,
    source_type: "paper",
    title: work.title ?? "Untitled",
    text: (abstractText || work.title) ?? "",
    authors_or_owner: authors,
    institution_or_sponsor: institution,
    date: pubDate,
    stage_hint: "unknown",
    url,
    metadata: {
      doi,
      journal,
      cited_by_count: work.cited_by_count ?? 0,
      open_access: work.open_access?.is_oa ?? false,
      source_label: "OpenAlex",
    },
  };
}

function invertedAbstractToText(invertedIndex: Record<string, number[]> | null | undefined): string {
  if (!invertedIndex) return "";
  const wordPositions: Array<[string, number]> = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      wordPositions.push([word, pos]);
    }
  }
  wordPositions.sort((a, b) => a[1] - b[1]);
  return wordPositions.map(([w]) => w).join(" ");
}

export async function searchOpenAlex(query: string, maxResults = 12): Promise<RawSignal[]> {
  try {
    const currentYear = new Date().getFullYear();
    const fromYear = currentYear - 3;
    const params = new URLSearchParams({
      search: query,
      filter: `type:article,publication_year:${fromYear}-${currentYear}`,
      sort: "relevance_score:desc",
      "per-page": String(maxResults),
      select: [
        "id",
        "doi",
        "title",
        "abstract_inverted_index",
        "authorships",
        "publication_date",
        "publication_year",
        "primary_location",
        "cited_by_count",
        "open_access",
      ].join(","),
    });

    const url = `${OPENALEX_BASE}?${params}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "HelixRadar/2.0 (mailto:info@helixradar.io)" },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) throw new Error(`OpenAlex API error: ${res.status}`);
    const data = await res.json();
    const results: any[] = data?.results ?? [];
    return results.filter((r) => r.title).map(toRawSignal);
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
}
