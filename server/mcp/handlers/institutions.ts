/**
 * MCP handlers: list_institutions, get_institution
 */

import { db } from "../../db";
import { ingestedAssets, institutionMetadata } from "../../../shared/schema";
import { eq, sql, ilike, and } from "drizzle-orm";
import type { ToolConfig } from "../config";

export async function handleListInstitutions(
  args: Record<string, unknown>,
  cfg: ToolConfig,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const limit = Math.min(Number(args.limit ?? cfg.maxResults), cfg.maxResults!);
  const continent = args.continent ? String(args.continent) : null;

  // Count relevant assets per institution
  const countRows = await db
    .select({
      institution: ingestedAssets.institution,
      assetCount: sql<number>`count(*)::int`,
    })
    .from(ingestedAssets)
    .where(eq(ingestedAssets.relevant, true))
    .groupBy(ingestedAssets.institution)
    .orderBy(sql`count(*) DESC`)
    .limit(limit);

  // Enrich with metadata where available
  const names = countRows.map((r) => r.institution);
  const metaRows = names.length
    ? await db
        .select()
        .from(institutionMetadata)
        .where(
          continent
            ? and(
                sql`slug = ANY(${names}::text[])`,
                ilike(institutionMetadata.continent, `%${continent}%`),
              )
            : sql`slug = ANY(${names}::text[])`,
        )
    : [];

  const metaBySlug = new Map(metaRows.map((m) => [m.slug, m]));

  const results = countRows.map((r) => {
    const meta = metaBySlug.get(r.institution);
    return {
      name: r.institution,
      assetCount: r.assetCount,
      city: meta?.city ?? null,
      continent: meta?.continent ?? null,
      ttoName: meta?.ttoName ?? null,
      website: meta?.website ?? null,
      specialties: meta?.specialties ?? [],
    };
  });

  return {
    content: [{ type: "text", text: JSON.stringify({ count: results.length, institutions: results }, null, 2) }],
  };
}

export async function handleGetInstitution(
  args: Record<string, unknown>,
  _cfg: ToolConfig,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const name = String(args.name ?? "").trim();
  if (!name) {
    return { content: [{ type: "text", text: JSON.stringify({ error: "Provide institution name" }) }] };
  }

  const [countRow] = await db
    .select({ assetCount: sql<number>`count(*)::int` })
    .from(ingestedAssets)
    .where(and(eq(ingestedAssets.relevant, true), ilike(ingestedAssets.institution, `%${name}%`)));

  const [meta] = await db
    .select()
    .from(institutionMetadata)
    .where(ilike(institutionMetadata.name, `%${name}%`))
    .limit(1);

  if (!countRow && !meta) {
    return { content: [{ type: "text", text: JSON.stringify({ error: "Institution not found" }) }] };
  }

  const result = {
    name: meta?.name ?? name,
    assetCount: countRow?.assetCount ?? 0,
    city: meta?.city ?? null,
    continent: meta?.continent ?? null,
    ttoName: meta?.ttoName ?? null,
    website: meta?.website ?? null,
    specialties: meta?.specialties ?? [],
  };

  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
