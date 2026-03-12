import { and, eq, or, ilike, desc, sql } from "drizzle-orm";
import { db } from "../../../db";
import { ingestedAssets } from "@shared/schema";
import type { RawSignal } from "../../types";
import { getStanfordListings } from "./stanford";
import { getMitListings } from "./mit";
import { getOxfordListings } from "./oxford";
import { getUcsfListings } from "./ucsf";
import { getBroadListings } from "./broad";
import { getJohnsHopkinsListings } from "./johnshopkins";
import { getHarvardListings } from "./harvard";
import { getEmoryListings } from "./emory";
import { getWarfListings } from "./warf";
import { getColumbiaListings } from "./columbia";
import { getPennListings } from "./penn";
import { getDukeListings } from "./duke";
import { getNorthwesternListings } from "./northwestern";
import { getUcsdListings } from "./ucsd";
import { getVanderbiltListings } from "./vanderbilt";
import { getUtSouthwesternListings } from "./ut_southwestern";
import { getWeillCornellListings } from "./weill_cornell";
import { getBaylorListings } from "./baylor";
import { getUcBerkeleyListings } from "./ucberkeley";
import { getUwListings } from "./uw";
import { getWashuListings } from "./washu";
import { getUmichListings } from "./umich";
import { getMayoListings } from "./mayo";
import { getScrippsListings } from "./scripps";
import { getSalkListings } from "./salk";
import { getMdAndersonListings } from "./mdanderson";
import { getUpittListings } from "./upitt";
import { getUchicagoListings } from "./uchicago";

export interface TechTransferAdapter {
  institution: string;
  getListings(): RawSignal[];
}

const adapters: TechTransferAdapter[] = [
  { institution: "Stanford University", getListings: getStanfordListings },
  { institution: "MIT", getListings: getMitListings },
  { institution: "University of Oxford", getListings: getOxfordListings },
  { institution: "UCSF", getListings: getUcsfListings },
  { institution: "Broad Institute", getListings: getBroadListings },
  { institution: "Johns Hopkins University", getListings: getJohnsHopkinsListings },
  { institution: "Harvard University", getListings: getHarvardListings },
  { institution: "Emory University", getListings: getEmoryListings },
  { institution: "Wisconsin Alumni Research Foundation (WARF)", getListings: getWarfListings },
  { institution: "Columbia University", getListings: getColumbiaListings },
  { institution: "University of Pennsylvania", getListings: getPennListings },
  { institution: "Duke University", getListings: getDukeListings },
  { institution: "Northwestern University", getListings: getNorthwesternListings },
  { institution: "UC San Diego", getListings: getUcsdListings },
  { institution: "Vanderbilt University", getListings: getVanderbiltListings },
  { institution: "UT Southwestern Medical Center", getListings: getUtSouthwesternListings },
  { institution: "Weill Cornell Medicine", getListings: getWeillCornellListings },
  { institution: "Baylor College of Medicine", getListings: getBaylorListings },
  { institution: "UC Berkeley", getListings: getUcBerkeleyListings },
  { institution: "University of Washington", getListings: getUwListings },
  { institution: "Washington University in St. Louis", getListings: getWashuListings },
  { institution: "University of Michigan", getListings: getUmichListings },
  { institution: "Mayo Clinic", getListings: getMayoListings },
  { institution: "Scripps Research", getListings: getScrippsListings },
  { institution: "Salk Institute for Biological Studies", getListings: getSalkListings },
  { institution: "MD Anderson Cancer Center", getListings: getMdAndersonListings },
  { institution: "University of Pittsburgh", getListings: getUpittListings },
  { institution: "University of Chicago", getListings: getUchicagoListings },
];

function matchesQuery(signal: RawSignal, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const haystack = `${signal.title} ${signal.text}`.toLowerCase();
  return terms.some((t) => haystack.includes(t));
}

function toSignal(asset: typeof ingestedAssets.$inferSelect): RawSignal {
  return {
    id: String(asset.id),
    source_type: "tech_transfer" as const,
    title: asset.assetName,
    text: asset.summary,
    authors_or_owner: asset.institution,
    institution_or_sponsor: asset.institution,
    date: asset.lastSeenAt.toISOString().slice(0, 10),
    stage_hint: asset.developmentStage,
    url: asset.sourceUrl ?? "",
    metadata: {
      target: asset.target,
      modality: asset.modality,
      indication: asset.indication,
    },
  };
}

export async function searchTechTransfer(query: string, maxResults = 50): Promise<RawSignal[]> {
  // Primary path: query the ingested_assets DB table (populated by the nightly cron).
  // Only fall back to static adapters when the DB table has zero tech_transfer rows.
  try {
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);

    // Check total tech_transfer row count first — determines fallback eligibility
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ingestedAssets)
      .where(eq(ingestedAssets.sourceType, "tech_transfer"));
    const dbHasData = Number(count) > 0;

    if (dbHasData) {
      let rows;
      if (terms.length > 0) {
        const conditions = terms.flatMap((t) => [
          ilike(ingestedAssets.assetName, `%${t}%`),
          ilike(ingestedAssets.summary, `%${t}%`),
        ]);
        rows = await db
          .select()
          .from(ingestedAssets)
          .where(and(eq(ingestedAssets.sourceType, "tech_transfer"), or(...conditions)))
          .orderBy(desc(ingestedAssets.lastSeenAt))
          .limit(maxResults);
      } else {
        rows = await db
          .select()
          .from(ingestedAssets)
          .where(eq(ingestedAssets.sourceType, "tech_transfer"))
          .orderBy(desc(ingestedAssets.lastSeenAt))
          .limit(maxResults);
      }
      // When DB has data, always return DB rows (empty array if no keyword match)
      return rows.map(toSignal);
    }
  } catch (err: any) {
    console.warn("[techtransfer] DB search failed, using static fallback:", err?.message);
  }

  // Fallback: static adapters (used only when ingested_assets has no tech_transfer rows yet)
  const allListings = adapters.flatMap((a) => a.getListings());
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  if (terms.length === 0) return allListings.slice(0, maxResults);
  const matched = allListings.filter((s) => matchesQuery(s, query));
  return matched.length > 0 ? matched.slice(0, maxResults) : allListings.slice(0, Math.min(5, maxResults));
}
