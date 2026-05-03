import type { RawSignal } from "../types";

const BASE = "https://api.uspto.gov/api/v1/patent/applications/search";
const DETAIL_BASE = "https://api.uspto.gov/api/v1/patent/applications";

const ABSTRACT_FETCH_TIMEOUT_MS = 5000;
const MAX_ABSTRACT_FETCH = 10;

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

  // Single words don't need quotes — unquoted gives full-text match across all fields
  if (tokens.length === 1) {
    return trimmed;
  }

  // Multi-word short phrases: keep as quoted phrase match
  if (tokens.length <= 3) {
    return `"${trimmed}"`;
  }

  return trimmed;
}

async function fetchPatentAbstract(appNum: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch(`${DETAIL_BASE}/${appNum}`, {
      headers: {
        "X-API-KEY": apiKey,
      },
      signal: AbortSignal.timeout(ABSTRACT_FETCH_TIMEOUT_MS),
    });

    if (!res.ok) return "";

    const data = await res.json();
    const wrapper = data?.patentFileWrapperData ?? data;
    const meta = wrapper?.applicationMetaData ?? {};

    const abstract: string =
      meta.abstractText ??
      wrapper?.abstractText ??
      data?.abstractText ??
      "";

    return abstract.trim();
  } catch {
    return "";
  }
}

export async function searchPatents(
  query: string,
  maxResults = 10,
  sinceDate?: string,
  beforeDate?: string
): Promise<RawSignal[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    // No key = source is disabled by configuration, not an error per query.
    // Startup health summary already logs this once at warn level.
    return [];
  }

  try {
    const q = buildSearchQuery(query);
    const limit = Math.min(maxResults * 2, 100);

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
      // USPTO ODP returns HTTP 404 with body containing "No matching records found"
      // for legitimate zero-result queries. Treat as empty (silent). Real
      // transport/auth failures (5xx, 401/403, or other 4xx) THROW so the
      // caller can surface them as `status: "error"` in sourceDiagnostics
      // instead of masking them as `status: "empty"`.
      const isLegitimateEmpty =
        res.status === 404 && /no matching records found/i.test(text);
      if (isLegitimateEmpty) return [];
      throw new Error(`USPTO ODP ${res.status}: ${text.slice(0, 120)}`);
    }

    const data = await res.json();
    const results: any[] = data?.patentFileWrapperDataBag ?? [];

    const signals: RawSignal[] = results.slice(0, Math.min(maxResults, 100)).map((r): RawSignal => {
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

    const enrichCount = Math.min(signals.length, MAX_ABSTRACT_FETCH);
    const abstractFetches = signals.slice(0, enrichCount).map(async (signal) => {
      const appNum = signal.metadata?.patent_id as string | undefined;
      if (!appNum) return;

      const abstract = await fetchPatentAbstract(appNum, apiKey);
      if (abstract) {
        signal.text = abstract;
        (signal.metadata as Record<string, unknown>).abstract = abstract;
      }
    });

    await Promise.allSettled(abstractFetches);

    return signals;
  } catch (err) {
    // Re-throw so the caller (routes.ts timedDirect / collectAllSignalsWithDiag)
    // can label this as `status: "timeout"` (aborts) or `status: "error"`
    // (transport/auth) in sourceDiagnostics, instead of returning [] which
    // would be indistinguishable from a legitimate-empty result.
    throw err instanceof Error ? err : new Error(String(err));
  }
}
