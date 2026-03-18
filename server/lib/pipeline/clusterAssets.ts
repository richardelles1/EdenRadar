import type { ScoredAsset, SourceType } from "../types";

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

function stringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  return 0;
}

function shouldMerge(a: Partial<ScoredAsset>, b: Partial<ScoredAsset>): boolean {
  const nameSim = stringSimilarity(a.asset_name ?? "", b.asset_name ?? "");
  if (nameSim >= 0.8 && a.asset_name !== "unknown" && b.asset_name !== "unknown") return true;

  const targetSim = stringSimilarity(a.target ?? "", b.target ?? "");
  const indicationSim = stringSimilarity(a.indication ?? "", b.indication ?? "");
  const ownerSim = stringSimilarity(a.owner_name ?? "", b.owner_name ?? "");

  if (
    targetSim >= 0.8 &&
    indicationSim >= 0.8 &&
    a.target !== "unknown" &&
    a.indication !== "unknown"
  )
    return true;

  if (nameSim >= 0.8 && ownerSim >= 0.8) return true;

  return false;
}

function pickBest<T extends string | undefined>(vals: (T | undefined)[], prefer?: string[]): T {
  const nonUnknown = vals.filter((v) => v && v !== "unknown") as T[];
  if (nonUnknown.length === 0) return (vals[0] ?? "unknown") as T;
  if (prefer) {
    for (const p of prefer) {
      const found = nonUnknown.find((v) => v === p);
      if (found) return found;
    }
  }
  const longest = nonUnknown.reduce((a, b) => ((a ?? "").length >= (b ?? "").length ? a : b));
  return longest;
}

function mergeAssets(assets: Partial<ScoredAsset>[]): Partial<ScoredAsset> {
  const primary = assets[0];
  const allSignals = assets.flatMap((a) => a.signals ?? []);
  const allSourceTypes = [...new Set(assets.flatMap((a) => a.source_types ?? []))] as SourceType[];
  const allSourceUrls = [...new Set(assets.flatMap((a) => a.source_urls ?? []))];
  const allTags = [...new Set(assets.flatMap((a) => a.matching_tags ?? []))];

  const dates = assets
    .map((a) => a.latest_signal_date)
    .filter(Boolean)
    .sort()
    .reverse();

  return {
    ...primary,
    asset_name: pickBest(assets.map((a) => a.asset_name)),
    target: pickBest(assets.map((a) => a.target)),
    modality: pickBest(assets.map((a) => a.modality)),
    indication: pickBest(assets.map((a) => a.indication)),
    development_stage: pickBest(
      assets.map((a) => a.development_stage),
      ["phase 3", "phase 2", "phase 1", "preclinical", "discovery"]
    ),
    owner_name: pickBest(assets.map((a) => a.owner_name)),
    owner_type: pickBest(
      assets.map((a) => a.owner_type),
      ["university"]
    ) as ScoredAsset["owner_type"],
    institution: pickBest(assets.map((a) => a.institution)),
    licensing_status: pickBest(assets.map((a) => a.licensing_status), ["available"]),
    patent_status: pickBest(assets.map((a) => a.patent_status), ["patented", "patent pending"]),
    summary: pickBest(assets.map((a) => a.summary)),
    source_types: allSourceTypes,
    source_urls: allSourceUrls,
    latest_signal_date: dates[0] ?? "",
    matching_tags: allTags.slice(0, 8),
    evidence_count: allSignals.length,
    confidence:
      assets.some((a) => a.confidence === "high") ? "high" :
      assets.some((a) => a.confidence === "medium") ? "medium" :
      "low",
    signals: allSignals,
  };
}

export function clusterAssets(normalized: Partial<ScoredAsset>[]): Partial<ScoredAsset>[] {
  const clusters: Partial<ScoredAsset>[][] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < normalized.length; i++) {
    if (assigned.has(i)) continue;
    const cluster: Partial<ScoredAsset>[] = [normalized[i]];
    assigned.add(i);
    for (let j = i + 1; j < normalized.length; j++) {
      if (assigned.has(j)) continue;
      if (shouldMerge(normalized[i], normalized[j])) {
        cluster.push(normalized[j]);
        assigned.add(j);
      }
    }
    clusters.push(cluster);
  }

  return clusters.map((cluster) => (cluster.length === 1 ? cluster[0] : mergeAssets(cluster)));
}
