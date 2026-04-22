/**
 * NASA TechPort — R&D project scraper
 *
 * Source: NASA TechPort (techport.nasa.gov)
 *         Pre-patent R&D projects across all NASA centers
 *
 * API:    GET https://techport.nasa.gov/api/projects?updatedSince=YYYY-MM-DD
 *             Returns all project IDs (no title/center in the list; one JSON blob).
 *         GET https://techport.nasa.gov/api/projects/{projectId}
 *             Returns full project record with title, description, leadOrganization, etc.
 *         Public, no auth, no key required.
 *
 * Strategy:
 *   1. Fetch the project ID list (single API call — returns ~18K IDs all at once).
 *   2. Take the MAX_PROJECTS most recently updated IDs.
 *   3. Fetch full project detail records in concurrent batches (BATCH_SIZE=10).
 *   4. Map leadOrganization.acronym → full NASA center name via CENTER_MAP.
 *
 * Data format (detail record):
 *   project.projectId, project.title, project.description,
 *   project.leadOrganization.organizationName, project.leadOrganization.acronym
 *
 * Admin panel label: "NASA TechPort"
 *   Per-record ScrapedListing.institution is the actual NASA center name.
 */

import type { InstitutionScraper, ScrapedListing } from "./types";

const ADMIN_INST = "NASA TechPort";
const LIST_BASE = "https://techport.nasa.gov/api/projects";
const DETAIL_BASE = "https://techport.nasa.gov/api/projects";
const VIEW_BASE = "https://techport.nasa.gov/projects";
const REQUEST_TIMEOUT_MS = 20_000;
const BATCH_SIZE = 10;           // concurrent detail fetches
const MAX_PROJECTS = 500;        // cap full scrape to most recently updated N projects
const UPDATED_SINCE = "2018-01-01"; // cast a wide net; API returns all IDs in one response

// ── Center code → full name map (same as nasatt.ts) ──────────────────────────
const CENTER_MAP: Record<string, string> = {
  ARC: "NASA Ames Research Center",
  GSFC: "NASA Goddard Space Flight Center",
  JSC: "NASA Johnson Space Center",
  JPL: "NASA Jet Propulsion Laboratory",
  MSFC: "NASA Marshall Space Flight Center",
  GRC: "NASA Glenn Research Center",
  LARC: "NASA Langley Research Center",
  AFRC: "NASA Armstrong Flight Research Center",
  KSC: "NASA Kennedy Space Center",
  SSC: "NASA Stennis Space Center",
  HQ: "NASA Headquarters",
  STENNIS: "NASA Stennis Space Center",
  JPL_CALTECH: "NASA Jet Propulsion Laboratory",
};

function expandCenter(acronym: string | undefined): string {
  if (!acronym) return "NASA";
  const key = acronym.trim().toUpperCase();
  return CENTER_MAP[key] ?? `NASA ${acronym.trim()}`;
}

// ── Helper: strip HTML tags and decode common entities ────────────────────────
function stripHtml(raw: string): string {
  const ENTITIES: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&apos;": "'",
    "&nbsp;": " ",
    "&#39;": "'",
  };
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-zA-Z]+;/g, (m) => ENTITIES[m] ?? " ")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── API types ─────────────────────────────────────────────────────────────────
interface ProjectListItem {
  projectId: number;
  lastUpdated: string;
  favorited?: boolean;
  detailedFunding?: boolean;
}

interface ProjectListResponse {
  projects: ProjectListItem[];
  totalCount?: number;
}

interface TechPortOrg {
  organizationId?: number;
  organizationName?: string;
  acronym?: string;
  organizationType?: string;   // "NASA_Center" | "Academia" | "Industry" | ...
  organizationTypePretty?: string;
  organizationRole?: string;
}

interface ProjectDetail {
  projectId: number;
  title?: string;
  description?: string;
  benefits?: string;
  statusDescription?: string;
  status?: string;
  leadOrganization?: TechPortOrg;
  otherOrganizations?: TechPortOrg[];
  trlBegin?: number;
  trlCurrent?: number;
  lastUpdated?: string;
}

interface ProjectDetailResponse {
  project: ProjectDetail;
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

function makeSignal(parentSignal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return parentSignal
    ? AbortSignal.any([timeout, parentSignal])
    : timeout;
}

async function fetchProjectIds(signal?: AbortSignal): Promise<{ ids: number[]; totalDiscovered: number }> {
  const url = `${LIST_BASE}?updatedSince=${UPDATED_SINCE}`;
  const res = await fetch(url, { signal: makeSignal(signal) });
  if (!res.ok) throw new Error(`NASA TechPort list HTTP ${res.status}`);
  const data: ProjectListResponse = await res.json();
  const items = data.projects ?? [];
  const totalDiscovered = items.length;
  // Defensive check: if the API ever introduces server-side pagination,
  // totalCount will exceed items.length. Log a warning so operators know
  // to update the fetcher to walk pages (follow-up task #447 covers this).
  if (data.totalCount !== undefined && data.totalCount > totalDiscovered) {
    console.warn(
      `[scraper] ${ADMIN_INST}: API pagination detected — totalCount=${data.totalCount} ` +
      `but received ${totalDiscovered} items; the fetcher may need page-walking logic`
    );
  }
  // The TechPort API returns items sorted newest-first by lastUpdated.
  // We rely on this ordering to select the most recently updated projects.
  // If the first and last items have the same date, the slice may not be ordered
  // as expected — log a warning so operators can detect ordering drift.
  if (items.length > 1) {
    // Normalize "YYYY-M-D" → Date for reliable comparison (TechPort returns non-zero-padded dates)
    const toDate = (s: string) => new Date(s);
    const first = toDate(items[0]?.lastUpdated ?? "");
    const last = toDate(items[items.length - 1]?.lastUpdated ?? "");
    if (!isNaN(first.getTime()) && !isNaN(last.getTime()) && first < last) {
      console.warn(
        `[scraper] ${ADMIN_INST}: unexpected list ordering — first item date "${items[0]?.lastUpdated}" ` +
        `is earlier than last item date "${items[items.length - 1]?.lastUpdated}"; ` +
        `MAX_PROJECTS cap may not select newest projects`
      );
    }
  }
  const ids = items.slice(0, MAX_PROJECTS).map((item) => item.projectId);
  console.log(
    `[scraper] ${ADMIN_INST}: discovered ${totalDiscovered} project IDs — ` +
    `fetching details for ${ids.length} (cap=${MAX_PROJECTS}); ` +
    `${totalDiscovered - ids.length} skipped (follow-up task #447 tracks full coverage)`
  );
  return { ids, totalDiscovered };
}

async function fetchProjectDetail(
  projectId: number,
  signal?: AbortSignal
): Promise<ProjectDetail | null> {
  const url = `${DETAIL_BASE}/${projectId}`;
  try {
    const res = await fetch(url, { signal: makeSignal(signal) });
    if (!res.ok) return null;
    const data: ProjectDetailResponse = await res.json();
    return data.project ?? null;
  } catch {
    return null;
  }
}

function nasaCenterFromOrg(org: TechPortOrg): string | null {
  if (org.organizationType !== "NASA_Center") return null;
  if (org.acronym) return expandCenter(org.acronym);
  if (org.organizationName) {
    const n = org.organizationName.trim();
    return n.startsWith("NASA") ? n : `NASA ${n}`;
  }
  return null;
}

function resolveInstitution(detail: ProjectDetail): string {
  // 1. Try leadOrganization if it is a NASA center
  if (detail.leadOrganization) {
    const center = nasaCenterFromOrg(detail.leadOrganization);
    if (center) return center;
  }

  // 2. Scan otherOrganizations for a NASA center entry
  for (const org of detail.otherOrganizations ?? []) {
    const center = nasaCenterFromOrg(org);
    if (center) return center;
  }

  // 3. Safe fallback — project has no NASA center attribution
  return "NASA";
}

function detailToListing(detail: ProjectDetail): ScrapedListing | null {
  const title = stripHtml(detail.title ?? "").trim();
  if (!title || title.length < 5) return null;

  const url = `${VIEW_BASE}/${detail.projectId}`;
  const description = stripHtml(
    detail.description ?? detail.benefits ?? detail.statusDescription ?? ""
  ).trim();
  const institution = resolveInstitution(detail);

  return {
    title,
    description: description || title,
    url,
    institution,
    technologyId: String(detail.projectId),
  };
}

// ── Concurrent batch detail fetcher ──────────────────────────────────────────

async function fetchDetailsInBatches(
  ids: number[],
  signal?: AbortSignal
): Promise<ScrapedListing[]> {
  const results: ScrapedListing[] = [];

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    if (signal?.aborted) break;
    const batch = ids.slice(i, i + BATCH_SIZE);
    const details = await Promise.all(batch.map((id) => fetchProjectDetail(id, signal)));
    for (const detail of details) {
      if (!detail) continue;
      const listing = detailToListing(detail);
      if (listing) results.push(listing);
    }
    if (i % 100 === 0 && i > 0) {
      console.log(`[scraper] ${ADMIN_INST}: ${results.length} listings collected (${i}/${ids.length} fetched)`);
    }
  }

  return results;
}

// ── Exported scraper ──────────────────────────────────────────────────────────

export const nasaTechPortScraper: InstitutionScraper = {
  institution: ADMIN_INST,
  scraperType: "api",
  tier: 1,

  async scrape(signal?: AbortSignal): Promise<ScrapedListing[]> {
    const { ids } = await fetchProjectIds(signal);
    const listings = await fetchDetailsInBatches(ids, signal);
    console.log(`[scraper] ${ADMIN_INST}: DONE — ${listings.length} projects collected`);
    return listings;
  },

  async probe(maxResults = 3): Promise<ScrapedListing[]> {
    const listUrl = `${LIST_BASE}?updatedSince=${UPDATED_SINCE}`;
    let ids: number[] = [];
    try {
      const res = await fetch(listUrl, { signal: makeSignal() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ProjectListResponse = await res.json();
      // Sample first 50 candidates to reliably collect ≥3 valid records
      // even when some IDs return transient failures or malformed records
      ids = (data.projects ?? []).slice(0, 50).map((item) => item.projectId);
    } catch (err: any) {
      console.warn(`[scraper] ${ADMIN_INST}: probe list fetch failed: ${err?.message}`);
      return [];
    }

    const results: ScrapedListing[] = [];
    for (const id of ids) {
      if (results.length >= maxResults) break;
      const detail = await fetchProjectDetail(id);
      if (!detail) continue;
      const listing = detailToListing(detail);
      if (listing) results.push(listing);
    }

    const sample = results.slice(0, maxResults);
    const ok = sample.length >= 3 && sample.every((r) => r.title && r.url && r.institution);
    console.log(
      `[scraper] ${ADMIN_INST}: probe ${ok ? "OK" : "PARTIAL"} — ${sample.length} results:`,
      sample.map((r) => `"${r.title.slice(0, 60)}" [${r.institution}]`)
    );
    return sample;
  },
};

// ── Development self-test: verify probe at startup ────────────────────────────
if (process.env.NODE_ENV !== "production") {
  (async () => {
    try {
      const sample = await nasaTechPortScraper.probe!(3);
      const passed = sample.length >= 3 && sample.every((r) => r.title && r.url && r.institution);
      if (!passed) {
        console.error(
          `[scraper] ${ADMIN_INST}: PROBE FAILED — expected ≥3 valid results, got ${sample.length}`
        );
      }
    } catch (err: any) {
      console.error(`[scraper] ${ADMIN_INST}: PROBE FAILED — ${err?.message}`);
    }
  })();
}
