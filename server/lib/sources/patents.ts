import type { RawSignal } from "../types";

const BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";

function inferOwnerType(assignee: string): "university" | "company" | "unknown" {
  const lower = assignee.toLowerCase();
  const uniTerms = [
    "university", "college", "institute", "institution", "hospital",
    "research foundation", "board of regents", "trustees", "school of",
    "department of health", "national cancer", "national institute",
    "nih ", "cancer center", "medical center",
  ];
  if (uniTerms.some((t) => lower.includes(t))) return "university";
  if (assignee.length > 2) return "company";
  return "unknown";
}

function toTitleCase(str: string): string {
  if (!str) return str;
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function inDateRange(dateStr: string, sinceDate?: string, beforeDate?: string): boolean {
  if (!sinceDate && !beforeDate) return true;
  if (!dateStr) return true;
  const d = dateStr.slice(0, 10);
  if (sinceDate && d < sinceDate) return false;
  if (beforeDate && d >= beforeDate) return false;
  return true;
}

function isLikelyAbbreviation(query: string): boolean {
  const words = query.trim().split(/\s+/);
  return words.length <= 2 && words.every((w) => w.length <= 8);
}

export async function searchPatents(query: string, maxResults = 10, sinceDate?: string, beforeDate?: string): Promise<RawSignal[]> {
  try {
    const builtQuery = `${query.trim()} src:PAT`;
    const useSynonyms = isLikelyAbbreviation(query);

    const pageSize = Math.min(maxResults * 3, 50);
    const params = new URLSearchParams({
      query: builtQuery,
      format: "json",
      resultType: "core",
      pageSize: String(pageSize),
    });
    if (useSynonyms) {
      params.set("synonym", "true");
    }

    const res = await fetch(`${BASE}?${params}`, {
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      console.warn(`[search] Europe PMC patents API error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const results: any[] = data?.resultList?.result ?? [];

    const filtered = results
      .filter((r) => r.title && r.source === "PAT")
      .filter((r) => r.abstractText && r.abstractText.length > 60)
      .filter((r) => inDateRange(r.firstPublicationDate ?? "", sinceDate, beforeDate));

    return filtered.slice(0, maxResults).map((r): RawSignal => {
      const patentId: string = r.id ?? "";
      const assignee: string = r.affiliation ?? "";
      const primaryAssignee = assignee.split(",")[0].trim();

      const url = patentId
        ? `https://europepmc.org/article/PAT/${patentId}`
        : "https://europepmc.org";

      return {
        id: `patent-${patentId || Math.random()}`,
        source_type: "patent",
        title: toTitleCase(r.title ?? "Untitled Patent"),
        text: r.abstractText ?? "",
        authors_or_owner: r.authorString ?? "",
        institution_or_sponsor: toTitleCase(primaryAssignee),
        date: r.firstPublicationDate ?? "",
        stage_hint: "discovery",
        url,
        metadata: {
          patent_id: patentId,
          filing_date: r.firstPublicationDate ?? "",
          owner_type: inferOwnerType(primaryAssignee),
          patent_status: "patented",
        },
      };
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("abort") && !msg.includes("timeout")) {
      console.warn(`[search] Patents error: ${msg}`);
    }
    return [];
  }
}
