import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql } from "drizzle-orm";

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.SUPABASE_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const db = drizzle(pool);

  const before = await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM ingested_assets WHERE relevant = true AND modality IS NOT NULL AND modality NOT IN ('unknown','')`
  );
  console.log("has_modality BEFORE:", (before.rows[0] as any).n);

  const result = await db.execute(sql`
    WITH fills AS (
      SELECT id,
        CASE
          WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* 'bispecific.*antibod'                        THEN 'bispecific antibody'
          WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* 'antibody.drug.conjugate'                    THEN 'adc'
          WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* 'car-t|car t cell|chimeric antigen receptor'  THEN 'car-t'
          WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* 'protac|targeted protein degradation|proteolysis targeting' THEN 'protac'
          WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* 'gene edit|crispr|zinc finger nuclease|talen' THEN 'gene editing'
          WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* 'gene therap'                                THEN 'gene therapy'
          WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* '\ymrna\y|messenger rna'                    THEN 'mrna therapy'
          WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* '\ysirna\y|\yshrna\y|antisense oligonucleotide|\yrnai\y' THEN 'sirna'
          WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* 'cell therap|cell-based therap'             THEN 'cell therapy'
          WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* '\ynanoparticle\y|lipid nanoparticle|liposome' THEN 'nanoparticle'
          WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* '\yantibod'                                 THEN 'antibody'
          WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* '\ypeptide\y'                               THEN 'peptide'
          WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* '\yvaccine\y|\yimmunization\y|\yimmunisation\y' THEN 'vaccine'
          WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* 'diagnostic|\ybiosensor\y|lateral flow|immunoassay' THEN 'diagnostic'
          WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* 'small molecule'                            THEN 'small molecule'
          WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* 'platform technolog'                       THEN 'platform technology'
        END AS new_modality
      FROM ingested_assets
      WHERE relevant = true
        AND (modality IS NULL OR modality IN ('unknown', ''))
    )
    UPDATE ingested_assets ia
    SET
      modality = f.new_modality,
      enrichment_sources = COALESCE(enrichment_sources, '{}'::jsonb) || jsonb_build_object('modality', 'rule')
    FROM fills f
    WHERE ia.id = f.id
      AND f.new_modality IS NOT NULL
  `);
  console.log("Modality fill rows updated:", result.rowCount);

  const after = await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM ingested_assets WHERE relevant = true AND modality IS NOT NULL AND modality NOT IN ('unknown','')`
  );
  console.log("has_modality AFTER:", (after.rows[0] as any).n);

  const breakdown = await db.execute(sql`
    SELECT modality, COUNT(*)::int AS n
    FROM ingested_assets WHERE relevant = true AND modality IS NOT NULL AND modality NOT IN ('unknown','')
    GROUP BY modality ORDER BY n DESC LIMIT 25
  `);
  console.log("Breakdown:", JSON.stringify(breakdown.rows, null, 2));

  await pool.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
