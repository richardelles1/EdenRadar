import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql } from "drizzle-orm";
import { computeCompletenessScore } from "../server/lib/pipeline/contentHash";

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.SUPABASE_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const db = drizzle(pool);

  console.log("Fetching all enriched assets…");
  const rows = await db.execute<{
    id: number;
    asset_class: string | null;
    target: string | null;
    modality: string | null;
    indication: string | null;
    development_stage: string | null;
    mechanism_of_action: string | null;
    innovation_claim: string | null;
    unmet_need: string | null;
    comparable_drugs: string | null;
    licensing_readiness: string | null;
    summary: string | null;
    abstract: string | null;
    categories: string[] | null;
    inventors: string[] | null;
    patent_status: string | null;
    device_attributes: Record<string, unknown> | null;
    completeness_score: number | null;
  }>(sql`
    SELECT id, asset_class, target, modality, indication, development_stage, mechanism_of_action,
           innovation_claim, unmet_need, comparable_drugs, licensing_readiness, summary, abstract,
           categories, inventors, patent_status, device_attributes, completeness_score
    FROM ingested_assets
    WHERE relevant = true
  `);

  console.log(`Found ${rows.rows.length} relevant assets to rescore`);

  let changed = 0;
  let unchanged = 0;
  const CHUNK = 500;
  const updates: Array<[number, number | null]> = [];

  for (const r of rows.rows) {
    const newScore = computeCompletenessScore({
      assetClass: r.asset_class,
      target: r.target,
      modality: r.modality,
      indication: r.indication,
      developmentStage: r.development_stage,
      mechanismOfAction: r.mechanism_of_action,
      innovationClaim: r.innovation_claim,
      unmetNeed: r.unmet_need,
      comparableDrugs: r.comparable_drugs,
      licensingReadiness: r.licensing_readiness,
      summary: r.summary,
      abstract: r.abstract,
      categories: r.categories,
      inventors: r.inventors,
      patentStatus: r.patent_status,
      deviceAttributes: r.device_attributes,
    });
    const current = r.completeness_score != null ? Number(r.completeness_score) : null;
    if (newScore !== current) {
      updates.push([r.id, newScore]);
      changed++;
    } else {
      unchanged++;
    }
  }

  console.log(`Scores to update: ${changed} (${unchanged} unchanged)`);

  // Write in chunks using unnest for efficiency
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    // Build individual updates batched in a single statement via VALUES
    const ids = chunk.map(([id]) => id);
    const scores = chunk.map(([, score]) => score);

    await db.execute(sql`
      UPDATE ingested_assets AS ia
      SET completeness_score = v.score
      FROM (SELECT UNNEST(ARRAY[${sql.raw(ids.join(","))}]::int[]) AS id,
                   UNNEST(ARRAY[${sql.raw(scores.map(s => s === null ? "NULL" : String(s)).join(","))}]::int[]) AS score) AS v
      WHERE ia.id = v.id
    `);

    const pct = Math.round(((i + chunk.length) / updates.length) * 100);
    process.stdout.write(`\r  ${i + chunk.length}/${updates.length} (${pct}%)`);
  }

  console.log("\nRescore complete.");

  // Band distribution after
  const bands = await db.execute(sql`
    SELECT
      CASE
        WHEN completeness_score >= 80 THEN 'rich'
        WHEN completeness_score >= 60 THEN 'decent'
        WHEN completeness_score >= 40 THEN 'sparse'
        WHEN completeness_score >= 1  THEN 'very_sparse'
        ELSE 'bare'
      END AS band,
      COUNT(*)::int AS n
    FROM ingested_assets
    WHERE relevant = true
    GROUP BY 1 ORDER BY 2 DESC
  `);
  console.log("Band distribution after rescore:", JSON.stringify(bands.rows, null, 2));

  await pool.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
