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

function inDateRange(dateStr: string, sinceDate?: string, beforeDate?: string): boolean {
  if (!sinceDate && !beforeDate) return true;
  if (!dateStr) return true;
  const d = dateStr.slice(0, 10);
  if (sinceDate && d < sinceDate) return false;
  if (beforeDate && d >= beforeDate) return false;
  return true;
}

function buildPatentQuery(rawQuery: string, sinceDate?: string, beforeDate?: string): string {
  const tokens = rawQuery.trim().split(/\s+/);

  const expandedTokens = tokens
    .filter((t) => t.length >= 2)
    .map((t) => {
      if (t.includes("-")) {
        const upper = t.toUpperCase();
        const spaced = `"${t.replace(/-/g, " ")}"`;
        return `(${upper} OR ${spaced})`;
      }
      return t;
    });

  let query = expandedTokens.join(" AND ");
  if (!query) query = rawQuery.trim();

  query += " src:PAT";

  if (sinceDate || beforeDate) {
    const from = sinceDate ?? "1900-01-01";
    const to = beforeDate ? beforeDate.slice(0, 10) : "3000-01-01";
    query += ` FIRST_PDATE:[${from} TO ${to}]`;
  }

  return query;
}

export async function searchPatents(
  query: string,
  maxResults = 10,
  sinceDate?: string,
  beforeDate?: string
): Promise<RawSignal[]> {
  try {
    const builtQuery = buildPatentQuery(query, sinceDate, beforeDate);
    const tokens = query.trim().split(/\s+/);
    const isShortQuery = tokens.length <= 2 && tokens.every((w) => w.length <= 8);
    const pageSize = Math.min(maxResults * 3, 50);

    const params = new URLSearchParams({
      query: builtQuery,
      format: "json",
      resultType: "core",
      pageSize: String(pageSize),
    });
    if (isShortQuery) {
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
      const patentId: string = r.id ?? r.pmid ?? r.accession ?? "";
      const assignee: string = r.affiliation ?? "";
      const primaryAssignee = assignee.split(",")[0].trim();

      const url = patentId
        ? `https://europepmc.org/article/PAT/${patentId}`
        : "https://europepmc.org";

      const stableId = patentId
        ? `patent-${patentId}`
        : `patent-${Buffer.from(r.title ?? "").toString("base64").slice(0, 16)}`;

      return {
        id: stableId,
        source_type: "patent",
        title: r.title ?? "Untitled Patent",
        text: r.abstractText ?? "",
        authors_or_owner: r.authorString ?? "",
        institution_or_sponsor: primaryAssignee,
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
