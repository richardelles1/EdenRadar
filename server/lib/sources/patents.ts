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

// Biotech abbreviations and brand names that USPTO filings use in expanded or
// alternate form. Each entry maps a normalized token to 1–3 alternative phrases
// that should be OR'd into the query so both styles match.
const PATENT_SYNONYMS: Record<string, string[]> = {
  "glp-1":          ["glucagon-like peptide-1", "glucagon-like peptide 1", "GLP-1"],
  "glp1":           ["glucagon-like peptide-1", "glucagon-like peptide 1", "GLP-1"],
  "glp-2":          ["glucagon-like peptide-2", "glucagon-like peptide 2", "GLP-2"],
  "gip":            ["glucose-dependent insulinotropic polypeptide", "GIP"],
  "car-t":          ["chimeric antigen receptor T cell", "CAR-T", "CAR T cell"],
  "cart":           ["chimeric antigen receptor T cell", "CAR-T"],
  "crispr":         ["CRISPR-Cas9", "CRISPR", "gene editing"],
  "aav":            ["adeno-associated virus", "AAV", "gene therapy vector"],
  "pd-1":           ["programmed death-1", "programmed cell death protein 1", "PD-1"],
  "pd-l1":          ["programmed death-ligand 1", "PD-L1"],
  "ctla-4":         ["cytotoxic T-lymphocyte-associated protein 4", "CTLA-4"],
  "kras":           ["KRAS", "Kirsten rat sarcoma"],
  "egfr":           ["epidermal growth factor receptor", "EGFR"],
  "her2":           ["human epidermal growth factor receptor 2", "HER2", "ERBB2"],
  "vegf":           ["vascular endothelial growth factor", "VEGF"],
  "tnf":            ["tumor necrosis factor", "TNF-alpha"],
  "il-6":           ["interleukin-6", "interleukin 6", "IL-6"],
  "il-17":          ["interleukin-17", "interleukin 17", "IL-17"],
  "il-23":          ["interleukin-23", "interleukin 23", "IL-23"],
  "btk":            ["Bruton's tyrosine kinase", "BTK"],
  "jak":            ["Janus kinase", "JAK inhibitor"],
  "jak1":           ["JAK1", "Janus kinase 1"],
  "jak2":           ["JAK2", "Janus kinase 2"],
  "mtor":           ["mechanistic target of rapamycin", "mTOR"],
  "pi3k":           ["phosphoinositide 3-kinase", "PI3K"],
  "alk":            ["anaplastic lymphoma kinase", "ALK"],
  "braf":           ["BRAF", "v-Raf murine sarcoma viral oncogene"],
  "bcr-abl":        ["BCR-ABL", "Philadelphia chromosome"],
  "mrna":           ["messenger RNA", "mRNA vaccine", "mRNA therapy"],
  "sirna":          ["small interfering RNA", "siRNA", "RNA interference"],
  "antisense":      ["antisense oligonucleotide", "ASO", "antisense therapy"],
  "adc":            ["antibody-drug conjugate", "ADC"],
  "bispecific":     ["bispecific antibody", "bispecific T-cell engager", "BiTE"],
  "nanobody":       ["single-domain antibody", "nanobody", "VHH antibody"],
  "obesity":        ["obesity", "weight loss", "anti-obesity", "adiposity"],
  "alzheimer":      ["Alzheimer's disease", "Alzheimer disease", "amyloid beta"],
  "parkinson":      ["Parkinson's disease", "Parkinson disease", "alpha-synuclein"],
  "nash":           ["nonalcoholic steatohepatitis", "NASH", "metabolic-associated steatohepatitis"],
  "nafld":          ["nonalcoholic fatty liver disease", "NAFLD"],
  "aml":            ["acute myeloid leukemia", "AML"],
  "cll":            ["chronic lymphocytic leukemia", "CLL"],
  "dlbcl":          ["diffuse large B-cell lymphoma", "DLBCL"],
  "nsclc":          ["non-small cell lung cancer", "NSCLC"],
  "sclc":           ["small cell lung cancer", "SCLC"],
  "hcc":            ["hepatocellular carcinoma", "HCC", "liver cancer"],
  "crc":            ["colorectal cancer", "CRC", "colon cancer"],
  "tnbc":           ["triple-negative breast cancer", "TNBC"],
  "t2d":            ["type 2 diabetes", "type II diabetes", "T2DM"],
  "t1d":            ["type 1 diabetes", "type I diabetes", "T1DM"],
  "ra":             ["rheumatoid arthritis", "RA"],
  "ibd":            ["inflammatory bowel disease", "IBD", "Crohn's disease"],
  "copd":           ["chronic obstructive pulmonary disease", "COPD"],
  "lvef":           ["left ventricular ejection fraction", "LVEF"],
  "hfpef":          ["heart failure with preserved ejection fraction", "HFpEF"],
};

function expandPatentQuery(rawQuery: string): string {
  const tokens = rawQuery.trim().toLowerCase().split(/\s+/);
  const expansions: string[] = [];

  for (const token of tokens) {
    const syns = PATENT_SYNONYMS[token];
    if (syns) {
      expansions.push(...syns);
    }
  }

  // Also try the full phrase as a key (handles "car-t" as a single lookup token)
  const fullKey = rawQuery.trim().toLowerCase();
  const fullSyns = PATENT_SYNONYMS[fullKey];
  if (fullSyns) {
    for (const s of fullSyns) {
      if (!expansions.includes(s)) expansions.push(s);
    }
  }

  return expansions.length > 0 ? [...new Set(expansions)] : [];
}

function buildSearchQuery(rawQuery: string): string {
  const trimmed = rawQuery.trim();
  if (!trimmed) return "*";

  const synonyms = expandPatentQuery(trimmed);
  const tokens = trimmed.split(/\s+/);

  // Build the canonical form of the original query
  let canonical: string;
  const isSingleShortToken = tokens.length === 1 && trimmed.length <= 8;
  if (isSingleShortToken && trimmed.includes("-")) {
    // Hyphenated short token: search both hyphenated and spaced forms
    const upper = trimmed.toUpperCase();
    const spaced = trimmed.replace(/-/g, " ");
    canonical = `"${upper}" OR "${spaced}"`;
  } else if (tokens.length === 1) {
    canonical = trimmed;
  } else if (tokens.length <= 3) {
    canonical = `"${trimmed}"`;
  } else {
    canonical = trimmed;
  }

  if (synonyms.length === 0) return canonical;

  // OR the canonical form with each synonym phrase (quoted for multi-word synonyms)
  const synClauses = synonyms.map((s) =>
    s.split(/\s+/).length > 1 ? `"${s}"` : s
  );
  return [canonical, ...synClauses].join(" OR ");
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
