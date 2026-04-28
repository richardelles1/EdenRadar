import type { RawSignal } from "../types";

const BASE = "https://search.patentsview.org/api/v1/patent/";

function inferOwnerType(assignee: string): "university" | "company" | "unknown" {
  const lower = assignee.toLowerCase();
  const uniTerms = [
    "university", "college", "institute", "institution", "hospital",
    "research foundation", "board of regents", "trustees",
  ];
  if (uniTerms.some((t) => lower.includes(t))) return "university";
  if (assignee.length > 2) return "company";
  return "unknown";
}

export async function searchPatents(query: string, maxResults = 8, sinceDate?: string, beforeDate?: string): Promise<RawSignal[]> {
  try {
    const terms = query
      .split(/\s+/)
      .filter((t) => t.length > 3)
      .slice(0, 5);

    const orClauses = terms.map((t) => ({
      _text_phrase: { patent_abstract: t },
    }));

    const dateFilters: object[] = [];
    if (sinceDate) {
      dateFilters.push({ _gte: { patent_date: sinceDate } });
    }
    if (beforeDate) {
      dateFilters.push({ _lt: { patent_date: beforeDate } });
    }

    const q = dateFilters.length > 0
      ? { _and: [{ _or: orClauses }, ...dateFilters] }
      : { _or: orClauses };

    const requestBody = {
      q,
      f: [
        "patent_id",
        "patent_title",
        "patent_abstract",
        "patent_date",
        "app_date",
        "assignees.assignee_organization",
        "assignees.assignee_individual_name_last",
      ],
      o: { per_page: maxResults, sort: [{ patent_date: "desc" }] },
    };

    const res = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      if (res.status !== 403) {
        console.warn(`[search] PatentsView API error: ${res.status}`);
      }
      return [];
    }

    const data = await res.json();
    const patents = data?.patents ?? [];

    return patents.map((p: any): RawSignal => {
      const assignees: any[] = p?.assignees ?? [];
      const assigneeNames = assignees
        .map((a: any) => a.assignee_organization || a.assignee_individual_name_last || "")
        .filter(Boolean)
        .join(", ");
      const primaryAssignee = assignees[0]?.assignee_organization ?? "";

      return {
        id: `patent-${p.patent_id}`,
        source_type: "patent",
        title: p.patent_title ?? "Untitled Patent",
        text: p.patent_abstract ?? "",
        authors_or_owner: assigneeNames,
        institution_or_sponsor: primaryAssignee,
        date: p.patent_date ?? p.app_date ?? "",
        stage_hint: "discovery",
        url: p.patent_id
          ? `https://patents.google.com/patent/US${p.patent_id}`
          : "https://patentsview.org",
        metadata: {
          patent_id: p.patent_id,
          filing_date: p.app_date,
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
