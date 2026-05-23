import { db } from "../db";
import { regulatoryDesignations } from "../../shared/schema";
import { fetchOrphanDrugDesignations } from "./sources/fda_orphan";
import { sql } from "drizzle-orm";

let isSyncing = false;

/**
 * Upsert all Orphan Drug designations from openFDA into regulatory_designations.
 *
 * Safe to call concurrently — a boolean guard skips overlapping invocations.
 * Idempotent: the fingerprint unique constraint turns re-syncs into updates.
 *
 * Called: (1) on startup when table is empty, (2) weekly via scheduler.
 */
export async function syncRegulatoryDesignations(): Promise<{ imported: number; total: number; skipped: boolean }> {
  if (isSyncing) {
    console.log("[regulatorySync] Sync already in progress — skipping concurrent call");
    return { imported: 0, total: 0, skipped: true };
  }
  isSyncing = true;

  try {
    console.log("[regulatorySync] Starting orphan drug designation sync from openFDA...");
    const records = await fetchOrphanDrugDesignations();
    console.log(`[regulatorySync] Fetched ${records.length} records — upserting in batches...`);

    const BATCH = 200;
    let imported = 0;

    for (let i = 0; i < records.length; i += BATCH) {
      const chunk = records.slice(i, i + BATCH);
      await db
        .insert(regulatoryDesignations)
        .values(
          chunk.map((r) => ({
            fingerprint: r.fingerprint,
            applicationNumber: r.applicationNumber,
            sponsorName: r.sponsorName,
            designationType: r.designationType,
            genericName: r.genericName,
            brandName: r.brandName,
            indication: r.indication,
            sourceUrl: r.sourceUrl,
            updatedAt: new Date(),
          })),
        )
        .onConflictDoUpdate({
          target: regulatoryDesignations.fingerprint,
          set: {
            sponsorName: sql`EXCLUDED.sponsor_name` as any,
            genericName: sql`EXCLUDED.generic_name` as any,
            brandName: sql`EXCLUDED.brand_name` as any,
            indication: sql`EXCLUDED.indication` as any,
            updatedAt: sql`NOW()` as any,
          },
        });
      imported += chunk.length;
    }

    console.log(`[regulatorySync] Sync complete — ${imported} designations upserted`);
    return { imported, total: records.length, skipped: false };
  } finally {
    isSyncing = false;
  }
}

/** Returns the row count in regulatory_designations, or 0 if table doesn't exist yet. */
export async function getRegulatoryDesignationCount(): Promise<number> {
  try {
    const result = await db.execute(
      sql`SELECT COUNT(*)::text AS count FROM regulatory_designations`,
    );
    const rows = result as unknown as Array<{ count: string }>;
    return parseInt(rows[0]?.count ?? "0", 10);
  } catch {
    return 0;
  }
}
