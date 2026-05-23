import { createHash } from "crypto";

const OPENFDA_BASE = "https://api.fda.gov/drug/drugsfda.json";
const PAGE_SIZE = 1000;
const REQUEST_TIMEOUT_MS = 30_000;

export type OrphanRecord = {
  fingerprint: string;
  applicationNumber: string | null;
  sponsorName: string | null;
  designationType: "orphan_drug";
  genericName: string | null;
  brandName: string | null;
  indication: string;
  sourceUrl: string | null;
};

/**
 * Fetch all Orphan Drug designation records from openFDA's drugsfda endpoint.
 *
 * openFDA is the official FDA data platform — no scraping, no blocking risk.
 * Rate limits: 40 req/min without API key, 240 with OPENFDA_API_KEY set.
 * Pagination uses `skip`; total records with orphan_designation is ~3,000–6,000.
 *
 * One OrphanRecord is emitted per (application × indication) pair — a single
 * drug may carry multiple orphan designations for different disease indications.
 */
export async function fetchOrphanDrugDesignations(): Promise<OrphanRecord[]> {
  const records: OrphanRecord[] = [];
  const seen = new Set<string>();
  let skip = 0;

  while (true) {
    const params = new URLSearchParams({
      search: "openfda.orphan_designation:*",
      limit: String(PAGE_SIZE),
      skip: String(skip),
    });
    const apiKey = process.env.OPENFDA_API_KEY;
    if (apiKey) params.set("api_key", apiKey);

    let data: any;
    try {
      const res = await fetch(`${OPENFDA_BASE}?${params}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      // 404 means no more results (openFDA returns 404 when skip exceeds total)
      if (res.status === 404) break;
      if (!res.ok) {
        throw new Error(`openFDA responded ${res.status}: ${await res.text()}`);
      }
      data = await res.json();
    } catch (err: any) {
      // Surface a clear error so the caller can log and retry on next schedule
      throw new Error(`[fda_orphan] Fetch failed at skip=${skip}: ${err.message}`);
    }

    const results: any[] = data?.results ?? [];
    if (results.length === 0) break;

    for (const r of results) {
      const appNum: string | null = r.application_number ?? null;
      const sponsor: string | null = r.sponsor_name ?? null;
      const openfda = r.openfda ?? {};
      const orphanDesignations: string[] = openfda.orphan_designation ?? [];
      const genericNames: string[] = openfda.generic_name ?? [];
      const brandNames: string[] = openfda.brand_name ?? [];

      const genericName = genericNames[0] ?? null;
      const brandName = brandNames[0] ?? null;

      for (const rawIndication of orphanDesignations) {
        const indication = rawIndication?.trim();
        if (!indication) continue;

        // Stable fingerprint: sha256(appNum + normalised indication), truncated to 16 hex chars
        const fp = createHash("sha256")
          .update(`${appNum ?? ""}:${indication.toLowerCase()}`)
          .digest("hex")
          .slice(0, 16);

        if (seen.has(fp)) continue;
        seen.add(fp);

        const numericApp = appNum?.replace(/\D/g, "") ?? "";
        records.push({
          fingerprint: fp,
          applicationNumber: appNum,
          sponsorName: sponsor,
          designationType: "orphan_drug",
          genericName,
          brandName,
          indication,
          sourceUrl: numericApp
            ? `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=${numericApp}`
            : "https://www.accessdata.fda.gov/scripts/opdlisting/oopd/",
        });
      }
    }

    if (results.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;

    // Brief pause between pages to stay well within rate limits
    await new Promise((r) => setTimeout(r, 250));
  }

  return records;
}
