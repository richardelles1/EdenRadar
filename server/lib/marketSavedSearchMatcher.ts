import { db } from "../db";
import { eq } from "drizzle-orm";
import { marketSavedSearches, marketAvailabilityNotifications, type MarketListing, type MarketSavedSearch, type MarketSavedSearchFilters } from "@shared/schema";

/**
 * Returns true when a freshly-activated listing matches a buyer's saved search.
 *
 * Match rules:
 *  - therapeuticArea / modality / stage / engagementStatus: exact (case-insensitive trim)
 *  - priceRangeMaxM: listing's priceRangeMin (the floor of the seller's ask) must be ≤ search max
 *  - keyword: case-insensitive substring against assetName, mechanism, aiSummary, therapeuticArea
 *
 * Blinding: blinded fields the buyer cannot see in Browse are excluded from the
 * keyword haystack. So a saved search whose keyword only matches a blinded
 * `assetName` will not fire — the buyer wouldn't see that match if they ran
 * the search manually either.
 */
export function listingMatchesSavedSearch(
  listing: MarketListing,
  search: Pick<MarketSavedSearch, "keyword" | "filters">,
): boolean {
  const f: MarketSavedSearchFilters = search.filters || {};

  const eq = (a: string | null | undefined, b: string | undefined) =>
    !b || (a != null && a.trim().toLowerCase() === b.trim().toLowerCase());

  if (!eq(listing.therapeuticArea, f.therapeuticArea)) return false;
  if (!eq(listing.modality, f.modality)) return false;
  if (!eq(listing.stage, f.stage)) return false;
  if (!eq(listing.engagementStatus, f.engagementStatus)) return false;

  if (f.priceRangeMaxM != null) {
    const max = Number(f.priceRangeMaxM);
    if (Number.isFinite(max) && listing.priceRangeMin != null && listing.priceRangeMin > max) {
      return false;
    }
  }
  if (f.priceRangeMinM != null) {
    const min = Number(f.priceRangeMinM);
    if (Number.isFinite(min) && listing.priceRangeMax != null && listing.priceRangeMax < min) {
      return false;
    }
  }

  const keyword = (search.keyword ?? "").trim();
  if (keyword) {
    const k = keyword.toLowerCase();
    const blindFields = listing.blindFields || {};
    const haystacks: string[] = [];

    // assetName: skip when blinded so a keyword can't "see through" the mask
    if (listing.assetName && !(listing.blind && blindFields.assetName)) {
      haystacks.push(listing.assetName);
    }
    // mechanism: skip when mechanismDetail is blinded
    if (listing.mechanism && !(listing.blind && blindFields.mechanismDetail)) {
      haystacks.push(listing.mechanism);
    }
    // aiSummary and therapeuticArea are always visible on Browse cards
    if (listing.aiSummary) haystacks.push(listing.aiSummary);
    if (listing.therapeuticArea) haystacks.push(listing.therapeuticArea);

    if (!haystacks.some(h => h.toLowerCase().includes(k))) return false;
  }

  return true;
}

/**
 * Fan out a freshly-activated listing to every saved search that matches.
 * Inserts at most one `market_availability_notifications` row per buyer
 * (the unique idx on (user_id, listing_id) also dedupes against the
 * EdenScout-link path).
 *
 * Returns one record per buyer who got a NEW notification (the EdenScout
 * path may have already inserted one — those skip here so callers don't
 * double-send emails).
 */
export async function fanOutSavedSearchesForListing(
  listing: MarketListing,
): Promise<{ userId: string; search: MarketSavedSearch }[]> {
  const allSearches = await db.select().from(marketSavedSearches);
  const matchedSearchByUser = new Map<string, MarketSavedSearch>();
  for (const s of allSearches) {
    if (matchedSearchByUser.has(s.userId)) continue;
    if (listingMatchesSavedSearch(listing, s)) matchedSearchByUser.set(s.userId, s);
  }
  const assetLabel = listing.blind
    ? `a ${listing.therapeuticArea} ${listing.modality} listing`
    : (listing.assetName || `a ${listing.therapeuticArea} listing`);
  const newlyNotified: { userId: string; search: MarketSavedSearch }[] = [];
  await Promise.allSettled(Array.from(matchedSearchByUser.entries()).map(async ([uid, s]) => {
    const message = `New EdenMarket listing matches your saved search "${s.name}" — ${assetLabel}.`;
    const inserted = await db.insert(marketAvailabilityNotifications).values({
      userId: uid,
      listingId: listing.id,
      ingestedAssetId: listing.ingestedAssetId ?? null,
      message,
    }).onConflictDoNothing().returning({ id: marketAvailabilityNotifications.id }).catch(() => []);
    if (inserted.length > 0) newlyNotified.push({ userId: uid, search: s });
  }));
  return newlyNotified;
}
