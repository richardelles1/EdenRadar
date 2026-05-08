/**
 * USPTO Patent lookup service for EdenRadar patent cross-reference.
 *
 * Uses the USPTO ODP File Wrapper Search API:
 *   GET https://api.uspto.gov/patent/applications/v1/applications
 *   Auth: X-Api-Key header (USPTO_ODP_API_KEY env var)
 *   Query syntax: OpenSearch / Lucene  (applicantNameText:"<name>")
 *
 * Rate limit: generous with a valid ODP key.
 * Cache: in-memory Map keyed by candidateName, invalidated each calendar day.
 */

import { ASSIGNEE_MAP, findAssigneeEntry } from "./usptoAssigneeMap";

export interface PatentRecord {
  applicationNumber: string;
  patentNumber: string | null;
  title: string;
  grantDate: string | null;
  filingDate: string | null;
  assignee: string;
  status: "granted" | "filed";
}

export interface SpotCheckResult {
  institution: string;
  assigneeName: string;
  totalFound: number;
  sample: Array<{ number: string; title: string; date: string | null }>;
  error?: string;
}

export interface CrossRefSummary {
  matched: number;
  unmatched: number;
  skipped: number;
  total: number;
  institutions: number;
  errors: string[];
}

// ── In-memory cache ────────────────────────────────────────────────────────────
interface CacheEntry {
  patents: PatentRecord[];
  date: string;
}

const cache = new Map<string, CacheEntry>();

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function getCached(key: string): PatentRecord[] | null {
  const entry = cache.get(key);
  if (!entry || entry.date !== todayString()) return null;
  return entry.patents;
}

function setCached(key: string, patents: PatentRecord[]): void {
  cache.set(key, { patents, date: todayString() });
}

// ── API fetch helpers ──────────────────────────────────────────────────────────

const USPTO_BASE = "https://api.uspto.gov/patent/applications/v1/applications";

async function fetchPatentsByAssignee(
  assigneeName: string,
  apiKey: string,
  rows = 500,
): Promise<PatentRecord[]> {
  const cacheKey = `${assigneeName}::${todayString()}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    q: `applicantNameText:"${assigneeName}"`,
    start: "0",
    rows: String(rows),
  });

  const res = await fetch(`${USPTO_BASE}?${params}`, {
    headers: {
      "X-Api-Key": apiKey,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`USPTO API returned HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json() as {
    patentBag?: Array<{
      applicationNumberText?: string;
      patentNumberText?: string;
      inventionTitle?: string;
      grantDate?: string;
      filingDate?: string;
    }>;
    totalCount?: number;
  };

  const patents: PatentRecord[] = (json.patentBag ?? []).map((p) => ({
    applicationNumber: p.applicationNumberText ?? "",
    patentNumber: p.patentNumberText ?? null,
    title: p.inventionTitle ?? "",
    grantDate: p.grantDate ?? null,
    filingDate: p.filingDate ?? null,
    assignee: assigneeName,
    status: p.grantDate ? "granted" : "filed",
  }));

  setCached(cacheKey, patents);
  return patents;
}

/**
 * Fetches patents for an institution, trying all candidate assignee names
 * and deduplicating by application number.
 */
export async function fetchPatentsForInstitution(
  institution: string,
  apiKey: string,
): Promise<PatentRecord[]> {
  const entry = findAssigneeEntry(institution);
  if (!entry) return [];

  const seen = new Set<string>();
  const all: PatentRecord[] = [];

  for (const candidateName of entry.candidateNames) {
    const records = await fetchPatentsByAssignee(candidateName, apiKey);
    for (const r of records) {
      const key = r.applicationNumber || `${r.assignee}::${r.title}`;
      if (!seen.has(key)) {
        seen.add(key);
        all.push(r);
      }
    }
  }

  return all;
}

// ── Spot check ─────────────────────────────────────────────────────────────────

/** Run 3–5 test lookups and return results without writing anything. */
export async function runSpotCheck(apiKey: string): Promise<SpotCheckResult[]> {
  const checkInstitutions = [
    "Johns Hopkins University",
    "MIT",
    "Stanford University",
    "Columbia University",
    "Northwestern University",
  ];

  const results: SpotCheckResult[] = [];

  for (const institution of checkInstitutions) {
    const entry = findAssigneeEntry(institution);
    if (!entry) {
      results.push({ institution, assigneeName: "(unmapped)", totalFound: 0, sample: [], error: "Not in assignee map" });
      continue;
    }
    try {
      const patents = await fetchPatentsForInstitution(institution, apiKey);
      results.push({
        institution,
        assigneeName: entry.candidateNames[0],
        totalFound: patents.length,
        sample: patents.slice(0, 3).map((p) => ({
          number: p.patentNumber ?? p.applicationNumber,
          title: p.title.slice(0, 80),
          date: p.grantDate ?? p.filingDate,
        })),
      });
    } catch (err: any) {
      results.push({
        institution,
        assigneeName: entry.candidateNames[0],
        totalFound: 0,
        sample: [],
        error: err.message,
      });
    }
  }

  return results;
}

// ── Jaccard title matching ─────────────────────────────────────────────────────

function normalizeTitle(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const JACCARD_THRESHOLD = 0.35;

function findBestMatch(assetTitle: string, patents: PatentRecord[]): PatentRecord | null {
  const assetWords = normalizeTitle(assetTitle);
  let best: { record: PatentRecord; score: number } | null = null;

  for (const patent of patents) {
    const patentWords = normalizeTitle(patent.title);
    const score = jaccardSimilarity(assetWords, patentWords);
    if (score >= JACCARD_THRESHOLD) {
      if (!best || score > best.score) {
        best = { record: patent, score };
      }
    }
  }

  return best?.record ?? null;
}

// ── Cross-reference run ────────────────────────────────────────────────────────

export interface AssetRow {
  id: number;
  assetName: string | null;
  institution: string | null;
  ipType: string | null;
  patentStatus: string | null;
  humanVerified: Record<string, boolean> | null;
  enrichmentSources: Record<string, string> | null;
}

export interface CrossRefMatch {
  assetId: number;
  ipType: string;
  patentStatus: string;
  applicationNumber: string;
  patentNumber: string | null;
  grantDate: string | null;
}

/**
 * For a batch of TTO assets (missing ip_type), attempt title-based patent matching.
 * Returns write-back objects — does NOT write to DB itself.
 */
export async function crossReferenceAssets(
  assets: AssetRow[],
  apiKey: string,
  onProgress?: (done: number, total: number, matched: number) => void,
): Promise<{ matches: CrossRefMatch[]; summary: CrossRefSummary }> {
  const matches: CrossRefMatch[] = [];
  const summary: CrossRefSummary = {
    matched: 0,
    unmatched: 0,
    skipped: 0,
    total: assets.length,
    institutions: 0,
    errors: [],
  };

  // Group assets by institution
  const byInstitution = new Map<string, AssetRow[]>();
  for (const asset of assets) {
    if (!asset.institution || !asset.assetName) {
      summary.skipped++;
      continue;
    }
    const key = asset.institution;
    if (!byInstitution.has(key)) byInstitution.set(key, []);
    byInstitution.get(key)!.push(asset);
  }

  summary.institutions = byInstitution.size;
  let done = 0;

  for (const [institution, institutionAssets] of byInstitution) {
    let patents: PatentRecord[];

    try {
      patents = await fetchPatentsForInstitution(institution, apiKey);
    } catch (err: any) {
      const msg = `${institution}: ${err.message}`;
      summary.errors.push(msg);
      console.warn(`[uspto-crossref] API error for ${institution}: ${err.message}`);
      summary.skipped += institutionAssets.length;
      done += institutionAssets.length;
      onProgress?.(done, summary.total, summary.matched);
      continue;
    }

    if (patents.length === 0) {
      summary.skipped += institutionAssets.length;
      done += institutionAssets.length;
      onProgress?.(done, summary.total, summary.matched);
      continue;
    }

    for (const asset of institutionAssets) {
      // Skip if human-verified or already has non-null ip_type
      const hv = asset.humanVerified ?? {};
      if (hv.ipType) {
        summary.skipped++;
        done++;
        onProgress?.(done, summary.total, summary.matched);
        continue;
      }

      const match = findBestMatch(asset.assetName!, patents);
      if (match) {
        matches.push({
          assetId: asset.id,
          ipType: "patent",
          patentStatus: match.status,
          applicationNumber: match.applicationNumber,
          patentNumber: match.patentNumber,
          grantDate: match.grantDate,
        });
        summary.matched++;
      } else {
        summary.unmatched++;
      }

      done++;
      onProgress?.(done, summary.total, summary.matched);
    }
  }

  return { matches, summary };
}

/** Expose the full assignee map for coverage info */
export function getAssigneeMapCoverage(): { institution: string; candidateNames: string[] }[] {
  return ASSIGNEE_MAP.map((e) => ({ institution: e.institution, candidateNames: e.candidateNames }));
}
