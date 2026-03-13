import { XMLParser } from "fast-xml-parser";
import type { RawSignal } from "../types";

const BASE = "https://export.arxiv.org/api/query";

export async function searchArxiv(query: string, maxResults = 12): Promise<RawSignal[]> {
  try {
    const params = new URLSearchParams({
      search_query: `all:${query}`,
      start: "0",
      max_results: String(maxResults),
      sortBy: "relevance",
      sortOrder: "descending",
    });

    const res = await fetch(`${BASE}?${params}`, {
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) throw new Error(`arXiv API error: ${res.status}`);
    const xml = await res.text();

    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(xml);

    const entries = parsed?.feed?.entry;
    if (!entries) return [];
    const entryArray = Array.isArray(entries) ? entries : [entries];

    return entryArray.map((e: any): RawSignal => {
      const authors = Array.isArray(e.author)
        ? e.author.slice(0, 4).map((a: any) => a.name ?? "").filter(Boolean).join(", ")
        : e.author?.name ?? "";

      const arxivId = typeof e.id === "string" ? e.id.split("/abs/").pop()?.split("v")[0] ?? "" : "";
      const published = typeof e.published === "string" ? e.published.slice(0, 10) : "";
      const summary = typeof e.summary === "string" ? e.summary.replace(/\n/g, " ").trim() : "";
      const title = typeof e.title === "string" ? e.title.replace(/\n/g, " ").trim() : "";

      return {
        id: `arxiv-${arxivId || Math.random()}`,
        source_type: "preprint",
        title,
        text: summary,
        authors_or_owner: authors,
        institution_or_sponsor: "",
        date: published,
        stage_hint: "preclinical",
        url: typeof e.id === "string" ? e.id : `https://arxiv.org/abs/${arxivId}`,
        metadata: {
          arxiv_id: arxivId,
          source_label: "arXiv",
        },
      };
    });
  } catch (err) {
    console.error("arXiv search error:", err);
    return [];
  }
}
