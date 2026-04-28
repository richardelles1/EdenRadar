import type { RawSignal } from "../types";

const BASE = "https://api.uspto.gov/api/v1/patent/applications/search";

function getApiKey(): string | undefined {
  return process.env.USPTO_ODP_API_KEY;
}

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

function buildSearchQuery(rawQuery: string): string {
  const trimmed = rawQuery.trim();
  if (!trimmed) return "*";

  const tokens = trimmed.split(/\s+/);
  const isSingleShortToken = tokens.length === 1 && trimmed.length <= 8;

  if (isSingleShortToken && trimmed.includes("-")) {
    const upper = trimmed.toUpperCase();
    const spaced = trimmed.replace(/-/g, " ");
    return `"${upper}" OR "${spaced}"`;
  }

  if (tokens.length <= 3) {
    return `"${trimmed}"`;
  }

  return trimmed;
}

export async function searchPatents(
  query: string,
  maxResults = 10,
  sinceDate?: string,
  beforeDate?: string
): Promise<RawSignal[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[search] USPTO_ODP_API_KEY not set — patent search disabled");
    return [];
  }

  try {
    const q = buildSearchQuery(query);
    const limit = Math.min(maxResults * 2, 50);

    let fullQuery = q;
    if (sinceDate && beforeDate) {
      fullQuery += ` AND applicationMetaData.filingDate:[${sinceDate.slice(0, 10)} TO ${beforeDate.slice(0, 10)}]`;
    } else if (sinceDate) {
      fullQuery += ` AND applicationMetaData.filingDate:[${sinceDate.slice(0, 10)} TO *]`;
    } else if (beforeDate) {
      fullQuery += ` AND applicationMetaData.filingDate:[* TO ${beforeDate.slice(0, 10)}]`;
    }

    const body: Record<string, unknown> = {
      q: fullQuery,
      filters: [
        {
          name: "applicationMetaData.applicationTypeLabelName",
          value: ["Utility"],
        },
      ],
      sort: [{ field: "applicationMetaData.filingDate", order: "desc" }],
      fields: [
        "applicationNumberText",
        "applicationMetaData.inventionTitle",
        "applicationMetaData.filingDate",
        "applicationMetaData.grantDate",
        "applicationMetaData.applicationStatusDescriptionText",
        "applicationMetaData.inventorBag",
        "assignmentBag",
      ],
      pagination: { offset: 0, limit },
    };

    const res = await fetch(BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[search] USPTO ODP patents error ${res.status}: ${text.slice(0, 120)}`);
      return [];
    }

    const data = await res.json();
    const results: any[] = data?.patentFileWrapperDataBag ?? [];

    return results.slice(0, maxResults).map((r): RawSignal => {
      const meta = r.applicationMetaData ?? {};
      const appNum: string = r.applicationNumberText ?? "";
      const title: string = meta.inventionTitle ?? "Untitled Patent";
      const filingDate: string = meta.filingDate ?? "";
      const grantDate: string = meta.grantDate ?? "";
      const statusText: string = meta.applicationStatusDescriptionText ?? "";
      const isGranted = !!grantDate || /patent/i.test(statusText);

      const assigneeName: string =
        r.assignmentBag?.[0]?.assigneeBag?.[0]?.assigneeNameText ?? "";

      const inventors: string = (meta.inventorBag ?? [])
        .map((inv: any) => inv.inventorNameText ?? "")
        .filter(Boolean)
        .join(", ");

      const url = appNum
        ? `https://patentcenter.uspto.gov/applications/${appNum}`
        : "https://patentcenter.uspto.gov";

      return {
        id: `patent-${appNum || Buffer.from(title).toString("base64").slice(0, 16)}`,
        source_type: "patent",
        title,
        text: title,
        authors_or_owner: inventors,
        institution_or_sponsor: assigneeName,
        date: filingDate,
        stage_hint: "discovery",
        url,
        metadata: {
          patent_id: appNum,
          filing_date: filingDate,
          owner_type: inferOwnerType(assigneeName),
          patent_status: isGranted ? "patented" : "pending",
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
