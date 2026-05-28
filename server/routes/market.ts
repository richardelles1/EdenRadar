import crypto from "crypto";
import path from "path";
import type { Express } from "express";
import multer from "multer";
import { z } from "zod";
import OpenAI from "openai";
import { db } from "../db";
import { eq, and, sql, desc, or, ilike, inArray, isNull, count as drizzleCount } from "drizzle-orm";
import { storage } from "../storage";
import {
  marketEois, marketListings, marketDeals, marketDealTermSheets,
  marketDealObservers, marketDealFeedback, dealComparables,
  marketAvailabilityNotifications, marketSavedSearches, insertMarketSavedSearchSchema,
  ingestedAssets, savedAssets, industryProfiles,
} from "@shared/schema";
import { verifyAnyAuth, tryGetUserId, requireAdmin, getAdminUser } from "../lib/supabaseAuth";
import {
  hasMarketRead, getMarketAccessState,
} from "../lib/marketAccess";
import {
  getEffectiveMarketAccess,
  syncOrgMembersMarketEntitlement,
  userHasMarketRead,
} from "../lib/marketEntitlement";
import { registerUserClient, unregisterUserClient, broadcastToUsers } from "../lib/orgBroadcast";
import {
  sendMarketMutualInterestEmail, sendMarketNdaSignedEmail,
  sendDealRoomMessageEmail, sendDealRoomDocumentEmail,
  sendMarketEoiDeclinedEmail, sendMarketObserverInviteEmail,
  sendMarketFeedbackRequestEmail, sendMarketAdHocEmail,
  sendAdminNotificationEmail, APP_URL,
} from "../email";
import { logAppEvent } from "../lib/routeHelpers";
import { captureException as sentryCaptureException } from "../lib/sentry";
import { searchClinicalTrials } from "../lib/sources/clinicaltrials";
import { searchPatents } from "../lib/sources/patents";
import { createStripe } from "./billing";

// Module-level throttle map for deal-room message emails
const dealMessageEmailLastSent = new Map<string, number>();

export function registerMarketRoutes(app: Express): void {
  // â”€â”€ EdenMarket routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // GET /api/market/activity-summary â€” used by the IndustryDashboard EdenMarket widget.
  // Returns counts that work for both subscribers and non-subscribers so the upsell card
  // always has a number to show (per task #664 spec).
  // Optionally reads bearer token to populate hasAccess + matchingFilters for logged-in users.
  app.get("/api/market/activity-summary", async (req, res) => {
    let newListings7d = 0;
    let matchingFilters = 0;
    let hasAccess = false;

    let activeListings: any[] = [];
    try {
      activeListings = await storage.getMarketListings({ status: "active" });
    } catch {
      activeListings = [];
    }

    try {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      newListings7d = activeListings.filter((l: any) => {
        const ts = l?.createdAt ? new Date(l.createdAt).getTime() : 0;
        return ts >= sevenDaysAgo;
      }).length;
    } catch {
      // ignore
    }

    try {
      const userId = await tryGetUserId(req);
      if (userId) {
        // Task #752 â€” use effective entitlement (admin / stripe / org)
        // so per-user grants and admin revokes are reflected in the
        // upsell widget instead of relying on org.edenMarketAccess only.
        const eff = await getEffectiveMarketAccess(userId);
        hasAccess = eff.access;

        const profile = await storage.getIndustryProfileByUserId(userId);
        if (profile) {
          const tas = (profile.therapeuticAreas || []).map(s => s.toLowerCase());
          const mods = (profile.modalities || []).map(s => s.toLowerCase());
          const stages = (profile.dealStages || []).map(s => s.toLowerCase());
          const hasFilters = tas.length || mods.length || stages.length;
          if (hasFilters) {
            matchingFilters = activeListings.filter((l: any) => {
              const ta = (l?.therapeuticArea || "").toLowerCase();
              const mod = (l?.modality || "").toLowerCase();
              const st = (l?.stage || "").toLowerCase();
              const taOk = !tas.length || tas.includes(ta);
              const modOk = !mods.length || mods.includes(mod);
              const stOk = !stages.length || stages.includes(st);
              return taOk && modOk && stOk;
            }).length;
          }
        }
      }
    } catch {
      // ignore â€” public endpoint, defaults stay at 0/false
    }

    res.json({ newListings7d, matchingFilters, hasAccess });
  });

  // GET /api/market/access â€” check whether the current user has EdenMarket
  // access. Task #752: combines per-user entitlement (admin- or Stripe-granted
  // marketEntitlement on supabase user_metadata) with the legacy org-level
  // edenMarketAccess flag. Either grant route enables access.
  app.get("/api/market/access", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const eff = await getEffectiveMarketAccess(userId);
      res.json({
        access: eff.access,
        orgId: eff.orgState ? (await storage.getOrgForUser(userId))?.id ?? null : null,
        fullAccess: eff.fullAccess,
        inGrace: eff.inGrace,
        marketAccessExpiresAt: eff.marketAccessExpiresAt,
        source: eff.source,
        entitlement: eff.entitlement,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/market/checkout â€” Stripe checkout for EdenMarket subscription
  app.post("/api/market/checkout", verifyAnyAuth, async (req, res) => {
    const stripe = createStripe();
    if (!stripe) return res.status(503).json({ error: "Stripe is not configured on this server" });

    try {
      const userId = req.headers["x-user-id"] as string;
      const priceId = process.env.STRIPE_PRICE_EDENMARKET;
      if (!priceId) return res.status(503).json({ error: "STRIPE_PRICE_EDENMARKET env var not set" });

      let org = await storage.getOrgForUser(userId);
      if (!org) {
        const profile = await storage.getIndustryProfileByUserId(userId).catch(() => null);
        org = await storage.createOrganization({
          name: profile?.companyName?.trim() || "Personal Workspace",
          planTier: "none",
          seatLimit: 1,
          billingMethod: "stripe",
        });
        await storage.addOrgMember({ orgId: org.id, userId, role: "owner", inviteSource: "self_service", inviteStatus: "active" });
        await storage.setIndustryProfileOrg(userId, org.id);
      }

      // Only block when org has full active access (not in grace). Grace orgs
      // must be able to reactivate via this endpoint â€” that's the banner CTA.
      if (getMarketAccessState(org).hasFullAccess) {
        return res.status(409).json({ error: "Your organization already has EdenMarket access." });
      }

      let customerId: string;
      if (org.stripeCustomerId) {
        customerId = org.stripeCustomerId;
      } else {
        const customer = await stripe.customers.create({
          email: org.billingEmail ?? undefined,
          metadata: { orgId: String(org.id), product: "edenmarket" },
        });
        customerId = customer.id;
        await storage.updateOrganization(org.id, { stripeCustomerId: customerId });
      }

      const origin = (req.headers.origin ?? req.headers.referer ?? "").replace(/\/$/, "");
      const baseUrl = origin || `https://${req.headers.host}`;

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${baseUrl}/market?market_session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/market`,
        metadata: { orgId: String(org.id), product: "edenmarket" },
        subscription_data: { metadata: { orgId: String(org.id), product: "edenmarket" } },
      });

      res.json({ url: session.url });
    } catch (err: any) {
      console.error("[market/checkout]", err?.message);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  // GET /api/market/verify-session â€” activate market access after checkout
  app.get("/api/market/verify-session", verifyAnyAuth, async (req, res) => {
    const stripe = createStripe();
    if (!stripe) return res.status(503).json({ error: "Stripe not configured" });

    try {
      const sessionId = String(req.query.market_session_id ?? "");
      if (!sessionId) return res.status(400).json({ error: "market_session_id required" });

      const userId = req.headers["x-user-id"] as string;
      const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["line_items"] });

      // Verify this session is specifically for the EdenMarket product
      if (session.metadata?.product !== "edenmarket") {
        return res.status(400).json({ error: "Session is not for EdenMarket" });
      }

      const safeStatuses = ["paid", "no_payment_required"];
      if (!safeStatuses.includes(session.payment_status)) {
        return res.status(402).json({ error: "Payment not completed" });
      }

      // Optionally validate the price matches the configured EdenMarket price
      const expectedPriceId = process.env.STRIPE_PRICE_EDENMARKET;
      if (expectedPriceId) {
        const lineItems = (session as any).line_items?.data ?? [];
        const hasMarketPrice = lineItems.some((item: any) => item.price?.id === expectedPriceId);
        if (lineItems.length > 0 && !hasMarketPrice) {
          return res.status(400).json({ error: "Session does not contain EdenMarket price" });
        }
      }

      const orgId = parseInt(String(session.metadata?.orgId ?? "0"), 10);
      if (!orgId) return res.status(400).json({ error: "No orgId in session metadata" });

      // Verify the authenticated user belongs to this org
      const userOrg = await storage.getOrgForUser(userId);
      if (!userOrg || userOrg.id !== orgId) {
        return res.status(403).json({ error: "User is not a member of the purchasing org" });
      }

      const subId = typeof session.subscription === "string" ? session.subscription : (session.subscription as any)?.id ?? "";

      await storage.updateOrganization(orgId, {
        edenMarketAccess: true,
        edenMarketStripeSubId: subId || undefined,
        // Task #714 â€” explicit reactivation clears any prior grace state.
        marketAccessExpiresAt: null,
        marketGraceEmailSentAt: null,
      });

      if (subId) {
        await storage.createMarketSubscription({ orgId, stripeSubscriptionId: subId, status: "active" });
      }

      // Task #752 â€” mirror the org's new active state to each member's
      // per-user entitlement so admin-granted and Stripe-granted access
      // share a single source of truth on the client.
      await syncOrgMembersMarketEntitlement(orgId, true);

      res.json({ access: true });
    } catch (err: any) {
      console.error("[market/verify-session]", err?.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Eden Signal Score â€” intelligence-derived: uses linked EdenScout asset enrichment quality,
  // patent/IP signals, and clinical-stage trials inference. Falls back to listing-field score
  // when no ingestedAsset link exists.
  type IngestedAssetSignals = {
    completenessScore: number | null;
    patentStatus: string | null;
    ipType: string | null;
    developmentStage: string | null;
    mechanismOfAction: string | null;
    target: string | null;
  };
  function edenSignalScore(
    l: { ingestedAssetId?: number | null; mechanism?: string | null; priceRangeMin?: number | null; aiSummary?: string | null; therapeuticArea?: string | null; modality?: string | null; stage?: string | null; engagementStatus?: string | null },
    linked?: IngestedAssetSignals | null
  ): number {
    let s = 0;
    if (l.ingestedAssetId && linked) {
      s += 30;  // EdenScout linkage base
      // EDEN enrichment completeness (proportional, up to 20 pts)
      if (linked.completenessScore != null) s += Math.round((linked.completenessScore / 100) * 20);
      // Patents signal: asset has known IP status
      if (linked.patentStatus || linked.ipType) s += 10;
      // Trials signal: clinical stage implies registered trials
      const clinicalStages = ["phase 1", "phase 2", "phase 3", "approved", "phase i", "phase ii", "phase iii"];
      if (linked.developmentStage && clinicalStages.includes(linked.developmentStage.toLowerCase())) s += 10;
      // Scientific specificity from EdenScout intelligence
      if (linked.mechanismOfAction || linked.target) s += 10;
    } else {
      if (l.ingestedAssetId) s += 30; // linked but asset not resolved yet
    }
    // Listing-level market signals (seller-provided)
    if (l.priceRangeMin) s += 10;
    if (l.aiSummary) s += 5;
    if (l.mechanism) s += 5;
    if (l.therapeuticArea && l.modality && l.stage) s += 10; // full classification
    if (l.engagementStatus && l.engagementStatus !== "closed") s += 5;
    return Math.min(100, s);
  }

  // â”€â”€ Per-field blinding helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Sellers and admins always see the full record. For everyone else we mask
  // each field independently based on the listing's `blindFields` map. The
  // legacy `blind` boolean is treated as a derived "any field masked" flag.
  type BlindFields = NonNullable<typeof marketListings.$inferSelect.blindFields>;
  function normalizeBlindFields(l: { blind?: boolean | null; blindFields?: BlindFields | null }): BlindFields {
    const bf = (l.blindFields ?? {}) as BlindFields;
    // Backwards-compat: if a legacy listing has blind=true and no per-field map,
    // treat it as masking name + institution + inventor names.
    if (l.blind && !bf.assetName && !bf.institution && !bf.inventorNames && !bf.exactPatentIds && !bf.mechanismDetail) {
      return { assetName: true, institution: true, inventorNames: true };
    }
    return bf;
  }
  function anyBlinded(bf: BlindFields): boolean {
    return !!(bf.assetName || bf.institution || bf.inventorNames || bf.exactPatentIds || bf.mechanismDetail);
  }
  function maskListingForViewer<T extends typeof marketListings.$inferSelect>(listing: T, isPrivileged: boolean): T {
    if (isPrivileged) return listing;
    const bf = normalizeBlindFields(listing);
    const out: T = { ...listing };
    if (bf.assetName) out.assetName = null;
    if (bf.mechanismDetail) out.mechanism = null;
    if (bf.exactPatentIds) {
      out.ipStatus = null;
      out.ipSummary = null;
    }
    // Keep legacy `blind` flag in sync as a derived "any field masked" indicator.
    out.blind = anyBlinded(bf);
    return out;
  }
  // For the intelligence panel: linked EdenScout enrichment can re-leak fields
  // the seller has chosen to blind. Mask the corresponding sub-fields.
  function maskEdenEnrichment<T extends Record<string, unknown> | null>(enrichment: T, bf: BlindFields, isPrivileged: boolean): T {
    if (isPrivileged || !enrichment) return enrichment;
    const e = { ...enrichment } as Record<string, unknown>;
    if (bf.assetName) e.assetName = null;
    if (bf.institution) {
      e.institution = null;
      e.sourceUrl = null; // URL itself can identify the institution
    }
    if (bf.inventorNames) {
      e.inventors = null;
    }
    if (bf.mechanismDetail) {
      e.mechanismOfAction = null;
      e.target = null;
      e.innovationClaim = null;
    }
    if (bf.exactPatentIds) {
      e.ipType = null;
    }
    return e as T;
  }

  // GET /api/market/listings â€” buyer feed (active listings)
  app.get("/api/market/listings", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });

      const { therapeuticArea, modality, stage, engagementStatus } = req.query as Record<string, string | undefined>;
      const listings = await storage.getMarketListings({ status: "active", therapeuticArea, modality, stage, engagementStatus });

      // Batch-fetch linked EdenScout assets for signal score computation
      const linkedIds = [...new Set(listings.map(l => l.ingestedAssetId).filter((id): id is number => id != null))];
      const linkedAssets = linkedIds.length > 0
        ? await db.select({
            id: ingestedAssets.id,
            completenessScore: ingestedAssets.completenessScore,
            patentStatus: ingestedAssets.patentStatus,
            ipType: ingestedAssets.ipType,
            developmentStage: ingestedAssets.developmentStage,
            mechanismOfAction: ingestedAssets.mechanismOfAction,
            target: ingestedAssets.target,
          }).from(ingestedAssets).where(inArray(ingestedAssets.id, linkedIds))
        : [];
      const linkedMap = new Map(linkedAssets.map(a => [a.id, a]));

      const eoiCounts = await Promise.all(listings.map(l => storage.getMarketEoiCount(l.id)));
      const myEois = await storage.getMarketEoisByBuyer(userId);
      const myEoiMap = new Map(myEois.map(e => [e.listingId, e.status]));

      // Batch resolve seller-verification status off the listing's owning org
      // (listing.orgId is set at creation time â€” see createMarketListing). This is
      // architecturally sounder than going through the seller user's current org
      // and is robust if a user later belongs to multiple orgs. We expose only a
      // boolean â€” never leak the seller's org name or other identifying info
      // (esp. for blind listings).
      const orgIds = [...new Set(listings.map(l => l.orgId).filter((id): id is number => id != null))];
      const orgs = await Promise.all(orgIds.map(oid => storage.getOrganization(oid).catch(() => null)));
      const orgVerifiedMap = new Map<number, boolean>();
      orgIds.forEach((oid, i) => orgVerifiedMap.set(oid, !!orgs[i]?.marketSellerVerifiedAt));

      const result = listings.map((l, i) => {
        const isPrivileged = l.sellerId === userId;
        const masked = maskListingForViewer(l, isPrivileged);
        return {
          ...masked,
          eoiCount: eoiCounts[i],
          myEoiStatus: myEoiMap.get(l.id) ?? null,
          edenSignalScore: edenSignalScore(l, l.ingestedAssetId ? linkedMap.get(l.ingestedAssetId) ?? null : null),
          sellerVerified: l.orgId != null ? (orgVerifiedMap.get(l.orgId) ?? false) : false,
        };
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/market/listings â€” create listing (seller)
  app.post("/api/market/listings", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      // Task #714 â€” strict gate: writes blocked during 30-day grace period.
      const accessState = getMarketAccessState(org);
      if (!accessState.hasFullAccess || !org) {
        return res.status(403).json(accessState.inGrace
          ? { error: "EdenMarket is read-only during your grace period â€” reactivate your subscription to create listings.", marketGrace: true, marketAccessExpiresAt: accessState.expiresAt }
          : { error: "EdenMarket subscription required" });
      }

      const schema = z.object({
        therapeuticArea: z.string().min(1),
        modality: z.string().min(1),
        stage: z.string().min(1),
        assetName: z.string().optional().nullable(),
        blind: z.boolean().default(false),
        blindFields: z.object({
          assetName: z.boolean().optional(),
          institution: z.boolean().optional(),
          inventorNames: z.boolean().optional(),
          exactPatentIds: z.boolean().optional(),
          mechanismDetail: z.boolean().optional(),
        }).optional(),
        ingestedAssetId: z.number().int().optional().nullable(),
        milestoneHistory: z.string().optional().nullable(),
        mechanism: z.string().optional().nullable(),
        ipStatus: z.string().optional().nullable(),
        ipSummary: z.string().optional().nullable(),
        askingPrice: z.string().optional().nullable(),
        priceRangeMin: z.number().int().optional().nullable(),
        priceRangeMax: z.number().int().optional().nullable(),
        engagementStatus: z.string().default("actively_seeking"),
        status: z.enum(["draft", "pending"]).optional(),
        // TTO fields
        trlLevel: z.number().int().min(1).max(9).optional().nullable(),
        patentNumbers: z.string().optional().nullable(),
        inventorAffiliation: z.string().optional().nullable(),
        ttoRefNumber: z.string().optional().nullable(),
      });

      const data = schema.parse(req.body);
      // Derive `blind` boolean from per-field map so the legacy badge flag stays correct.
      const blindFieldsIn = data.blindFields ?? {};
      data.blindFields = blindFieldsIn;
      data.blind = !!(blindFieldsIn.assetName || blindFieldsIn.institution || blindFieldsIn.inventorNames || blindFieldsIn.exactPatentIds || blindFieldsIn.mechanismDetail) || data.blind;

      // Verify ingestedAssetId exists if provided
      if (data.ingestedAssetId != null) {
        const [linked] = await db.select({ id: ingestedAssets.id }).from(ingestedAssets).where(eq(ingestedAssets.id, data.ingestedAssetId)).limit(1);
        if (!linked) return res.status(400).json({ error: "ingestedAssetId does not reference a valid EdenScout asset." });
      }

      // Generate AI summary using GPT-4o-mini
      let aiSummary: string | null = null;
      try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const prompt = `Write a concise one-paragraph deal summary for a biopharma asset listing:
Therapeutic Area: ${data.therapeuticArea}
Modality: ${data.modality}
Clinical Stage: ${data.stage}
Mechanism: ${data.mechanism || "Not specified"}
IP Status: ${data.ipStatus || "Not specified"}
${data.assetName && !data.blind ? `Asset Name: ${data.assetName}` : "(Blind listing â€” name withheld)"}
Price Range: ${data.priceRangeMin ? `$${data.priceRangeMin}Mâ€“$${data.priceRangeMax}M` : data.askingPrice || "Not disclosed"}

Write in a professional deal memo tone. 2â€“4 sentences. Focus on the strategic value and fit.`;

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 180,
        });
        aiSummary = completion.choices[0]?.message?.content?.trim() ?? null;
      } catch (aiErr: any) {
        console.warn("[market/listings] AI summary failed:", aiErr?.message);
      }

      const listingStatus = data.status === "draft" ? "draft" : "pending";
      const listing = await storage.createMarketListing({
        ...data,
        sellerId: userId,
        orgId: org.id,
        aiSummary,
        status: listingStatus,
      });

      res.json(listing);
    } catch (err: any) {
      console.error("[market/listings POST]", err?.message);
      res.status(400).json({ error: err.message });
    }
  });

  // GET /api/market/listings/suggest-asset â€” fuzzy search ingested_assets for listing creation assist
  // IMPORTANT: Must be declared before /:id to avoid Express treating "suggest-asset" as a param value
  app.get("/api/market/listings/suggest-asset", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const q = String(req.query.q ?? "").trim();
      const ta = String(req.query.ta ?? "").trim();
      const query = [q, ta].filter(Boolean).join(" ");
      if (query.length < 2) return res.json([]);

      // Fetch a wider pool, then re-rank: institution-aware matches rise to top
      const pool = await storage.keywordSearchIngestedAssets(query, 12);
      // Institution signal: if query contains a word that appears in institution name, boost it
      const qLower = q.toLowerCase();
      const scored = pool.map(r => {
        let rank = 0;
        if (r.institution && qLower && r.institution.toLowerCase().includes(qLower)) rank += 10;
        if (r.completenessScore) rank += r.completenessScore / 100; // tiebreak by data quality
        return { r, rank };
      });
      scored.sort((a, b) => b.rank - a.rank);
      const results = scored.slice(0, 3).map(x => x.r); // hard cap at 3 suggestions
      res.json(results.map(r => ({
        id: r.id,
        assetName: r.assetName,
        institution: r.institution,
        modality: r.modality,
        developmentStage: r.developmentStage,
        indication: r.indication,
        target: r.target,
        innovationClaim: r.innovationClaim,
        mechanismOfAction: r.mechanismOfAction,
        ipType: r.ipType,
        completenessScore: r.completenessScore,
      })));
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/market/listings/:id â€” single listing detail
  app.get("/api/market/listings/:id", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });

      const id = parseInt(String(req.params.id), 10);
      const listing = await storage.getMarketListing(id);
      if (!listing) return res.status(404).json({ error: "Listing not found" });

      const isSeller = listing.sellerId === userId;
      if (!isSeller && listing.status !== "active") {
        return res.status(404).json({ error: "Listing not found" });
      }

      const eoiCount = await storage.getMarketEoiCount(id);
      const myEoi = await storage.getBuyerEoiForListing(id, userId);
      // Derive seller verification from the listing's owning org (listing.orgId),
      // not from the seller user's current org membership.
      const sellerOrg = listing.orgId != null
        ? await storage.getOrganization(listing.orgId).catch(() => null)
        : null;

      const masked = maskListingForViewer(listing, isSeller);
      res.json({
        ...masked,
        blindFields: normalizeBlindFields(listing),
        eoiCount,
        myEoi: myEoi ?? null,
        sellerVerified: !!sellerOrg?.marketSellerVerifiedAt,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/market/listings/:id/intelligence â€” Eden Intelligence panel data
  app.get("/api/market/listings/:id/intelligence", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid listing id" });

      const listing = await storage.getMarketListing(id);
      if (!listing) return res.status(404).json({ error: "Listing not found" });

      // Admin bypass â€” Supabase Bearer token + ADMIN_EMAILS allowlist
      const isAdmin = !!(await getAdminUser(req));

      if (!isAdmin) {
        const org = await storage.getOrgForUser(userId);
        if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
        const isSeller = listing.sellerId === userId;
        if (!isSeller && listing.status !== "active") return res.status(404).json({ error: "Not found" });
      }

      const searchQuery = [listing.therapeuticArea, listing.modality].filter(Boolean).join(" ");
      const patentQuery = [listing.therapeuticArea, listing.mechanism?.slice(0, 80) ?? ""].filter(Boolean).join(" ");

      // External API calls (ClinicalTrials.gov, patents) can take several seconds on cold paths.
      // Cap them at 900ms so the overall response stays well within the 1500ms SLA budget.
      const withTimeout = <T>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
        Promise.race([p, new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))]);

      // Phase 1: fast DB queries (parallel) â€” resolve linked asset first so biology
      // is available for the scored comparables query in Phase 2.
      const [relatedRaw, linkedRaw] = await Promise.allSettled([
        withTimeout(storage.keywordSearchIngestedAssets(searchQuery, 10), 2000, []),
        listing.ingestedAssetId
          ? db.select().from(ingestedAssets).where(eq(ingestedAssets.id, listing.ingestedAssetId)).limit(1)
          : Promise.resolve([] as typeof ingestedAssets.$inferSelect[]),
      ]);

      const linkedEarly = linkedRaw.status === "fulfilled" ? (linkedRaw.value[0] ?? null) : null;

      // Phase 2: external API calls + DB comparables query (parallel, uses biology from linked)
      const [trialsRaw, patentsRaw, compsRaw] = await Promise.allSettled([
        withTimeout(searchClinicalTrials(listing.therapeuticArea, 5).catch(() => []), 900, []),
        withTimeout(searchPatents(patentQuery, 5).catch(() => []), 900, []),
        withTimeout(storage.queryDealComparables({
          modality: listing.modality ?? null,
          biology: linkedEarly?.biology ?? null,
          therapeuticArea: listing.therapeuticArea ?? null,
          stage: listing.stage ?? null,
          limit: 5,
        }), 2000, []),
      ]);

      const relatedTtoAssets = relatedRaw.status === "fulfilled"
        ? relatedRaw.value
            .filter(a => a.id !== listing.ingestedAssetId)
            .slice(0, 5)
            .map(a => ({ id: a.id, assetName: a.assetName, institution: a.institution, modality: a.modality, developmentStage: a.developmentStage, indication: a.indication, completenessScore: a.completenessScore }))
        : [];

      const linked = linkedEarly;

      const activeTrials = trialsRaw.status === "fulfilled"
        ? trialsRaw.value.slice(0, 5).map(s => ({ title: s.title, url: s.url, date: s.date, stage: s.stage_hint, sponsor: s.institution_or_sponsor }))
        : [];

      const relatedPatents = patentsRaw.status === "fulfilled"
        ? patentsRaw.value.slice(0, 5).map(s => ({ title: s.title, url: s.url, date: s.date, owner: s.institution_or_sponsor || s.authors_or_owner }))
        : [];

      // Comparable deals: from deal_comparables table (SEC 8-K archived deals), scored by modality + TA + stage
      const comparableDeals = compsRaw.status === "fulfilled" ? compsRaw.value : [];

      const rawEnrichment = linked ? {
        assetName: linked.assetName,
        institution: linked.institution,
        target: linked.target,
        mechanismOfAction: linked.mechanismOfAction,
        innovationClaim: linked.innovationClaim,
        unmetNeed: linked.unmetNeed,
        comparableDrugs: linked.comparableDrugs,
        licensingReadiness: linked.licensingReadiness,
        completenessScore: linked.completenessScore,
        ipType: linked.ipType,
        sourceUrl: linked.sourceUrl,
        inventors: linked.inventors,
      } : null;
      const isPrivilegedView = isAdmin || listing.sellerId === userId;
      const bf = normalizeBlindFields(listing);
      const edenEnrichment = maskEdenEnrichment(rawEnrichment, bf, isPrivilegedView);

      res.json({ relatedTtoAssets, activeTrials, relatedPatents, comparableDeals, edenEnrichment, blindFields: bf, linkedAssetId: listing.ingestedAssetId ?? null });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PATCH /api/market/listings/:id â€” update own listing
  app.patch("/api/market/listings/:id", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const id = parseInt(String(req.params.id), 10);
      const listing = await storage.getMarketListing(id);
      if (!listing) return res.status(404).json({ error: "Listing not found" });
      if (listing.sellerId !== userId) return res.status(403).json({ error: "Forbidden" });

      // Sellers cannot self-activate from draft/pending â€” only admins can move a listing to active.
      // Exception: paused listings can be resumed (pausedâ†’active) because they were already admin-approved.
      const allowed = z.object({
        assetName: z.string().optional().nullable(),
        blind: z.boolean().optional(),
        blindFields: z.object({
          assetName: z.boolean().optional(),
          institution: z.boolean().optional(),
          inventorNames: z.boolean().optional(),
          exactPatentIds: z.boolean().optional(),
          mechanismDetail: z.boolean().optional(),
        }).optional(),
        ingestedAssetId: z.number().int().optional().nullable(),
        therapeuticArea: z.string().optional(),
        modality: z.string().optional(),
        stage: z.string().optional(),
        milestoneHistory: z.string().optional().nullable(),
        mechanism: z.string().optional().nullable(),
        ipStatus: z.string().optional().nullable(),
        ipSummary: z.string().optional().nullable(),
        askingPrice: z.string().optional().nullable(),
        priceRangeMin: z.number().int().optional().nullable(),
        priceRangeMax: z.number().int().optional().nullable(),
        engagementStatus: z.string().optional(),
        status: z.enum(["active", "paused", "closed", "pending"]).optional(),
      });

      const data = allowed.parse(req.body);

      // Derive `blind` boolean from per-field map when provided.
      if (data.blindFields !== undefined) {
        const bf = data.blindFields ?? {};
        data.blind = !!(bf.assetName || bf.institution || bf.inventorNames || bf.exactPatentIds || bf.mechanismDetail);
      }

      // Verify ingestedAssetId exists if provided
      if (data.ingestedAssetId != null) {
        const [linked] = await db.select({ id: ingestedAssets.id }).from(ingestedAssets).where(eq(ingestedAssets.id, data.ingestedAssetId)).limit(1);
        if (!linked) return res.status(400).json({ error: "ingestedAssetId does not reference a valid EdenScout asset." });
      }

      // Block self-activation from draft or pending (must go through admin review)
      if (data.status === "active" && listing.status !== "paused") {
        return res.status(403).json({ error: "Listings can only be activated by admin. Submit for review first." });
      }
      // Block setting back to pending unless explicitly re-submitting a draft
      if (data.status === "pending" && listing.status !== "draft") {
        return res.status(400).json({ error: "Only draft listings can be submitted for review." });
      }

      const updated = await storage.updateMarketListing(id, userId, data);
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // DELETE /api/market/listings/:id
  app.delete("/api/market/listings/:id", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const id = parseInt(String(req.params.id), 10);
      const listing = await storage.getMarketListing(id);
      if (!listing) return res.status(404).json({ error: "Listing not found" });
      if (listing.sellerId !== userId) return res.status(403).json({ error: "Forbidden" });
      await storage.deleteMarketListing(id, userId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/market/my-listings â€” seller's own listings
  app.get("/api/market/my-listings", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const listings = await storage.getMarketListingsBySeller(userId);
      const eoiCounts = await Promise.all(listings.map(l => storage.getMarketEoiCount(l.id)));
      res.json(listings.map((l, i) => ({ ...l, eoiCount: eoiCounts[i] })));
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/market/eois â€” submit EOI
  app.post("/api/market/eois", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      // Task #714 â€” strict gate: writes blocked during 30-day grace period.
      const eoiAccessState = getMarketAccessState(org);
      if (!eoiAccessState.hasFullAccess) {
        return res.status(403).json(eoiAccessState.inGrace
          ? { error: "EdenMarket is read-only during your grace period â€” reactivate your subscription to submit EOIs.", marketGrace: true, marketAccessExpiresAt: eoiAccessState.expiresAt }
          : { error: "EdenMarket subscription required" });
      }

      const schema = z.object({
        listingId: z.number().int(),
        company: z.string().min(1),
        role: z.string().min(1),
        rationale: z.string().min(1),
        budgetRange: z.string().optional().nullable(),
        timeline: z.string().optional().nullable(),
      });

      const data = schema.parse(req.body);

      const listing = await storage.getMarketListing(data.listingId);
      if (!listing || listing.status !== "active") {
        return res.status(404).json({ error: "Listing not found or not active" });
      }

      const existing = await storage.getBuyerEoiForListing(data.listingId, userId);
      if (existing) return res.status(409).json({ error: "You have already submitted an EOI for this listing" });

      const eoi = await storage.createMarketEoi({ ...data, buyerId: userId });

      // Notify admin
      try {
        await sendAdminNotificationEmail(
          `New EOI submitted â€” Listing #${data.listingId}`,
          `<p>A new Expression of Interest has been submitted for listing #${data.listingId}.</p>
           <p>Company: ${data.company}<br>Role: ${data.role}</p>
           <p><a href="${APP_URL}/market/listing/${data.listingId}">View listing</a></p>`
        );
      } catch (e) { console.warn("[market] admin EOI-submitted email failed", e); }

      // Notify seller via their org billing email
      try {
        const sellerOrg = await storage.getOrgForUser(listing.sellerId);
        const sellerEmail = sellerOrg?.billingEmail;
        if (sellerEmail) {
          const assetLabel = listing.blind ? `a blind ${listing.therapeuticArea} ${listing.modality} listing` : (listing.assetName || `Listing #${listing.id}`);
          await sendMarketAdHocEmail(
            sellerEmail,
            `New Expression of Interest received â€” ${assetLabel}`,
            `<p>A qualified buyer has submitted an Expression of Interest for <strong>${assetLabel}</strong>.</p>
             <p>Log in to your <a href="${APP_URL}/market/seller">Seller Dashboard</a> to review the EOI details.</p>
             <p style="font-size:12px;color:#9ca3af">Buyer identity is kept confidential until you accept and both parties agree to reveal.</p>`
          );
        }
      } catch (e) { console.warn("[market] seller EOI-submitted email failed", e); }

      res.json(eoi);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // GET /api/market/my-eois â€” buyer's submitted EOIs
  app.get("/api/market/my-eois", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const eois = await storage.getMarketEoisByBuyer(userId);
      res.json(eois);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/market/seller/eois â€” EOIs on seller's listings
  app.get("/api/market/seller/eois", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const listings = await storage.getMarketListingsBySeller(userId);
      const listingIds = listings.map(l => l.id);
      if (!listingIds.length) return res.json([]);

      const eoisByListing = await Promise.all(
        listingIds.map(async id => {
          const eois = await storage.getMarketEoisForListing(id);
          // Sellers see full buyer details (company/role/rationale) for all EOIs
          // so they can make an informed accept/decline decision â€” this is the
          // point of the seller review step. Deep financial/IP data stays gated
          // behind NDA inside the deal room.
          return { listingId: id, eois };
        })
      );
      res.json(eoisByListing);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // â”€â”€ Admin: EdenMarket â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // All admin/market routes are mounted under /api/admin and protected by the
  // requireAdmin middleware (Supabase Bearer token + ADMIN_EMAILS allowlist).

  async function logDealEvent(dealId: number, actorId: string, eventType: string, detail?: string) {
    try {
      await db.execute(
        sql`INSERT INTO market_deal_events (deal_id, actor_id, event_type, detail) VALUES (${dealId}, ${actorId}, ${eventType}, ${detail ?? null})`
      );
    } catch (e) { console.warn("[market] deal event log failed", dealId, eventType, e); }
  }

  // Returns a label (org name, falling back to "the seller"/"the buyer") and
  // the org's billing email for the *other* party in a deal.
  async function resolveDealRecipient(deal: { id: number; sellerId: string; buyerId: string; listingId: number }, actorId: string) {
    const recipientId = deal.sellerId === actorId ? deal.buyerId : deal.sellerId;
    const actorIsSeller = deal.sellerId === actorId;
    const [recipientOrg, actorOrg, listing] = await Promise.all([
      storage.getOrgForUser(recipientId).catch(() => null),
      storage.getOrgForUser(actorId).catch(() => null),
      storage.getMarketListing(deal.listingId).catch(() => null),
    ]);
    const assetLabel = listing?.blind
      ? `a ${listing.therapeuticArea} ${listing.modality} opportunity`
      : (listing?.assetName || `Listing #${deal.listingId}`);
    return {
      recipientId,
      recipientEmail: recipientOrg?.billingEmail ?? null,
      recipientName: recipientOrg?.name ?? "",
      // We never reveal the counterparty's org name on a *blind* listing â€”
      // identity stays generic until the seller un-blinds it.
      actorLabel: listing?.blind
        ? (actorIsSeller ? "The seller" : "A prospective buyer")
        : (actorOrg?.name ?? (actorIsSeller ? "The seller" : "The buyer")),
      assetLabel,
      dealUrl: `${APP_URL}/market/deals/${deal.id}`,
    };
  }

  async function notifyDealRoomDocument(deal: { id: number; sellerId: string; buyerId: string; listingId: number }, uploaderId: string, fileName: string) {
    const r = await resolveDealRecipient(deal, uploaderId);
    if (!r.recipientEmail) return; // no email on file â†’ nothing to do
    await sendDealRoomDocumentEmail(r.recipientEmail, r.recipientName, r.actorLabel, r.dealUrl, r.assetLabel, fileName);
  }

  async function notifyDealRoomMessage(deal: { id: number; sellerId: string; buyerId: string; listingId: number }, senderId: string, body: string) {
    const r = await resolveDealRecipient(deal, senderId);
    if (!r.recipientEmail) return;
    // Throttle: at most one message email per (deal, recipient) per hour.
    const now = Date.now();
    const key = `${deal.id}:${r.recipientId}`;
    const last = dealMessageEmailLastSent.get(key) ?? 0;
    if (now - last < 60 * 60 * 1000) return;
    dealMessageEmailLastSent.set(key, now);
    try {
      await sendDealRoomMessageEmail(r.recipientEmail, r.recipientName, r.actorLabel, r.dealUrl, r.assetLabel, body);
    } catch (e) {
      // Roll back the throttle stamp so a transient send failure doesn't
      // silence the next legitimate notification for an hour.
      dealMessageEmailLastSent.delete(key);
      throw e;
    }
  }

  app.get("/api/admin/market/stats", async (req, res) => {
    try {
      const stats = await storage.getMarketAdminStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/market/listings", async (req, res) => {
    try {
      const { status } = req.query as { status?: string };
      const listings = await storage.getMarketListings(status ? { status } : undefined);
      const eoiCounts = await Promise.all(listings.map(l => storage.getMarketEoiCount(l.id)));
      res.json(listings.map((l, i) => ({ ...l, eoiCount: eoiCounts[i] })));
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/admin/market/listings/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      const schema = z.object({
        status: z.enum(["active", "pending", "paused", "closed", "draft"]),
        adminNote: z.string().optional(),
      });
      const data = schema.parse(req.body);
      const prevListing = await storage.getMarketListing(id);
      const updated = await storage.adminUpdateMarketListing(id, data);

      // EdenScout â†’ EdenMarket availability signal:
      // When a listing goes "active" for the first time and it's linked to an ingestedAsset,
      // notify all users who have that asset saved in their EdenScout portfolio.
      if (data.status === "active" && prevListing?.status !== "active" && updated?.ingestedAssetId) {
        const assetId = updated.ingestedAssetId;
        try {
          const saved = await db.select({ userId: savedAssets.userId })
            .from(savedAssets)
            .where(eq(savedAssets.ingestedAssetId, assetId))
            .then(rows => [...new Set(rows.map(r => r.userId).filter((u): u is string => u !== null))]);

          const assetLabel = updated.blind
            ? `a ${updated.therapeuticArea} ${updated.modality} asset`
            : (updated.assetName || `a ${updated.therapeuticArea} asset`);

          const notifMessage = `An asset you track in EdenScout â€” ${assetLabel} â€” is now listed in EdenMarket.`;
          const { enqueueListingAvailable } = await import("../lib/marketEmailCoalescer");
          await Promise.allSettled(saved.map(async uid => {
            // Insert in-app notification (deduplicated by user+listing via DB unique idx)
            await db.insert(marketAvailabilityNotifications).values({
              userId: uid,
              listingId: updated.id,
              ingestedAssetId: assetId,
              message: notifMessage,
            }).onConflictDoNothing().catch(() => {});
            // Enqueue email â€” coalesced per-user with a 5-min debounce so a bulk
            // status flip becomes one summary email rather than one per listing.
            const userOrg = await storage.getOrgForUser(uid);
            const email = userOrg?.billingEmail;
            if (email) {
              enqueueListingAvailable(email, updated.id, assetLabel);
            }
          }));
        } catch (e) { console.warn("[market] availability signal emails failed", e); }
      }

      // Saved-search fan-out (Task #713): on first activation, evaluate every
      // saved search against this listing and notify matching buyers â€” once
      // per (user, listing) regardless of how many of their searches matched
      // and on top of the EdenScout-link path above.
      if (data.status === "active" && prevListing?.status !== "active" && updated) {
        try {
          const { fanOutSavedSearchesForListing } = await import("../lib/marketSavedSearchMatcher");
          const { enqueueListingAvailable } = await import("../lib/marketEmailCoalescer");
          const newlyNotified = await fanOutSavedSearchesForListing(updated);
          const assetLabel = updated.blind
            ? `a ${updated.therapeuticArea} ${updated.modality} listing`
            : (updated.assetName || `a ${updated.therapeuticArea} listing`);
          await Promise.allSettled(newlyNotified.map(async ({ userId: uid }: { userId: string }) => {
            const userOrg = await storage.getOrgForUser(uid);
            const email = userOrg?.billingEmail;
            if (email) enqueueListingAvailable(email, updated.id, assetLabel);
          }));
        } catch (e) { console.warn("[market] saved-search fan-out failed", e); }
      }

      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // â”€â”€ Saved Searches (Task #713) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  app.get("/api/market/saved-searches", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const rows = await db.select()
        .from(marketSavedSearches)
        .where(eq(marketSavedSearches.userId, userId))
        .orderBy(desc(marketSavedSearches.createdAt));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/market/saved-searches", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const data = insertMarketSavedSearchSchema.parse({ ...req.body, userId });
      try {
        const [row] = await db.insert(marketSavedSearches).values({
          userId,
          name: data.name,
          keyword: data.keyword ?? null,
          filters: data.filters ?? {},
        }).returning();
        res.json(row);
      } catch (e: any) {
        if (String(e?.message || "").toLowerCase().includes("unique")) {
          return res.status(409).json({ error: "A saved search with that name already exists" });
        }
        throw e;
      }
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch("/api/market/saved-searches/:id", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const id = parseInt(String(req.params.id), 10);
      const schema = z.object({ name: z.string().min(1).max(120) });
      const { name } = schema.parse(req.body);
      try {
        const [row] = await db.update(marketSavedSearches)
          .set({ name })
          .where(and(eq(marketSavedSearches.id, id), eq(marketSavedSearches.userId, userId)))
          .returning();
        if (!row) return res.status(404).json({ error: "Saved search not found" });
        res.json(row);
      } catch (e: any) {
        if (String(e?.message || "").toLowerCase().includes("unique")) {
          return res.status(409).json({ error: "A saved search with that name already exists" });
        }
        throw e;
      }
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete("/api/market/saved-searches/:id", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const id = parseInt(String(req.params.id), 10);
      const [row] = await db.delete(marketSavedSearches)
        .where(and(eq(marketSavedSearches.id, id), eq(marketSavedSearches.userId, userId)))
        .returning();
      if (!row) return res.status(404).json({ error: "Saved search not found" });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // GET /api/market/notifications â€” unread EdenScoutâ†’EdenMarket availability alerts for current user
  app.get("/api/market/notifications", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const rows = await db.select()
        .from(marketAvailabilityNotifications)
        .where(and(
          eq(marketAvailabilityNotifications.userId, userId),
          isNull(marketAvailabilityNotifications.readAt),
        ))
        .orderBy(desc(marketAvailabilityNotifications.createdAt))
        .limit(20);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PATCH /api/market/notifications/read â€” mark all notifications read for current user
  app.patch("/api/market/notifications/read", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      await db.execute(sql`UPDATE market_availability_notifications SET read_at = NOW() WHERE user_id = ${userId} AND read_at IS NULL`);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/market/eois", async (req, res) => {
    try {
      const listings = await storage.getMarketListings();
      const result = await Promise.all(
        listings.map(async l => ({ listing: l, eois: await storage.getMarketEoisForListing(l.id) }))
      );
      res.json(result.filter(r => r.eois.length > 0));
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/market/subscribers", async (req, res) => {
    try {
      const orgs = await storage.getMarketSubscriberOrgs();
      res.json(orgs);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PATCH /api/admin/orgs/:id/market-access â€” admin grace-period controls
  // Task #733. Two operations:
  //   action="extend" + days=N (default 30) â†’ push marketAccessExpiresAt forward
  //     by N days from the current expiry (or from now if no expiry set).
  //     edenMarketAccess remains true. Useful for support extensions.
  //   action="revoke" â†’ immediately set edenMarketAccess=false and clear
  //     marketAccessExpiresAt. Use for fraud / compliance / hard-cancel.
  // All transitions emit a logAppEvent for audit.
  app.patch("/api/admin/orgs/:id/market-access", async (req, res) => {
    try {
      const orgId = parseInt(String(req.params.id), 10);
      if (isNaN(orgId)) return res.status(400).json({ error: "Invalid org id" });

      const schema = z.object({
        action: z.enum(["extend", "revoke"]),
        days: z.number().int().min(1).max(365).optional(),
      });
      const { action, days } = schema.parse(req.body);

      const org = await storage.getOrganization(orgId);
      if (!org) return res.status(404).json({ error: "Organization not found" });

      const adminUser = await getAdminUser(req);
      const adminUserId = adminUser?.id ?? "admin";
      const adminEmail = adminUser?.email ?? null;

      let updated;
      if (action === "extend") {
        const addDays = days ?? 30;
        const base = org.marketAccessExpiresAt
          ? new Date(org.marketAccessExpiresAt).getTime()
          : Date.now();
        // Never extend backwards: if the stored expiry is already in the past,
        // start from "now" so the extension always lands in the future.
        const start = Math.max(base, Date.now());
        const newExpiry = new Date(start + addDays * 24 * 60 * 60 * 1000);
        updated = await storage.updateOrganization(orgId, {
          edenMarketAccess: true,
          marketAccessExpiresAt: newExpiry,
        });
        logAppEvent("market_access_extended", {
          orgId, orgName: org.name,
          actorId: adminUserId, actorEmail: adminEmail,
          previousExpiresAt: org.marketAccessExpiresAt ?? null,
          newExpiresAt: newExpiry.toISOString(),
          addedDays: addDays,
        });
      } else {
        updated = await storage.updateOrganization(orgId, {
          edenMarketAccess: false,
          marketAccessExpiresAt: null,
        });
        // Task #752 â€” also clear stripe-sourced per-user entitlements.
        await syncOrgMembersMarketEntitlement(orgId, false);
        logAppEvent("market_access_revoked", {
          orgId, orgName: org.name,
          actorId: adminUserId, actorEmail: adminEmail,
          previouslyHadAccess: !!org.edenMarketAccess,
          previousExpiresAt: org.marketAccessExpiresAt ?? null,
        });
      }

      res.json(updated);
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Invalid payload", details: err.errors });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PATCH /api/admin/orgs/:id/market-seller-verification â€” admin marks an org
  // as a verified EdenMarket seller (or revokes verification).
  // Mounted under /api/admin â†’ already gated by requireAdmin middleware.
  app.patch("/api/admin/orgs/:id/market-seller-verification", async (req, res) => {
    try {
      const orgId = parseInt(String(req.params.id), 10);
      if (isNaN(orgId)) return res.status(400).json({ error: "Invalid org id" });

      const schema = z.object({
        verified: z.boolean(),
        note: z.string().max(500).optional().nullable(),
      });
      const { verified, note } = schema.parse(req.body);

      const org = await storage.getOrganization(orgId);
      if (!org) return res.status(404).json({ error: "Organization not found" });

      const adminUser = await getAdminUser(req);
      const adminUserId = adminUser?.id ?? "admin";
      const adminEmail = adminUser?.email ?? null;

      const updated = await storage.updateOrganization(orgId, verified
        ? {
            marketSellerVerifiedAt: new Date(),
            marketSellerVerifiedBy: adminUserId, // immutable admin user id for audit
            marketSellerVerificationNote: note ?? null,
          }
        : {
            marketSellerVerifiedAt: null,
            marketSellerVerifiedBy: null,
            marketSellerVerificationNote: null,
          });

      // Durable audit log â€” survives server restarts and is queryable from admin tools.
      logAppEvent(verified ? "market_seller_verified" : "market_seller_unverified", {
        orgId,
        orgName: org.name,
        actorId: adminUserId,
        actorEmail: adminEmail,
        note: verified ? (note ?? null) : null,
        previouslyVerifiedAt: org.marketSellerVerifiedAt ?? null,
        previouslyVerifiedBy: org.marketSellerVerifiedBy ?? null,
      });

      res.json(updated);
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Invalid payload", details: err.errors });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // â”€â”€ EdenMarket â€” Deal Room â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // POST /api/market/eois/:id/accept â€” seller accepts an EOI, creating a deal
  app.post("/api/market/eois/:id/accept", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      // Task #714 â€” strict gate: writes blocked during 30-day grace period.
      const acceptAccessState = getMarketAccessState(org);
      if (!acceptAccessState.hasFullAccess) {
        return res.status(403).json(acceptAccessState.inGrace
          ? { error: "EdenMarket is read-only during your grace period â€” reactivate your subscription to accept EOIs.", marketGrace: true, marketAccessExpiresAt: acceptAccessState.expiresAt }
          : { error: "EdenMarket subscription required" });
      }

      const eoiId = parseInt(String(req.params.id), 10);
      if (isNaN(eoiId)) return res.status(400).json({ error: "Invalid EOI ID" });
      const listings = await storage.getMarketListingsBySeller(userId);
      const listingIds = listings.map(l => l.id);

      const [eoiRow] = await db.select().from(marketEois).where(eq(marketEois.id, eoiId)).limit(1);
      if (!eoiRow) return res.status(404).json({ error: "EOI not found" });
      if (!listingIds.includes(eoiRow.listingId)) return res.status(403).json({ error: "Not your listing" });
      if (eoiRow.status === "declined") return res.status(400).json({ error: "EOI already declined" });
      if (eoiRow.status === "accepted") {
        const existing = await storage.getDealForEoi(eoiId);
        if (existing) return res.json({ deal: existing, created: false });
      }

      // Update EOI status to accepted
      await db.update(marketEois).set({ status: "accepted" }).where(eq(marketEois.id, eoiId));

      // Create deal record
      const deal = await storage.createMarketDeal({
        listingId: eoiRow.listingId,
        eoiId: eoiRow.id,
        sellerId: userId,
        buyerId: eoiRow.buyerId,
        status: "nda_pending",
      });

      // Send notification emails to both parties
      const listing = await storage.getMarketListing(eoiRow.listingId);
      const assetLabel = listing?.blind
        ? `a ${listing.therapeuticArea} ${listing.modality} opportunity`
        : (listing?.assetName || `Listing #${eoiRow.listingId}`);
      const dealUrl = `${APP_URL}/market/deals/${deal.id}`;

      try {
        const sellerOrg = await storage.getOrgForUser(userId);
        if (sellerOrg?.billingEmail) {
          await sendMarketMutualInterestEmail(sellerOrg.billingEmail, sellerOrg.name ?? "", dealUrl, assetLabel);
        }
      } catch (e) { console.warn("[market] seller mutual-interest email failed", e); }
      try {
        const buyerOrg = await storage.getOrgForUser(eoiRow.buyerId);
        if (buyerOrg?.billingEmail) {
          await sendMarketMutualInterestEmail(buyerOrg.billingEmail, buyerOrg.name ?? "", dealUrl, assetLabel);
        }
      } catch (e) { console.warn("[market] buyer mutual-interest email failed", e); }
      try {
        await sendAdminNotificationEmail(`Deal created â€” #${deal.id} â€” ${assetLabel}`, `<p>Seller accepted EOI #${eoiId}. Deal #${deal.id} created. <a href="${APP_URL}/admin">View admin</a></p>`);
      } catch (e) { console.warn("[market] admin deal-created email failed", e); }

      res.json({ deal, created: true });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/market/eois/:id/decline â€” seller declines an EOI
  app.post("/api/market/eois/:id/decline", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });

      const eoiId = parseInt(String(req.params.id), 10);
      if (isNaN(eoiId)) return res.status(400).json({ error: "Invalid EOI ID" });
      const listings = await storage.getMarketListingsBySeller(userId);
      const listingIds = listings.map(l => l.id);

      const [eoiRow] = await db.select().from(marketEois).where(eq(marketEois.id, eoiId)).limit(1);
      if (!eoiRow) return res.status(404).json({ error: "EOI not found" });
      if (!listingIds.includes(eoiRow.listingId)) return res.status(403).json({ error: "Not your listing" });
      if (eoiRow.status === "accepted") return res.status(400).json({ error: "Cannot decline an already accepted EOI" });

      await db.update(marketEois).set({ status: "declined" }).where(eq(marketEois.id, eoiId));

      // Notify buyer that their EOI was declined
      try {
        const buyerOrg = await storage.getOrgForUser(eoiRow.buyerId);
        if (buyerOrg?.billingEmail) {
          const listing = await storage.getMarketListing(eoiRow.listingId);
          const assetLabel = listing?.blind
            ? `a ${listing.therapeuticArea} ${listing.modality} listing`
            : (listing?.assetName || `Listing #${eoiRow.listingId}`);
          await sendMarketEoiDeclinedEmail(buyerOrg.billingEmail, buyerOrg.name ?? "", assetLabel);
        }
      } catch (e) { console.warn("[market] buyer EOI-declined email failed", e); }

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/market/deals/events â€” SSE stream for deal-room real-time updates
  app.get("/api/market/deals/events", async (req, res) => {
    const token = (req.headers.authorization?.replace("Bearer ", "") || req.query.token) as string | undefined;
    let userId: string | undefined;
    if (token) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const adminSupabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { autoRefreshToken: false, persistSession: false } }
        );
        const { data } = await adminSupabase.auth.getUser(token);
        userId = data.user?.id;
      } catch {}
    }
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write("event: connected\ndata: {}\n\n");

    registerUserClient(userId, res);
    req.on("close", () => unregisterUserClient(userId!, res));
  });

  // GET /api/market/deals â€” list deals for current user
  app.get("/api/market/deals", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const deals = await storage.getMarketDealsForUser(userId);
      res.json(deals);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/market/deals/:id â€” get single deal room data (seller or buyer, or admin read-only)
  app.get("/api/market/deals/:id", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const isAdmin = !!(await getAdminUser(req));

      if (!isAdmin) {
        const org = await storage.getOrgForUser(userId);
        if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      }

      const dealId = parseInt(String(req.params.id), 10);
      if (isNaN(dealId)) return res.status(400).json({ error: "Invalid deal ID" });
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      if (!isAdmin && deal.sellerId !== userId && deal.buyerId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const listing = await storage.getMarketListing(deal.listingId);
      const [eoi] = await db.select().from(marketEois).where(eq(marketEois.id, deal.eoiId)).limit(1);

      // Resolve org names for explicit legal-counterparty identity display
      const [sellerOrg, buyerOrg] = await Promise.all([
        storage.getOrgForUser(deal.sellerId),
        storage.getOrgForUser(deal.buyerId),
      ]);
      const sellerOrgName: string | null = sellerOrg?.name ?? null;
      const buyerOrgName: string | null = buyerOrg?.name ?? null;

      // After EOI acceptance (deal created), identities are mutually revealed.
      // Deep IP/financial data and EOI rationale/budget are gated behind NDA execution.
      if (!deal.ndaSignedAt) {
        const bf = normalizeBlindFields(listing ?? { blind: false, blindFields: {} });
        const redactedListing = listing ? {
          id: listing.id,
          therapeuticArea: listing.therapeuticArea,
          modality: listing.modality,
          stage: listing.stage,
          engagementStatus: listing.engagementStatus,
          blind: listing.blind,
          blindFields: bf,
          status: listing.status,
          createdAt: listing.createdAt,
          updatedAt: listing.updatedAt,
          sellerId: listing.sellerId,
          // Per-field blinding: asset name only revealed pre-NDA if seller did not mask it.
          // Anything masked stays redacted until NDA is fully executed.
          assetName: bf.assetName ? null : listing.assetName,
          // Gate deep technical/financial data behind NDA
          mechanism: null,
          ipStatus: null,
          ipSummary: null,
          milestoneHistory: null,
          askingPrice: null,
          priceRangeMin: null,
          priceRangeMax: null,
          aiSummary: null,
          adminNote: null,
        } : null;
        const redactedEoi = eoi ? {
          id: eoi.id,
          listingId: eoi.listingId,
          status: eoi.status,
          createdAt: eoi.createdAt,
          // Identity reveal: buyer company/role are shared post-accept
          buyerId: eoi.buyerId,
          company: eoi.company,
          role: eoi.role,
          // Gate due-diligence details behind NDA
          rationale: null,
          budgetRange: null,
          timeline: null,
        } : null;
        return res.json({ deal, listing: redactedListing, eoi: redactedEoi, sellerOrgName, buyerOrgName });
      }

      // NDA signed â€” return NDA download URL if document exists
      let ndaDocumentUrl: string | null = null;
      if (deal.ndaDocumentPath) {
        const sbUrl = process.env.VITE_SUPABASE_URL;
        const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (sbUrl && sbServiceKey) {
          try {
            const { createClient: createSbClient } = await import("@supabase/supabase-js");
            const sbAdmin = createSbClient(sbUrl, sbServiceKey);
            const { data } = await sbAdmin.storage.from("market-deal-docs").createSignedUrl(deal.ndaDocumentPath, 3600);
            ndaDocumentUrl = data?.signedUrl ?? null;
          } catch (e) { console.warn("[market] NDA signed URL generation failed for deal", deal.id, e); }
        }
      }

      // Strip internal-only fields from listing before returning to parties
      const sanitizedListing = listing ? (() => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { adminNote: _an, ...rest } = listing as typeof listing & { adminNote?: unknown };
        return rest;
      })() : null;

      res.json({ deal, listing: sanitizedListing, eoi, ndaDocumentUrl, sellerOrgName, buyerOrgName });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/market/deals/:id/sign-nda â€” sign NDA
  app.post("/api/market/deals/:id/sign-nda", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });

      const dealId = parseInt(String(req.params.id), 10);
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      if (deal.sellerId !== userId && deal.buyerId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { signedName } = z.object({ signedName: z.string().min(2) }).parse(req.body);
      const isSeller = deal.sellerId === userId;
      const now = new Date();

      // Capture IP and user-agent for e-signature audit trail
      const signerIp = ((req.headers["x-forwarded-for"] as string | undefined) ?? "").split(",")[0].trim() || req.ip || "unknown";
      const signerUserAgent = (req.get("user-agent") ?? "unknown").slice(0, 200);

      const updateData: Record<string, unknown> = {};
      if (isSeller && !deal.sellerSignedAt) {
        updateData.sellerSignedAt = now;
        updateData.sellerSignedName = signedName;
      } else if (!isSeller && !deal.buyerSignedAt) {
        updateData.buyerSignedAt = now;
        updateData.buyerSignedName = signedName;
      } else {
        return res.json({ deal, alreadySigned: true });
      }

      // Add individual signing event to statusHistory for the audit trail
      const signerEntry: import("@shared/schema").DealStatusHistoryEntry = {
        status: isSeller ? "seller_signed_nda" : "buyer_signed_nda",
        changedAt: now.toISOString(),
        changedBy: userId,
        signerName: signedName,
        signerIp,
        signerUserAgent,
      };
      updateData.statusHistory = [...(Array.isArray(deal.statusHistory) ? deal.statusHistory : []), signerEntry];

      let updatedDeal = await storage.updateMarketDeal(dealId, updateData);
      if (!updatedDeal) return res.status(500).json({ error: "Update failed" });

      // If both have signed, unlock the deal room
      if (updatedDeal.sellerSignedAt && updatedDeal.buyerSignedAt && !updatedDeal.ndaSignedAt) {
        const ndaHistoryEntry: import("@shared/schema").DealStatusHistoryEntry = { status: "nda_signed", changedAt: now.toISOString(), changedBy: "system" };
        updatedDeal = await storage.updateMarketDeal(dealId, {
          ndaSignedAt: now,
          status: "nda_signed",
          // Use updatedDeal.statusHistory (has the current signer's entry) instead of the stale deal.statusHistory
          statusHistory: [...(Array.isArray(updatedDeal.statusHistory) ? updatedDeal.statusHistory : []), ndaHistoryEntry],
        }) ?? updatedDeal;

        // Generate and store NDA artifact as PDF
        const listing = await storage.getMarketListing(deal.listingId);
        const assetRef = listing?.blind
          ? `a ${listing.therapeuticArea} ${listing.modality} asset (EdenMarket Listing #${deal.listingId})`
          : (listing?.assetName || `EdenMarket Listing #${deal.listingId}`);
        const signedDate = new Date(updatedDeal.sellerSignedAt!).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

        // Resolve legal names for PDF preamble
        const [ndaSellerOrg, ndaBuyerOrg] = await Promise.all([
          storage.getOrgForUser(deal.sellerId),
          storage.getOrgForUser(deal.buyerId),
        ]);
        const sellerLegalName = ndaSellerOrg?.name ?? `Party A (Deal #${dealId})`;
        const buyerLegalName = ndaBuyerOrg?.name ?? `Party B (Deal #${dealId})`;

        try {
          const sbUrl = process.env.VITE_SUPABASE_URL;
          const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (sbUrl && sbServiceKey) {
            const PDFDocument = (await import("pdfkit")).default;
            const ndaPdfBuffer = await new Promise<Buffer>((resolve, reject) => {
              const doc = new PDFDocument({ margin: 72, size: "LETTER" });
              const chunks: Buffer[] = [];
              doc.on("data", (c: Buffer) => chunks.push(c));
              doc.on("end", () => resolve(Buffer.concat(chunks)));
              doc.on("error", reject);

              doc.font("Helvetica-Bold").fontSize(14).text("MUTUAL NON-DISCLOSURE AGREEMENT", { align: "center" });
              doc.moveDown();
              doc.font("Helvetica").fontSize(10);
              doc.text(`This Mutual Non-Disclosure Agreement ("Agreement") is entered into as of ${signedDate}, between ${sellerLegalName} ("Seller", Deal Party A) and ${buyerLegalName} ("Buyer", Deal Party B) in connection with ${assetRef}, facilitated through EdenMarket by EdenRadar.`, { align: "justify" });
              doc.moveDown();
              const clauses = [
                ["1. CONFIDENTIAL INFORMATION.", 'Each party ("Disclosing Party") may disclose to the other party ("Receiving Party") certain non-public, proprietary, or confidential information ("Confidential Information") in connection with the evaluation of a potential business transaction regarding the above-referenced asset.'],
                ["2. NON-DISCLOSURE.", 'Each Receiving Party agrees to: (a) hold the Disclosing Party\'s Confidential Information in strict confidence; (b) not disclose it to any third party without prior written consent; (c) use it solely for evaluating the Potential Transaction; and (d) protect it using at least the same degree of care applied to its own confidential information.'],
                ["3. TERM.", "This Agreement shall remain in force for three (3) years from the date of execution, unless otherwise terminated by mutual written agreement."],
                ["4. RETURN OF INFORMATION.", "Upon request, each party shall promptly return or certifiably destroy all Confidential Information received."],
                ["5. GOVERNING LAW.", "This Agreement shall be governed by the laws of the jurisdiction in which the Disclosing Party is incorporated."],
                ["6. ENTIRE AGREEMENT.", "This Agreement constitutes the entire agreement between the parties with respect to the subject matter herein."],
              ];
              for (const [title, body] of clauses) {
                doc.font("Helvetica-Bold").text(title, { continued: true });
                doc.font("Helvetica").text(` ${body}`, { align: "justify" });
                doc.moveDown(0.5);
              }
              doc.moveDown();
              doc.moveTo(72, doc.y).lineTo(540, doc.y).stroke();
              doc.moveDown();
              const sellerSigName = updatedDeal?.sellerSignedName ?? "";
              const sellerSigDate = updatedDeal?.sellerSignedAt ? new Date(updatedDeal.sellerSignedAt).toLocaleString() : "";
              const buyerSigName = updatedDeal?.buyerSignedName ?? "";
              const buyerSigDate = updatedDeal?.buyerSignedAt ? new Date(updatedDeal.buyerSignedAt).toLocaleString() : "";
              doc.font("Helvetica-Bold").text("Signatures");
              doc.moveDown(0.5);
              doc.font("Helvetica").text(`Party A (Seller): ${sellerSigName}   Signed: ${sellerSigDate}`);
              doc.moveDown(0.5);
              doc.text(`Party B (Buyer):  ${buyerSigName}   Signed: ${buyerSigDate}`);
              doc.moveDown();
              // E-Signature Audit Trail section
              const fullHistory = (updatedDeal?.statusHistory ?? []) as import("@shared/schema").DealStatusHistoryEntry[];
              const sellerSigEvt = fullHistory.find(e => e.status === "seller_signed_nda");
              const buyerSigEvt = fullHistory.find(e => e.status === "buyer_signed_nda");
              if (sellerSigEvt?.signerIp || buyerSigEvt?.signerIp) {
                doc.font("Helvetica-Bold").fontSize(9).fillColor("black").text("E-Signature Audit Trail");
                doc.moveDown(0.3);
                doc.font("Helvetica").fontSize(8).fillColor("grey");
                if (sellerSigEvt) doc.text(`Party A IP: ${sellerSigEvt.signerIp ?? "N/A"}  Â·  UA: ${(sellerSigEvt.signerUserAgent ?? "").slice(0, 80)}`);
                if (buyerSigEvt) doc.text(`Party B IP: ${buyerSigEvt.signerIp ?? "N/A"}  Â·  UA: ${(buyerSigEvt.signerUserAgent ?? "").slice(0, 80)}`);
                doc.moveDown(0.3);
              }
              doc.font("Helvetica").fontSize(8).fillColor("grey")
                .text(`Document ID: DEAL-${dealId}-NDA Â· EdenMarket Â· Generated: ${new Date().toISOString()}`, { align: "center" });
              doc.end();
            });

            const { createClient: createSbClient } = await import("@supabase/supabase-js");
            const sbAdmin = createSbClient(sbUrl, sbServiceKey);
            const ndaPath = `deal-${dealId}/nda-executed.pdf`;
            await sbAdmin.storage.from("market-deal-docs").upload(ndaPath, ndaPdfBuffer, { contentType: "application/pdf", upsert: true });
            await storage.updateMarketDeal(dealId, { ndaDocumentPath: ndaPath });
          }
        } catch (e) { console.warn("[market] NDA PDF generation/upload failed for deal", dealId, e); }

        const assetLabel = listing?.blind
          ? `a ${listing.therapeuticArea} ${listing.modality} opportunity`
          : (listing?.assetName || `Listing #${deal.listingId}`);
        const dealUrl = `${APP_URL}/market/deals/${dealId}`;
        try {
          const sellerOrg = await storage.getOrgForUser(deal.sellerId);
          if (sellerOrg?.billingEmail) await sendMarketNdaSignedEmail(sellerOrg.billingEmail, sellerOrg.name ?? "", dealUrl, assetLabel);
        } catch (e) { console.warn("[market] seller NDA-signed email failed", e); }
        try {
          const buyerOrg = await storage.getOrgForUser(deal.buyerId);
          if (buyerOrg?.billingEmail) await sendMarketNdaSignedEmail(buyerOrg.billingEmail, buyerOrg.name ?? "", dealUrl, assetLabel);
        } catch (e) { console.warn("[market] buyer NDA-signed email failed", e); }
      }

      void logDealEvent(dealId, userId, "nda_signed", `${isSeller ? "seller" : "buyer"} signed as "${signedName}"`);
      if (updatedDeal?.ndaSignedAt) void logDealEvent(dealId, userId, "nda_executed", "NDA fully executed by both parties");

      broadcastToUsers([deal.sellerId, deal.buyerId], "deal_updated", { dealId });

      res.json({ deal: updatedDeal, alreadySigned: false });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // PATCH /api/market/deals/:id/status â€” seller updates deal status
  app.patch("/api/market/deals/:id/status", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });

      const dealId = parseInt(String(req.params.id), 10);
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      if (deal.sellerId !== userId) return res.status(403).json({ error: "Only seller can update status" });

      const { status, dealSizeM } = z.object({
        status: z.enum(["nda_pending", "nda_signed", "due_diligence", "term_sheet", "loi", "closed", "paused"]),
        dealSizeM: z.number().int().positive().optional(),
      }).parse(req.body);

      // Enforce NDA must be signed before progressing past nda_pending
      const ndaRequiredStatuses = ["nda_signed", "due_diligence", "term_sheet", "loi", "closed"];
      if (ndaRequiredStatuses.includes(status) && !deal.ndaSignedAt) {
        return res.status(400).json({ error: "NDA must be executed by both parties before advancing deal status" });
      }

      // Guard against regressing back to nda_pending once NDA is signed
      if (status === "nda_pending" && deal.ndaSignedAt) {
        return res.status(400).json({ error: "Cannot revert to NDA pending after NDA has been executed" });
      }

      // Closing requires a deal size â€” either provided now, or already persisted
      // from a prior close attempt that failed mid-flight. We need it to compute
      // the success-fee tier and auto-fire the invoice.
      const effectiveDealSizeM = dealSizeM ?? deal.successFeeDealSizeM ?? null;
      if (status === "closed" && !effectiveDealSizeM) {
        return res.status(400).json({ error: "dealSizeM (final deal size in millions USD) is required when closing a deal" });
      }

      // Idempotency for re-closing: if the deal is already closed and an
      // invoice was already issued, do not allow another close+invoice cycle.
      if (status === "closed" && deal.status === "closed" && deal.successFeeInvoiceId) {
        return res.status(409).json({
          error: "Deal already closed and invoiced",
          invoiceId: deal.successFeeInvoiceId,
        });
      }

      // Append to status history
      const historyEntry: import("@shared/schema").DealStatusHistoryEntry = { status, changedAt: new Date().toISOString(), changedBy: userId };
      const currentHistory = Array.isArray(deal.statusHistory) ? deal.statusHistory : [];

      // Persist the deal-size up-front so we have it on record even if invoice
      // generation fails partway through. The status flips to "closed" in the
      // same UPDATE so the helper sees a closed deal.
      const updatePayload: Partial<import("@shared/schema").InsertMarketDeal> = {
        status,
        statusHistory: [...currentHistory, historyEntry],
      };
      if (status === "closed" && dealSizeM) {
        updatePayload.successFeeDealSizeM = dealSizeM;
      }
      const updated = await storage.updateMarketDeal(dealId, updatePayload);

      void logDealEvent(dealId, userId, "status_changed", `â†’ ${status}`);
      broadcastToUsers([deal.sellerId, deal.buyerId], "deal_updated", { dealId });

      // Alert admin on LOI or Closed
      if (status === "loi" || status === "closed") {
        const listing = await storage.getMarketListing(deal.listingId);
        const label = listing?.assetName || `Listing #${deal.listingId}`;
        try {
          await sendAdminNotificationEmail(
            `Deal #${dealId} moved to ${status.toUpperCase()} â€” ${label}`,
            `<p>Deal #${dealId} (${label}) has been moved to <strong>${status}</strong>.</p><p><a href="${APP_URL}/admin">View in admin panel</a></p>`
          );
        } catch (e) { console.warn("[market] admin status-change email failed", e); }

        // Request feedback from both parties when closed
        if (status === "closed") {
          const assetFeedbackLabel = listing?.blind
            ? `a ${listing?.therapeuticArea ?? ""} ${listing?.modality ?? ""} asset`
            : (listing?.assetName || `Listing #${deal.listingId}`);
          try {
            const sellerOrg = await storage.getOrgForUser(deal.sellerId);
            if (sellerOrg?.billingEmail) {
              await sendMarketFeedbackRequestEmail(sellerOrg.billingEmail, sellerOrg.name ?? "", assetFeedbackLabel, dealId, "seller");
            }
          } catch (e) { console.warn("[market] seller feedback-request email failed", e); }
          try {
            const buyerOrg = await storage.getOrgForUser(deal.buyerId);
            if (buyerOrg?.billingEmail) {
              await sendMarketFeedbackRequestEmail(buyerOrg.billingEmail, buyerOrg.name ?? "", assetFeedbackLabel, dealId, "buyer");
            }
          } catch (e) { console.warn("[market] buyer feedback-request email failed", e); }
        }
      }

      // Auto-fire success-fee invoice on close. We do NOT roll back the status
      // change on invoice failure â€” the deal really did close. Instead we
      // surface the error to the seller and alert admins so the manual
      // fallback endpoint can be used.
      if (status === "closed" && effectiveDealSizeM) {
        try {
          const invoiceResult = await generateSuccessFeeInvoice(dealId, effectiveDealSizeM);
          if (invoiceResult.ok) {
            return res.json({
              ...invoiceResult.deal,
              autoInvoice: {
                feeAmount: invoiceResult.feeAmount,
                invoiceId: invoiceResult.invoiceId,
                invoiceUrl: invoiceResult.invoiceUrl ?? null,
                note: invoiceResult.note,
              },
            });
          }
          // Invoice generation failed â€” keep the close, alert admins.
          console.error(`[market/auto-invoice] deal ${dealId} closed but invoice failed: ${invoiceResult.error}`);
          try {
            await sendAdminNotificationEmail(
              `URGENT: Deal #${dealId} closed but auto-invoice FAILED`,
              `<p>Deal #${dealId} was marked closed by seller but the success-fee invoice could not be generated automatically.</p>
               <p><strong>Reason:</strong> ${invoiceResult.error}</p>
               <p>Use the manual invoice button in <a href="${APP_URL}/admin">the admin panel</a>.</p>`
            );
          } catch (e) { console.warn("[market] admin auto-invoice failure email failed", e); }
          return res.status(207).json({
            ...updated,
            autoInvoice: { error: invoiceResult.error, invoiceId: invoiceResult.invoiceId ?? null },
          });
        } catch (invErr: any) {
          console.error(`[market/auto-invoice] deal ${dealId} unhandled error`, invErr);
          sentryCaptureException(invErr);
          try {
            await sendAdminNotificationEmail(
              `URGENT: Deal #${dealId} closed but auto-invoice CRASHED`,
              `<p>Deal #${dealId} was marked closed by seller. The success-fee invoice generator crashed.</p>
               <p><strong>Error:</strong> ${invErr?.message ?? String(invErr)}</p>
               <p>Use the manual invoice button in <a href="${APP_URL}/admin">the admin panel</a>.</p>`
            );
          } catch (e) { console.warn("[market] admin auto-invoice crash email failed", e); }
          return res.status(207).json({
            ...updated,
            autoInvoice: { error: invErr?.message ?? "Invoice generation crashed" },
          });
        }
      }

      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // â”€â”€ Deal Comps â€” surface deal comparables inside the deal room â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // GET /api/market/deals/:id/comps â€” comparable deals for a deal room listing
  app.get("/api/market/deals/:id/comps", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const dealId = parseInt(String(req.params.id), 10);
      if (isNaN(dealId)) return res.status(400).json({ error: "Invalid deal ID" });
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      if (deal.sellerId !== userId && deal.buyerId !== userId) return res.status(403).json({ error: "Access denied" });
      if (!deal.ndaSignedAt) return res.status(403).json({ error: "NDA required" });

      const listing = await storage.getMarketListing(deal.listingId);
      if (!listing) return res.json([]);

      // Filter comps by matching modality and/or therapeutic area, order by date desc
      const comps = await db.select().from(dealComparables)
        .where(
          or(
            listing.modality ? ilike(dealComparables.modality, `%${listing.modality}%`) : sql`false`,
            listing.therapeuticArea ? ilike(dealComparables.therapeuticArea, `%${listing.therapeuticArea}%`) : sql`false`,
          )
        )
        .orderBy(desc(dealComparables.filingDate))
        .limit(20);

      // Compute market benchmarks for the sidebar summary
      const withValues = comps.filter(c => c.upfrontUsd || c.totalValueUsd);
      const avgUpfront = withValues.length
        ? Math.round(withValues.reduce((s, c) => s + (c.upfrontUsd ?? 0), 0) / withValues.length / 1_000_000)
        : null;
      const avgTotal = withValues.length
        ? Math.round(withValues.reduce((s, c) => s + (c.totalValueUsd ?? 0), 0) / withValues.length / 1_000_000)
        : null;

      res.json({ comps, benchmarks: { avgUpfrontM: avgUpfront, avgTotalM: avgTotal, count: comps.length } });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // â”€â”€ Term Sheet â€” collaborative term builder inside the deal room â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // GET /api/market/deals/:id/term-sheet
  app.get("/api/market/deals/:id/term-sheet", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const dealId = parseInt(String(req.params.id), 10);
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      if (deal.sellerId !== userId && deal.buyerId !== userId) return res.status(403).json({ error: "Access denied" });
      if (!deal.ndaSignedAt) return res.status(403).json({ error: "NDA required" });

      const [ts] = await db.select().from(marketDealTermSheets).where(eq(marketDealTermSheets.dealId, dealId)).limit(1);
      res.json(ts ?? null);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PATCH /api/market/deals/:id/term-sheet â€” upsert fields (last-write-wins)
  app.patch("/api/market/deals/:id/term-sheet", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      const tsAccessState = getMarketAccessState(org);
      if (!tsAccessState.hasFullAccess) return res.status(403).json({ error: "EdenMarket subscription required" });
      const dealId = parseInt(String(req.params.id), 10);
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      if (deal.sellerId !== userId && deal.buyerId !== userId) return res.status(403).json({ error: "Access denied" });
      if (!deal.ndaSignedAt) return res.status(403).json({ error: "NDA required" });

      const fieldsSchema = z.object({
        upfrontUsdM: z.number().nonnegative().optional().nullable(),
        milestonesUsdM: z.number().nonnegative().optional().nullable(),
        royaltyPct: z.number().nonnegative().max(100).optional().nullable(),
        territory: z.string().max(240).optional().nullable(),
        exclusivity: z.string().max(240).optional().nullable(),
        ipOwnership: z.string().max(240).optional().nullable(),
        sublicensingRights: z.string().max(240).optional().nullable(),
        diligenceRights: z.string().max(240).optional().nullable(),
        notes: z.string().max(2000).optional().nullable(),
      }).strip();

      const incoming = fieldsSchema.parse(req.body);

      // Check if term sheet is locked
      const [existing] = await db.select().from(marketDealTermSheets).where(eq(marketDealTermSheets.dealId, dealId)).limit(1);
      if (existing?.lockedAt) return res.status(400).json({ error: "Term sheet is locked â€” both parties have agreed" });

      const now = new Date();
      let ts: typeof marketDealTermSheets.$inferSelect;
      if (!existing) {
        [ts] = await db.insert(marketDealTermSheets).values({
          dealId,
          fields: incoming,
          lastEditedBy: userId,
          createdAt: now,
          updatedAt: now,
        }).returning();
      } else {
        // Merge: null-valued keys remove the field, others overwrite
        const merged = { ...existing.fields };
        for (const [k, v] of Object.entries(incoming)) {
          if (v === null) delete (merged as Record<string, unknown>)[k];
          else (merged as Record<string, unknown>)[k] = v;
        }
        [ts] = await db.update(marketDealTermSheets)
          .set({ fields: merged, lastEditedBy: userId, updatedAt: now, sellerAgreedAt: null, buyerAgreedAt: null, lockedAt: null })
          .where(eq(marketDealTermSheets.dealId, dealId))
          .returning();
      }

      broadcastToUsers([deal.sellerId, deal.buyerId], "deal_updated", { dealId, event: "term_sheet_updated" });
      res.json(ts);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /api/market/deals/:id/term-sheet/agree â€” mark current term sheet as agreed by caller
  app.post("/api/market/deals/:id/term-sheet/agree", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      const tsAgreeState = getMarketAccessState(org);
      if (!tsAgreeState.hasFullAccess) return res.status(403).json({ error: "EdenMarket subscription required" });
      const dealId = parseInt(String(req.params.id), 10);
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      if (deal.sellerId !== userId && deal.buyerId !== userId) return res.status(403).json({ error: "Access denied" });
      if (!deal.ndaSignedAt) return res.status(403).json({ error: "NDA required" });

      const [ts] = await db.select().from(marketDealTermSheets).where(eq(marketDealTermSheets.dealId, dealId)).limit(1);
      if (!ts) return res.status(404).json({ error: "No term sheet exists yet" });
      if (ts.lockedAt) return res.json({ ts, alreadyLocked: true });

      const isSeller = deal.sellerId === userId;
      const now = new Date();
      const update: Partial<typeof marketDealTermSheets.$inferSelect> = {};
      if (isSeller && !ts.sellerAgreedAt) update.sellerAgreedAt = now;
      if (!isSeller && !ts.buyerAgreedAt) update.buyerAgreedAt = now;

      const [updated] = await db.update(marketDealTermSheets)
        .set(update)
        .where(eq(marketDealTermSheets.dealId, dealId))
        .returning();

      // Both agreed â€” lock the term sheet
      const final = await (async () => {
        if (updated.sellerAgreedAt && updated.buyerAgreedAt && !updated.lockedAt) {
          const [locked] = await db.update(marketDealTermSheets)
            .set({ lockedAt: now })
            .where(eq(marketDealTermSheets.dealId, dealId))
            .returning();
          return locked;
        }
        return updated;
      })();

      broadcastToUsers([deal.sellerId, deal.buyerId], "deal_updated", { dealId, event: "term_sheet_agreed" });
      res.json({ ts: final, locked: !!final.lockedAt });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/market/deals/:id/term-sheet/suggest â€” AI-powered deal term suggestions
  app.post("/api/market/deals/:id/term-sheet/suggest", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      const accessState = getMarketAccessState(org);
      if (!accessState.hasFullAccess) return res.status(403).json({ error: "EdenMarket subscription required" });
      const dealId = parseInt(String(req.params.id), 10);
      if (isNaN(dealId)) return res.status(400).json({ error: "Invalid deal ID" });
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      if (deal.sellerId !== userId && deal.buyerId !== userId) return res.status(403).json({ error: "Access denied" });
      if (!deal.ndaSignedAt) return res.status(403).json({ error: "NDA required" });

      const listing = await storage.getMarketListing(deal.listingId);
      if (!listing) return res.status(404).json({ error: "Listing not found" });

      const comps = await db.select({
        developmentStage: dealComparables.developmentStage,
        upfrontUsd: dealComparables.upfrontUsd,
        totalValueUsd: dealComparables.totalValueUsd,
        geography: dealComparables.geography,
      }).from(dealComparables)
        .where(or(
          listing.modality ? ilike(dealComparables.modality, `%${listing.modality}%`) : sql`false`,
          listing.therapeuticArea ? ilike(dealComparables.therapeuticArea, `%${listing.therapeuticArea}%`) : sql`false`,
        ))
        .orderBy(desc(dealComparables.filingDate))
        .limit(15);

      const compsText = comps.length > 0
        ? comps.map(c =>
            `Stage: ${c.developmentStage ?? "unknown"}, Upfront: $${c.upfrontUsd ? (c.upfrontUsd / 1_000_000).toFixed(1) : "?"}M, Total: $${c.totalValueUsd ? (c.totalValueUsd / 1_000_000).toFixed(1) : "?"}M, Territory: ${c.geography ?? "global"}`
          ).join("\n")
        : "No specific comparables found â€” use industry norms.";

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const aiResp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: "You are an expert biotech licensing analyst specializing in IP deal structuring. Given deal context and comparable transactions, provide data-driven term suggestions. Always respond with valid JSON only.",
          },
          {
            role: "user",
            content: `Asset context:\n- Therapeutic area: ${listing.therapeuticArea}\n- Modality: ${listing.modality}\n- Development stage: ${listing.stage}\n- IP status: ${listing.ipStatus ?? "not specified"}\n\nComparable deal terms (${comps.length} deals found):\n${compsText}\n\nSuggest reasonable deal terms. Return JSON exactly as:\n{"upfrontUsdM":{"min":number,"max":number,"suggested":number},"milestonesUsdM":{"min":number,"max":number,"suggested":number},"royaltyPct":{"min":number,"max":number,"suggested":number},"territory":"string","exclusivity":"Exclusive or Non-exclusive","rationale":"1-2 sentence explanation citing comparable data"}`,
          },
        ],
      });

      const raw = aiResp.choices[0].message.content ?? "{}";
      let suggestions: Record<string, unknown>;
      try { suggestions = JSON.parse(raw); } catch { return res.status(500).json({ error: "AI returned malformed suggestions" }); }

      res.json({ suggestions, compsCount: comps.length });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // â”€â”€ Deal Room Observers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // GET /api/market/deals/:id/observers â€” list observers for a deal
  app.get("/api/market/deals/:id/observers", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const dealId = parseInt(String(req.params.id), 10);
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      if (deal.sellerId !== userId && deal.buyerId !== userId) return res.status(403).json({ error: "Access denied" });

      // Each party only sees their own observers
      const observers = await db.select().from(marketDealObservers)
        .where(and(eq(marketDealObservers.dealId, dealId), eq(marketDealObservers.invitedBy, userId)))
        .orderBy(marketDealObservers.invitedAt);

      res.json(observers.filter(o => !o.revokedAt));
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/market/deals/:id/observers â€” invite an observer
  app.post("/api/market/deals/:id/observers", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      const obsAccessState = getMarketAccessState(org);
      if (!obsAccessState.hasFullAccess) return res.status(403).json({ error: "EdenMarket subscription required" });
      const dealId = parseInt(String(req.params.id), 10);
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      if (deal.sellerId !== userId && deal.buyerId !== userId) return res.status(403).json({ error: "Access denied" });
      if (!deal.ndaSignedAt) return res.status(403).json({ error: "NDA must be signed before inviting observers" });

      const { observerEmail, observerName, role } = z.object({
        observerEmail: z.string().email(),
        observerName: z.string().min(1).max(120),
        role: z.enum(["counsel", "advisor", "other"]).optional().default("counsel"),
      }).parse(req.body);

      // Limit per inviter: max 3 observers per deal
      const existing = await db.select().from(marketDealObservers)
        .where(and(eq(marketDealObservers.dealId, dealId), eq(marketDealObservers.invitedBy, userId)));
      const active = existing.filter(o => !o.revokedAt);
      if (active.length >= 3) return res.status(400).json({ error: "Maximum 3 observers per party per deal" });

      const inviteToken = require("crypto").randomBytes(32).toString("hex");
      const acceptUrl = `${APP_URL}/market/observer-accept?token=${inviteToken}`;

      const inviterOrg = await storage.getOrgForUser(userId);
      const listing = await storage.getMarketListing(deal.listingId);
      const assetLabel = listing?.blind
        ? `a ${listing.therapeuticArea} ${listing.modality} opportunity`
        : (listing?.assetName || `Listing #${deal.listingId}`);

      const [observer] = await db.insert(marketDealObservers).values({
        dealId,
        invitedBy: userId,
        observerEmail,
        observerName,
        role: role ?? "counsel",
        inviteToken,
      }).returning();

      try {
        await sendMarketObserverInviteEmail(observerEmail, observerName, inviterOrg?.name ?? "EdenMarket", assetLabel, role ?? "counsel", acceptUrl);
      } catch (e) { console.warn("[market] observer invite email failed", e); }

      res.json(observer);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // DELETE /api/market/deals/:id/observers/:observerId â€” revoke observer access
  app.delete("/api/market/deals/:id/observers/:observerId", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const dealId = parseInt(String(req.params.id), 10);
      const observerId = parseInt(String(req.params.observerId), 10);
      const [obs] = await db.select().from(marketDealObservers).where(eq(marketDealObservers.id, observerId)).limit(1);
      if (!obs || obs.dealId !== dealId || obs.invitedBy !== userId) return res.status(403).json({ error: "Access denied" });
      await db.update(marketDealObservers).set({ revokedAt: new Date() }).where(eq(marketDealObservers.id, observerId));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/market/observer-accept â€” observer accepts invite via token link
  app.get("/api/market/observer-accept", async (req, res) => {
    try {
      const token = String(req.query.token ?? "");
      if (!token) return res.status(400).json({ error: "Missing token" });
      const [obs] = await db.select().from(marketDealObservers).where(eq(marketDealObservers.inviteToken, token)).limit(1);
      if (!obs || obs.revokedAt) return res.status(404).json({ error: "Invitation not found or revoked" });
      if (!obs.acceptedAt) {
        await db.update(marketDealObservers).set({ acceptedAt: new Date() }).where(eq(marketDealObservers.id, obs.id));
      }
      // Redirect to the deal room; the observer can view via a separate read-only session
      res.redirect(302, `${APP_URL}/market/deals/${obs.dealId}?observer=${token}`);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // â”€â”€ Post-Deal Feedback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // GET /api/market/deals/:id/feedback â€” get submitted feedback for this deal
  app.get("/api/market/deals/:id/feedback", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const dealId = parseInt(String(req.params.id), 10);
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      if (deal.sellerId !== userId && deal.buyerId !== userId) return res.status(403).json({ error: "Access denied" });

      const [mine] = await db.select().from(marketDealFeedback)
        .where(and(eq(marketDealFeedback.dealId, dealId), eq(marketDealFeedback.responderId, userId)))
        .limit(1);
      res.json({ submitted: !!mine, feedback: mine ?? null });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/market/deals/:id/feedback â€” submit deal feedback
  app.post("/api/market/deals/:id/feedback", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const dealId = parseInt(String(req.params.id), 10);
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      if (deal.sellerId !== userId && deal.buyerId !== userId) return res.status(403).json({ error: "Access denied" });

      const schema = z.object({
        outcomeType: z.enum(["closed", "abandoned_nda", "abandoned_diligence", "abandoned_terms", "abandoned_other"]),
        overallRating: z.number().int().min(1).max(5).optional().nullable(),
        timeToLoiDays: z.number().int().nonnegative().optional().nullable(),
        dealValueUsdM: z.number().nonnegative().optional().nullable(),
        mainBlocker: z.string().max(500).optional().nullable(),
        platformRating: z.number().int().min(1).max(5).optional().nullable(),
        platformComment: z.string().max(1000).optional().nullable(),
        wouldRecommend: z.boolean().optional().nullable(),
      });

      const data = schema.parse(req.body);
      const responderRole = deal.sellerId === userId ? "seller" : "buyer";

      const [feedback] = await db.insert(marketDealFeedback).values({
        dealId,
        responderId: userId,
        responderRole,
        ...data,
      }).onConflictDoUpdate({
        target: [marketDealFeedback.dealId, marketDealFeedback.responderId],
        set: { ...data },
      }).returning();

      res.json(feedback);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // â”€â”€ Seller Analytics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // GET /api/market/seller/analytics â€” funnel & interest analytics for seller
  app.get("/api/market/seller/analytics", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });

      const listings = await storage.getMarketListingsBySeller(userId);
      const listingIds = listings.map(l => l.id);

      if (!listingIds.length) return res.json({ listings: [], totals: { listings: 0, eois: 0, accepted: 0, deals: 0, closed: 0 } });

      // EOIs per listing
      const allEois = listingIds.length > 0
        ? await db.select().from(marketEois).where(inArray(marketEois.listingId, listingIds))
        : [];

      // Active deals
      const allDeals = await db.select().from(marketDeals).where(eq(marketDeals.sellerId, userId));

      // Closed deals
      const closedDeals = allDeals.filter(d => d.status === "closed");

      // EOI breakdown by status
      const eoiByStatus = { submitted: 0, viewed: 0, accepted: 0, declined: 0 };
      for (const e of allEois) {
        if (e.status in eoiByStatus) eoiByStatus[e.status as keyof typeof eoiByStatus]++;
      }

      // Per-listing analytics
      const perListing = listings.map(l => {
        const lEois = allEois.filter(e => e.listingId === l.id);
        const lDeals = allDeals.filter(d => d.listingId === l.id);
        return {
          listing: { id: l.id, therapeuticArea: l.therapeuticArea, modality: l.modality, stage: l.stage, assetName: l.assetName, blind: l.blind, status: l.status, engagementStatus: l.engagementStatus },
          eoiCount: lEois.length,
          eoiByStatus: {
            submitted: lEois.filter(e => e.status === "submitted").length,
            accepted: lEois.filter(e => e.status === "accepted").length,
            declined: lEois.filter(e => e.status === "declined").length,
          },
          dealCount: lDeals.length,
          activeDealCount: lDeals.filter(d => !["closed", "paused"].includes(d.status)).length,
          closedDealCount: lDeals.filter(d => d.status === "closed").length,
          avgDaysToEoi: (() => {
            const diffs = lEois.map(e => (new Date(e.createdAt).getTime() - new Date(l.createdAt).getTime()) / 86400_000);
            return diffs.length ? Math.round(diffs.reduce((s, d) => s + d, 0) / diffs.length) : null;
          })(),
        };
      });

      // TA breakdown of EOI interest
      const taInterest: Record<string, number> = {};
      for (const l of listings) {
        const count = allEois.filter(e => e.listingId === l.id).length;
        if (count > 0) {
          taInterest[l.therapeuticArea] = (taInterest[l.therapeuticArea] ?? 0) + count;
        }
      }

      res.json({
        perListing,
        totals: {
          listings: listings.length,
          eois: allEois.length,
          eoiByStatus,
          deals: allDeals.length,
          closed: closedDeals.length,
        },
        taInterest,
        successFeeCollected: closedDeals.reduce((s, d) => s + (d.successFeeAmount ?? 0), 0),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // â”€â”€ Buyer Intel on EOI (for seller review) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // GET /api/market/seller/eois/:eoiId/buyer-intel â€” brief company profile for EOI buyer
  app.get("/api/market/seller/eois/:eoiId/buyer-intel", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, org))) return res.status(403).json({ error: "EdenMarket subscription required" });

      const eoiId = parseInt(String(req.params.eoiId), 10);
      const [eoi] = await db.select().from(marketEois).where(eq(marketEois.id, eoiId)).limit(1);
      if (!eoi) return res.status(404).json({ error: "EOI not found" });

      // Verify the EOI is on one of the seller's listings
      const listings = await storage.getMarketListingsBySeller(userId);
      if (!listings.find(l => l.id === eoi.listingId)) return res.status(403).json({ error: "Not your listing" });

      // Fetch buyer's org and industry profile for intel
      const buyerOrg = await storage.getOrgForUser(eoi.buyerId);
      const [buyerProfile] = await db.select().from(industryProfiles).where(eq(industryProfiles.userId, eoi.buyerId)).limit(1);

      // Count how many active pipeline items buyer has saved in related TAs
      let pipelineSignals: { total: number; relevantTa: number } = { total: 0, relevantTa: 0 };
      try {
        const listing = listings.find(l => l.id === eoi.listingId);
        const saved = await db.select().from(savedAssets).where(eq(savedAssets.userId, eoi.buyerId));
        pipelineSignals.total = saved.length;
        if (listing?.therapeuticArea) {
          pipelineSignals.relevantTa = saved.filter(s => {
            const ta = (s as unknown as Record<string, unknown>).therapeuticArea;
            return typeof ta === "string" && ta.toLowerCase().includes(listing.therapeuticArea.toLowerCase());
          }).length;
        }
      } catch (e) { /* non-critical */ }

      res.json({
        buyerCompany: eoi.company,
        buyerRole: eoi.role,
        buyerOrgName: buyerOrg?.name ?? null,
        buyerOrgType: (buyerProfile as Record<string, unknown> | null)?.companyType ?? null,
        buyerTherapeuticAreas: (buyerProfile as Record<string, unknown> | null)?.therapeuticAreas ?? [],
        buyerModalities: (buyerProfile as Record<string, unknown> | null)?.modalities ?? [],
        buyerDealStages: (buyerProfile as Record<string, unknown> | null)?.dealStages ?? [],
        pipelineSignals,
        eoi: { id: eoi.id, rationale: eoi.rationale, budgetRange: eoi.budgetRange, timeline: eoi.timeline, status: eoi.status, createdAt: eoi.createdAt },
      });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // â”€â”€ Admin â€” Listing Review Queue â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // PATCH /api/admin/market/listings/:id/activate â€” admin activates a pending listing
  app.patch("/api/admin/market/listings/:id/activate", requireAdmin, async (req, res) => {
    try {
      const listingId = parseInt(String(req.params.id), 10);
      const listing = await storage.getMarketListing(listingId);
      if (!listing) return res.status(404).json({ error: "Listing not found" });
      if (!["pending", "paused"].includes(listing.status)) return res.status(400).json({ error: `Cannot activate from status: ${listing.status}` });

      const [updated] = await db.update(marketListings).set({ status: "active", updatedAt: new Date() })
        .where(eq(marketListings.id, listingId)).returning();

      // Notify seller
      try {
        const sellerOrg = await storage.getOrgForUser(listing.sellerId);
        if (sellerOrg?.billingEmail) {
          const assetLabel = listing.assetName || `Listing #${listing.id}`;
          await sendMarketAdHocEmail(
            sellerOrg.billingEmail,
            `Your listing is live â€” ${assetLabel} â€” EdenMarket`,
            `<h2 style="margin:0 0 14px;font-size:18px;font-weight:700;color:#111827;">Your listing is now live</h2>
             <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.6;">
               Great news! <strong>${assetLabel}</strong> has been reviewed and is now visible to qualified buyers on EdenMarket.
             </p>
             <a href="${APP_URL}/market/seller" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;">
               View Seller Dashboard
             </a>`
          );
        }
      } catch (e) { console.warn("[admin] listing-activated seller email failed", e); }

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PATCH /api/admin/market/listings/:id/request-changes â€” admin requests changes on a listing
  app.patch("/api/admin/market/listings/:id/request-changes", requireAdmin, async (req, res) => {
    try {
      const listingId = parseInt(String(req.params.id), 10);
      const listing = await storage.getMarketListing(listingId);
      if (!listing) return res.status(404).json({ error: "Listing not found" });

      const { note } = z.object({ note: z.string().min(1).max(1000) }).parse(req.body);

      await db.update(marketListings).set({ status: "draft", adminNote: note, updatedAt: new Date() })
        .where(eq(marketListings.id, listingId));

      // Notify seller
      try {
        const sellerOrg = await storage.getOrgForUser(listing.sellerId);
        if (sellerOrg?.billingEmail) {
          const assetLabel = listing.assetName || `Listing #${listing.id}`;
          await sendMarketAdHocEmail(
            sellerOrg.billingEmail,
            `Listing review â€” action required â€” ${assetLabel} â€” EdenMarket`,
            `<h2 style="margin:0 0 14px;font-size:18px;font-weight:700;color:#111827;">Your listing needs a few changes</h2>
             <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.6;">
               Our team has reviewed <strong>${assetLabel}</strong> and has some feedback before we can publish it.
             </p>
             <div style="background:#fef9c3;border:1px solid #fde047;border-radius:6px;padding:14px 16px;margin:0 0 24px;">
               <p style="margin:0;font-size:14px;color:#713f12;">${note}</p>
             </div>
             <a href="${APP_URL}/market/seller" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;">
               Edit Listing
             </a>`
          );
        }
      } catch (e) { console.warn("[admin] listing-request-changes seller email failed", e); }

      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // GET /api/market/deals/:id/documents â€” list documents
  // Each row is enriched with view-tracking metadata derived from
  // market_deal_document_views, scoped to "the other party's views" so each
  // side sees engagement signal from the counterparty (plus their own opens
  // as confirmation).
  app.get("/api/market/deals/:id/documents", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      // Task #714 â€” lenient gate: allowed during 30d grace, blocked once expired.
      const docReadOrg = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, docReadOrg))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const dealId = parseInt(String(req.params.id), 10);
      if (isNaN(dealId)) return res.status(400).json({ error: "Invalid deal ID" });
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      if (deal.sellerId !== userId && deal.buyerId !== userId) return res.status(403).json({ error: "Access denied" });
      if (!deal.ndaSignedAt) return res.status(403).json({ error: "NDA must be signed before accessing documents" });
      const docs = await storage.getMarketDealDocuments(dealId);

      // Compute view stats per document. Each side sees:
      //   - lastViewedByCounterparty / viewCountByCounterparty: opens by the OTHER party only
      //   - ownViews: their own opens (as confirmation)
      const allViews = await storage.getMarketDealDocumentViews(docs.map(d => d.id));
      const viewsByDoc = new Map<number, typeof allViews>();
      for (const v of allViews) {
        const arr = viewsByDoc.get(v.documentId) ?? [];
        arr.push(v);
        viewsByDoc.set(v.documentId, arr);
      }

      // Generate short-lived signed URLs for each document
      const sbUrl = process.env.VITE_SUPABASE_URL;
      const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      let sbAdmin: ReturnType<typeof import("@supabase/supabase-js").createClient> | null = null;
      if (sbUrl && sbServiceKey && docs.length > 0) {
        try {
          const { createClient: createSbClient } = await import("@supabase/supabase-js");
          sbAdmin = createSbClient(sbUrl, sbServiceKey);
        } catch (e) { console.warn("[market] supabase client init failed for deal docs", e); }
      }

      const enriched = await Promise.all(docs.map(async (doc) => {
        let fileUrl = doc.fileUrl;
        if (sbAdmin && !doc.fileUrl.startsWith("http")) {
          try {
            const { data } = await sbAdmin.storage.from("market-deal-docs").createSignedUrl(doc.fileUrl, 3600);
            fileUrl = data?.signedUrl ?? doc.fileUrl;
          } catch (e) { console.warn("[market] signed URL generation failed for doc", doc.id, e); }
        }

        // Views by the *other* party only â€” each side already knows what they
        // themselves opened, the value is seeing the counterparty engage.
        const docViews = viewsByDoc.get(doc.id) ?? [];
        const counterpartyViews = docViews.filter(v => v.viewerId !== userId);
        const ownViews = docViews.filter(v => v.viewerId === userId);
        const last = counterpartyViews[0] ?? null; // ordered desc

        return {
          ...doc,
          fileUrl,
          lastViewedByCounterparty: last
            ? { viewerId: last.viewerId, viewedAt: last.viewedAt }
            : null,
          viewCountByCounterparty: counterpartyViews.length,
          counterpartyViews: counterpartyViews.map(v => ({ viewerId: v.viewerId, viewedAt: v.viewedAt })),
          ownViewCount: ownViews.length,
        };
      }));
      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/market/deals/:id/documents/:docId/track-view â€”
  // Records a view row for a Deal Room document open. Called by the
  // documents tab UI just before opening the signed URL. Validates the
  // viewer is a deal participant and NDA is signed (mirrors the read gate).
  app.post("/api/market/deals/:dealId/documents/:docId/track-view", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      // Task #714 â€” lenient gate: allowed during 30d grace, blocked once expired.
      const trackOrg = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, trackOrg))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const dealId = parseInt(String(req.params.dealId), 10);
      const docId = parseInt(String(req.params.docId), 10);
      if (isNaN(dealId) || isNaN(docId)) return res.status(400).json({ error: "Invalid id" });
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      if (deal.sellerId !== userId && deal.buyerId !== userId) return res.status(403).json({ error: "Access denied" });
      if (!deal.ndaSignedAt) return res.status(403).json({ error: "NDA must be signed before accessing documents" });
      const docs = await storage.getMarketDealDocuments(dealId);
      const doc = docs.find(d => d.id === docId);
      if (!doc) return res.status(404).json({ error: "Document not found" });

      const view = await storage.recordMarketDealDocumentView({ documentId: docId, viewerId: userId });
      // Notify the counterparty in real-time so their UI refetches and the
      // "Last viewed by â€¦" subline updates without a page reload.
      broadcastToUsers([deal.sellerId, deal.buyerId], "deal_document", { dealId });
      res.json({ ok: true, viewedAt: view.viewedAt });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/market/deals/:id/documents â€” upload document
  app.post("/api/market/deals/:id/documents", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      // Task #714 â€” lenient gate: in-flight deal-room document exchange is
      // allowed during the 30-day grace period so paid users can complete
      // existing diligence. Only revoke once grace has fully expired.
      const docOrg = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, docOrg))) {
        return res.status(403).json({ error: "EdenMarket subscription required" });
      }
      const dealId = parseInt(String(req.params.id), 10);
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      if (deal.sellerId !== userId && deal.buyerId !== userId) return res.status(403).json({ error: "Access denied" });
      if (!deal.ndaSignedAt) return res.status(403).json({ error: "NDA must be signed before uploading documents" });

      const multerMod = (await import("multer")).default;
      const upload = multerMod({
        storage: multerMod.memoryStorage(),
        limits: { fileSize: 50 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
          const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/msword", "application/vnd.ms-excel"];
          if (allowed.includes(file.mimetype) || file.originalname.match(/\.(pdf|docx|xlsx|doc|xls)$/i)) {
            cb(null, true);
          } else {
            cb(new Error("Only PDF, DOCX, and XLSX files are allowed"));
          }
        },
      });

      const multerReq = req as typeof req & { file?: Express.Multer.File };
      await new Promise<void>((resolve, reject) => {
        upload.single("file")(multerReq, res, (err: unknown) => { if (err) reject(err); else resolve(); });
      });

      const file = multerReq.file;
      if (!file) return res.status(400).json({ error: "No file uploaded" });

      const sbUrl = process.env.VITE_SUPABASE_URL;
      const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!sbUrl || !sbServiceKey) return res.status(503).json({ error: "Storage not configured" });

      const { createClient } = await import("@supabase/supabase-js");
      const adminClient = createClient(sbUrl, sbServiceKey);
      const ext = file.originalname.split(".").pop() ?? "bin";
      const path = `deal-${dealId}/${Date.now()}-${userId.slice(0, 8)}.${ext}`;

      const { error: uploadError } = await adminClient.storage
        .from("market-deal-docs")
        .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });

      if (uploadError) {
        // If bucket doesn't exist, create it and retry
        if (uploadError.message?.includes("not found") || uploadError.message?.includes("Bucket")) {
          await adminClient.storage.createBucket("market-deal-docs", { public: false });
          const { error: retryErr } = await adminClient.storage
            .from("market-deal-docs")
            .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
          if (retryErr) return res.status(500).json({ error: retryErr.message });
        } else {
          return res.status(500).json({ error: uploadError.message });
        }
      }

      // Store bucket path â€” signed URLs are generated on retrieval
      const doc = await storage.createMarketDealDocument({
        dealId,
        uploaderId: userId,
        fileName: file.originalname,
        fileUrl: path,
        fileSize: file.size,
      });

      void logDealEvent(dealId, userId, "document_uploaded", file.originalname);
      broadcastToUsers([deal.sellerId, deal.buyerId], "deal_document", { dealId });
      // Notify the *other* party. Fire-and-forget so a Resend hiccup never
      // blocks the actual upload from succeeding.
      void notifyDealRoomDocument(deal, userId, file.originalname).catch((e) =>
        console.warn("[market] deal-room document email failed", e),
      );
      res.json(doc);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/market/deals/:dealId/documents/:docId â€” delete document
  app.delete("/api/market/deals/:dealId/documents/:docId", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      // Task #714 â€” lenient gate: allowed during 30d grace, blocked once expired.
      const delDocOrg = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, delDocOrg))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const dealId = parseInt(String(req.params.dealId), 10);
      const docId = parseInt(String(req.params.docId), 10);
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      if (deal.sellerId !== userId && deal.buyerId !== userId) return res.status(403).json({ error: "Access denied" });
      const docs = await storage.getMarketDealDocuments(dealId);
      const doc = docs.find(d => d.id === docId);
      if (!doc) return res.status(404).json({ error: "Document not found" });
      if (doc.uploaderId !== userId) return res.status(403).json({ error: "Only the uploader can delete this document" });

      // Physically remove from Supabase Storage before deleting DB row
      if (!doc.fileUrl.startsWith("http")) {
        const sbUrl = process.env.VITE_SUPABASE_URL;
        const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (sbUrl && sbServiceKey) {
          try {
            const { createClient: createSbClient } = await import("@supabase/supabase-js");
            const sbAdmin = createSbClient(sbUrl, sbServiceKey);
            const { error: storageError } = await sbAdmin.storage.from("market-deal-docs").remove([doc.fileUrl]);
            if (storageError) console.warn("[market] storage remove failed for doc", docId, storageError.message);
          } catch (e) { console.warn("[market] storage remove exception for doc", docId, e); }
        }
      }

      await storage.deleteMarketDealDocument(docId, userId);
      void logDealEvent(dealId, userId, "document_deleted", doc.fileName);
      broadcastToUsers([deal.sellerId, deal.buyerId], "deal_document", { dealId });
      res.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // GET /api/market/deals/:id/messages â€” get messages
  app.get("/api/market/deals/:id/messages", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      // Task #714 â€” lenient gate: allowed during 30d grace, blocked once expired.
      const msgReadOrg = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, msgReadOrg))) return res.status(403).json({ error: "EdenMarket subscription required" });
      const dealId = parseInt(String(req.params.id), 10);
      if (isNaN(dealId)) return res.status(400).json({ error: "Invalid deal ID" });
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      if (deal.sellerId !== userId && deal.buyerId !== userId) return res.status(403).json({ error: "Access denied" });
      if (!deal.ndaSignedAt) return res.status(403).json({ error: "NDA must be signed before accessing messages" });
      const messages = await storage.getMarketDealMessages(dealId);
      res.json(messages);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/market/deals/:id/messages â€” send message
  app.post("/api/market/deals/:id/messages", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      // Task #714 â€” lenient gate: messaging in existing deal rooms is
      // explicitly allowed during the 30-day grace period (per acceptance
      // criteria). Only revoke once grace has fully expired.
      const msgOrg = await storage.getOrgForUser(userId);
      if (!(await userHasMarketRead(userId, msgOrg))) {
        return res.status(403).json({ error: "EdenMarket subscription required" });
      }
      const dealId = parseInt(String(req.params.id), 10);
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      if (deal.sellerId !== userId && deal.buyerId !== userId) return res.status(403).json({ error: "Access denied" });
      if (!deal.ndaSignedAt) return res.status(403).json({ error: "NDA must be signed before messaging" });

      const { body } = z.object({ body: z.string().min(1).max(4000) }).parse(req.body);
      const msg = await storage.createMarketDealMessage({ dealId, senderId: userId, body });
      void logDealEvent(dealId, userId, "message_sent");
      broadcastToUsers([deal.sellerId, deal.buyerId], "deal_message", { dealId });
      // Throttled per (deal, recipient) inside notifyDealRoomMessage so
      // a chatty back-and-forth doesn't spam either inbox.
      void notifyDealRoomMessage(deal, userId, body).catch((e) =>
        console.warn("[market] deal-room message email failed", e),
      );
      res.json(msg);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // GET /api/admin/market/deals/:id/events â€” deal activity log (admin only)
  app.get("/api/admin/market/deals/:id/events", async (req, res) => {
    try {
      const dealId = parseInt(String(req.params.id), 10);
      if (isNaN(dealId)) return res.status(400).json({ error: "Invalid deal ID" });
      const events = await db.execute(
        sql`SELECT id, deal_id, actor_id, event_type, detail, created_at FROM market_deal_events WHERE deal_id = ${dealId} ORDER BY created_at ASC`
      );
      res.json(events.rows);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // â”€â”€ Admin: Deal Pipeline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // GET /api/admin/market/deals/:id â€” full deal room payload (admin read-only)
  app.get("/api/admin/market/deals/:id", async (req, res) => {
    try {
      const dealId = parseInt(String(req.params.id), 10);
      if (isNaN(dealId)) return res.status(400).json({ error: "Invalid deal ID" });
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      const listing = await storage.getMarketListing(deal.listingId);
      const [eoi] = await db.select().from(marketEois).where(eq(marketEois.id, deal.eoiId)).limit(1);

      let ndaDocumentUrl: string | null = null;
      if (deal.ndaDocumentPath) {
        const sbUrl = process.env.VITE_SUPABASE_URL;
        const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (sbUrl && sbServiceKey) {
          try {
            const { createClient: createSbClient } = await import("@supabase/supabase-js");
            const sbAdmin = createSbClient(sbUrl, sbServiceKey);
            const { data } = await sbAdmin.storage.from("market-deal-docs").createSignedUrl(deal.ndaDocumentPath, 3600);
            ndaDocumentUrl = data?.signedUrl ?? null;
          } catch (e) { console.warn("[market] admin NDA signed URL failed", e); }
        }
      }

      res.json({ deal, listing: listing ?? null, eoi: eoi ?? null, ndaDocumentUrl });
    } catch (err: unknown) {
      res.status(500).json({ error: "Server error" });
    }
  });

  // GET /api/admin/market/deals/:id/messages â€” read-only deal message thread
  app.get("/api/admin/market/deals/:id/messages", async (req, res) => {
    try {
      const dealId = parseInt(String(req.params.id), 10);
      if (isNaN(dealId)) return res.status(400).json({ error: "Invalid deal ID" });
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      const messages = await storage.getMarketDealMessages(dealId);
      res.json(messages);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/admin/market/deals/:id/documents â€” read-only deal document list
  // Admins see the FULL view log (both parties' opens) for compliance and
  // dispute resolution.
  app.get("/api/admin/market/deals/:id/documents", async (req, res) => {
    try {
      const dealId = parseInt(String(req.params.id), 10);
      if (isNaN(dealId)) return res.status(400).json({ error: "Invalid deal ID" });
      const deal = await storage.getMarketDeal(dealId);
      if (!deal) return res.status(404).json({ error: "Deal not found" });
      const docs = await storage.getMarketDealDocuments(dealId);
      const allViews = await storage.getMarketDealDocumentViews(docs.map(d => d.id));
      const viewsByDoc = new Map<number, typeof allViews>();
      for (const v of allViews) {
        const arr = viewsByDoc.get(v.documentId) ?? [];
        arr.push(v);
        viewsByDoc.set(v.documentId, arr);
      }

      // Generate signed URLs for admin visibility
      const sbUrl = process.env.VITE_SUPABASE_URL;
      const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      let sbAdmin: ReturnType<typeof import("@supabase/supabase-js").createClient> | null = null;
      if (sbUrl && sbServiceKey && docs.length > 0) {
        try {
          const { createClient: createSbClient } = await import("@supabase/supabase-js");
          sbAdmin = createSbClient(sbUrl, sbServiceKey);
        } catch (e) { console.warn("[market] admin supabase client init failed", e); }
      }

      const enriched = await Promise.all(docs.map(async (doc) => {
        let fileUrl = doc.fileUrl;
        if (sbAdmin && !doc.fileUrl.startsWith("http")) {
          try {
            const { data } = await sbAdmin.storage.from("market-deal-docs").createSignedUrl(doc.fileUrl, 3600);
            fileUrl = data?.signedUrl ?? doc.fileUrl;
          } catch (e) { console.warn("[market] admin signed URL failed for doc", doc.id, e); }
        }
        const docViews = viewsByDoc.get(doc.id) ?? [];
        return {
          ...doc,
          fileUrl,
          views: docViews.map(v => ({
            viewerId: v.viewerId,
            viewedAt: v.viewedAt,
            viewerRole: v.viewerId === deal.sellerId ? "seller" : v.viewerId === deal.buyerId ? "buyer" : "other",
          })),
          viewCount: docViews.length,
        };
      }));
      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/admin/market/deals â€” all deals pipeline view
  app.get("/api/admin/market/deals", async (req, res) => {
    try {
      const deals = await storage.getAllMarketDeals();
      const enriched = await Promise.all(deals.map(async d => {
        const listing = await storage.getMarketListing(d.listingId);
        const [eoiRow] = await db.select().from(marketEois).where(eq(marketEois.id, d.eoiId)).limit(1);
        const [sellerOrg, buyerOrg] = await Promise.all([
          storage.getOrgForUser(d.sellerId),
          storage.getOrgForUser(d.buyerId),
        ]);
        return {
          ...d,
          assetLabel: listing?.blind ? `Blind ${listing.therapeuticArea}` : (listing?.assetName ?? `Listing #${d.listingId}`),
          therapeuticArea: listing?.therapeuticArea ?? "",
          eoiCreatedAt: eoiRow?.createdAt ?? null,
          sellerLabel: sellerOrg?.name ?? d.sellerId.slice(0, 8),
          buyerLabel: buyerOrg?.name ?? d.buyerId.slice(0, 8),
        };
      }));
      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Shared helper â€” generates a success-fee Stripe invoice for a closed deal.
  // Used by both the admin manual invoice endpoint and the seller-driven
  // auto-fire path on deal close. Returns a discriminated result so callers
  // can map failures to the correct HTTP status.
  type SuccessFeeResult =
    | { ok: true; deal: import("@shared/schema").MarketDeal; feeAmount: number; invoiceId: string | null; invoiceUrl?: string | null; note?: string }
    | { ok: false; status: number; error: string; invoiceId?: string };

  async function computeSuccessFeeAmount(dealSizeM: number): Promise<number> {
    if (dealSizeM <= 5) return 10000;
    if (dealSizeM <= 50) return 30000;
    return 50000;
  }

  async function generateSuccessFeeInvoice(dealId: number, dealSizeM: number): Promise<SuccessFeeResult> {
    const deal = await storage.getMarketDeal(dealId);
    if (!deal) return { ok: false, status: 404, error: "Deal not found" };
    if (deal.status !== "closed") {
      return { ok: false, status: 400, error: "Invoice can only be generated when the deal is marked Closed" };
    }
    if (deal.successFeeInvoiceId) {
      return { ok: false, status: 409, error: "Invoice already generated for this deal", invoiceId: deal.successFeeInvoiceId };
    }
    if (!Number.isInteger(dealSizeM) || dealSizeM <= 0) {
      return { ok: false, status: 400, error: "dealSizeM must be a positive integer (millions USD)" };
    }

    const feeAmount = await computeSuccessFeeAmount(dealSizeM);

    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET_KEY) {
      const updated = await storage.updateMarketDeal(dealId, {
        successFeeDealSizeM: dealSizeM,
        successFeeAmount: feeAmount,
      });
      return { ok: true, deal: updated!, feeAmount, invoiceId: null, note: "Stripe not configured â€” recorded locally" };
    }

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2026-03-25.dahlia" });

    const sellerOrg = await storage.getOrgForUser(deal.sellerId);
    let customerId = sellerOrg?.stripeCustomerId;
    if (!customerId && sellerOrg?.billingEmail) {
      const customer = await stripe.customers.create({
        email: sellerOrg.billingEmail,
        name: sellerOrg.name ?? undefined,
        metadata: { orgId: String(sellerOrg.id), dealId: String(dealId) },
      });
      customerId = customer.id;
    }
    if (!customerId) {
      return { ok: false, status: 400, error: "Seller has no Stripe customer â€” add billing email first" };
    }

    const listing = await storage.getMarketListing(deal.listingId);
    const assetLabel = listing?.blind ? `Blind ${listing.therapeuticArea} opportunity` : (listing?.assetName || `Listing #${deal.listingId}`);

    const invoice = await stripe.invoices.create({
      customer: customerId,
      auto_advance: false,
      description: `EdenMarket success fee â€” ${assetLabel} â€” Deal #${dealId}`,
      metadata: { dealId: String(dealId), dealSizeM: String(dealSizeM) },
    });

    await stripe.invoiceItems.create({
      customer: customerId,
      invoice: invoice.id,
      amount: feeAmount * 100,
      currency: "usd",
      description: `EdenMarket success fee ($${dealSizeM}M deal â†’ $${(feeAmount / 1000).toFixed(0)}k tier)`,
    });

    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
    await stripe.invoices.sendInvoice(finalizedInvoice.id);

    const updated = await storage.updateMarketDeal(dealId, {
      successFeeDealSizeM: dealSizeM,
      successFeeAmount: feeAmount,
      successFeeInvoiceId: finalizedInvoice.id,
    });

    return {
      ok: true,
      deal: updated!,
      feeAmount,
      invoiceId: finalizedInvoice.id,
      invoiceUrl: finalizedInvoice.hosted_invoice_url ?? null,
    };
  }

  // POST /api/admin/market/deals/:id/invoice â€” generate success fee invoice (manual fallback)
  app.post("/api/admin/market/deals/:id/invoice", async (req, res) => {
    try {
      const dealId = parseInt(String(req.params.id), 10);
      const { dealSizeM } = z.object({ dealSizeM: z.number().int().positive() }).parse(req.body);
      const result = await generateSuccessFeeInvoice(dealId, dealSizeM);
      if (!result.ok) {
        return res.status(result.status).json({ error: result.error, ...(result.invoiceId ? { invoiceId: result.invoiceId } : {}) });
      }
      res.json({ deal: result.deal, feeAmount: result.feeAmount, invoiceId: result.invoiceId, invoiceUrl: result.invoiceUrl, note: result.note });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

}