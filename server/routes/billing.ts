import type { Express } from "express";
import Stripe from "stripe";
import { z } from "zod";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { storage } from "../storage";
import { verifyAnyAuth } from "../lib/supabaseAuth";
import {
  sendEmail, sendSubscriptionWelcomeEmail, sendPaymentFailedEmail,
  sendRenewalConfirmationEmail, sendMarketGraceNoticeEmail, APP_URL,
} from "../email";
import { syncOrgMembersMarketEntitlement } from "../lib/marketEntitlement";
import { captureException as sentryCaptureException } from "../lib/sentry";

const STRIPE_SECRET_KEY_FOR_EXPORT = process.env.STRIPE_SECRET_KEY;
export function createStripe(): Stripe | null {
  if (!STRIPE_SECRET_KEY_FOR_EXPORT) return null;
  return new Stripe(STRIPE_SECRET_KEY_FOR_EXPORT, { apiVersion: "2026-03-25.dahlia" });
}

export function registerBillingRoutes(app: Express): void {
  // â”€â”€ Stripe subscription routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //
  // All Stripe routes gracefully degrade when STRIPE_SECRET_KEY is absent.
  // Keys are wired in separately after smoke-testing the checkout flow.
  //
  // DB MIGRATION NOTE: The 4 Stripe columns on the organizations table
  // (stripe_customer_id, stripe_subscription_id, stripe_status, stripe_price_id)
  // were applied manually via SQL ALTER TABLE IF NOT EXISTS.
  // This file serves as the in-repo record; re-run via:
  //   ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
  //   ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
  //   ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_status TEXT;
  //   ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;
  //
  // BILLING EVENTS MIGRATION: stripe_billing_events table for audit log.
  // Applied automatically on startup via createStripeBillingEventsTable() in server/index.ts.
  // Manual equivalent:
  //   CREATE TABLE IF NOT EXISTS stripe_billing_events (
  //     id SERIAL PRIMARY KEY,
  //     org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  //     stripe_subscription_id TEXT,
  //     event_type TEXT NOT NULL,
  //     old_price_id TEXT,
  //     new_price_id TEXT,
  //     old_plan_tier TEXT,
  //     new_plan_tier TEXT,
  //     stripe_status TEXT,
  //     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  //   );

  type StripePlanId = "individual" | "team5" | "team10";

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

  // Price ID map â€” set via env vars in Stripe Dashboard
  const STRIPE_PRICE_MAP: Record<StripePlanId, string | undefined> = {
    individual: process.env.STRIPE_PRICE_INDIVIDUAL,
    team5: process.env.STRIPE_PRICE_TEAM5,
    team10: process.env.STRIPE_PRICE_TEAM10,
  };

  // Plan tier and seat limits for each plan ID
  const PLAN_TIER_MAP: Record<StripePlanId, string> = {
    individual: "individual",
    team5: "team5",
    team10: "team10",
  };
  const PLAN_SEAT_MAP: Record<StripePlanId, number> = {
    individual: 1,
    team5: 5,
    team10: 10,
  };

  function isStripePlanId(val: string): val is StripePlanId {
    return val === "individual" || val === "team5" || val === "team10";
  }

  if (!STRIPE_SECRET_KEY) {
    console.warn("[stripe] STRIPE_SECRET_KEY not set â€” Stripe routes will return 503 until configured");
  }
  if (!STRIPE_WEBHOOK_SECRET) {
    console.warn("[stripe] STRIPE_WEBHOOK_SECRET not set â€” webhook route will reject all events until configured");
  }

  // Helper: initialise stripe SDK (returns null if key absent)
  function getStripe() {
    if (!STRIPE_SECRET_KEY) return null;
    return new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2026-03-25.dahlia" });
  }

  // Helper: extract the string ID from a Stripe expandable field (string | { id: string } | null)
  function stripeId(field: string | { id: string } | null | undefined): string {
    if (!field) return "";
    if (typeof field === "string") return field;
    return field.id;
  }

  // Helper: resolve or auto-create an org for a user so self-serve checkout always works.
  // After creating, industry_profiles.org_id is set so repeated checkout attempts always
  // find the same org via getOrgForUser â€” preventing duplicate org creation.
  async function resolveOrCreateOrgForUser(
    userId: string,
    planId: StripePlanId,
  ) {
    // 1. Primary lookup via industry_profiles.org_id
    const existing = await storage.getOrgForUser(userId);
    if (existing) return existing;

    // 2. Auto-create a personal org, add membership, and link via industry_profile.org_id
    //    so the next call to getOrgForUser returns this org (preventing duplicate creation).
    const existingProfile = await storage.getIndustryProfileByUserId(userId).catch(() => null);
    const newOrgName = existingProfile?.companyName?.trim() || "Personal Workspace";
    const newOrg = await storage.createOrganization({
      name: newOrgName,
      planTier: "none",
      seatLimit: PLAN_SEAT_MAP[planId],
      billingMethod: "stripe",
    });
    await storage.addOrgMember({ orgId: newOrg.id, userId, role: "owner", inviteSource: "self_service", inviteStatus: "active" });
    await storage.setIndustryProfileOrg(userId, newOrg.id);
    console.log(`[stripe] Auto-created org ${newOrg.id} for user ${userId}`);
    return newOrg;
  }

  // POST /api/stripe/checkout â€” create a hosted checkout session
  app.post("/api/stripe/checkout", verifyAnyAuth, async (req, res) => {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: "Stripe is not configured on this server yet" });

    try {
      const userId = req.headers["x-user-id"] as string;
      const rawPlanId = String(req.body?.planId ?? "");

      if (!isStripePlanId(rawPlanId)) {
        return res.status(400).json({ error: "Invalid planId â€” must be individual | team5 | team10" });
      }
      const planId: StripePlanId = rawPlanId;

      const priceId = STRIPE_PRICE_MAP[planId];
      if (!priceId) {
        return res.status(503).json({ error: `STRIPE_PRICE_${planId.toUpperCase()} env var not set` });
      }

      // Resolve or auto-create the user's org
      const org = await resolveOrCreateOrgForUser(userId, planId);

      // Block duplicate subscriptions â€” prevent a second checkout while active/trialing.
      // (Past-due is allowed so the user can update payment by starting a fresh session.)
      if (org.stripeStatus === "active" || org.stripeStatus === "trialing") {
        return res.status(409).json({
          error: "You already have an active subscription. Manage or upgrade your plan from Settings.",
          redirect: "/industry/settings",
        });
      }

      // Find or create Stripe customer
      let customerId: string;
      if (org.stripeCustomerId) {
        customerId = org.stripeCustomerId;
      } else {
        const billingEmail = org.billingEmail ?? undefined;
        const customer = await stripe.customers.create({
          email: billingEmail,
          metadata: { orgId: String(org.id), planId },
        });
        customerId = customer.id;
        // Pre-store customerId so webhook can locate the org if the browser redirect is skipped
        await storage.updateOrganization(org.id, { stripeCustomerId: customerId });
      }

      const origin = (req.headers.origin ?? req.headers.referer ?? "").replace(/\/$/, "");
      const baseUrl = origin || `https://${req.headers.host}`;

      // Pre-fill email: use billingEmail if set, otherwise fall through to
      // whatever Stripe collected on the customer record. This surfaces the
      // correct email in the Stripe checkout form without overriding a
      // previously-verified billing address.
      const checkoutEmail = org.billingEmail ?? undefined;

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        ...(checkoutEmail ? { customer_email: undefined } : {}), // customer already has email; don't double-set
        mode: "subscription",
        // ACH bank account listed first â€” at these price points ($1,999â€“$16,999/mo)
        // card fees (2.9%) are $58â€“$493/month per customer vs $5 flat for ACH.
        // Plaid instant verification (financial_connections below) eliminates most ACH friction.
        payment_method_types: ["us_bank_account", "card"],
        payment_method_options: {
          us_bank_account: {
            verification_method: "automatic",
            financial_connections: { permissions: ["payment_method"] },
          },
        },
        allow_promotion_codes: true,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/pricing`,
        metadata: { orgId: String(org.id), planId },
        subscription_data: {
          // Only offer the free trial to first-time subscribers.
          // If the org already has (or had) a Stripe subscription, skip the trial.
          ...(org.stripeSubscriptionId ? {} : { trial_period_days: 3 }),
          metadata: { orgId: String(org.id), planId },
        },
      });

      res.json({ url: session.url });
    } catch (err: any) {
      console.error("[stripe/checkout]", err?.message);
      sentryCaptureException(err);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  // GET /api/stripe/verify-session?session_id=... â€” verify checkout completion
  // Security: org resolution tracks HOW the org was found; any org resolved by id (not by caller's
  // own userId) triggers a hard membership check and returns 403 on mismatch to prevent IDOR.
  app.get("/api/stripe/verify-session", verifyAnyAuth, async (req, res) => {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: "Stripe is not configured" });

    try {
      const sessionId = String(req.query.session_id ?? "");
      if (!sessionId) return res.status(400).json({ error: "session_id is required" });

      const userId = req.headers["x-user-id"] as string;

      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["subscription", "customer"],
      });

      // Only activate plan for definitively paid or fully-covered (coupon/trial) sessions.
      // "status === complete" alone is insufficient â€” a session can be complete with payment_status
      // "unpaid" (e.g. payment failed). Both conditions must agree before granting access.
      const safePaymentStatuses = ["paid", "no_payment_required"] as const;
      if (!(safePaymentStatuses as ReadonlyArray<string>).includes(session.payment_status)) {
        return res.status(402).json({ error: "Payment not completed â€” session payment_status is not confirmed" });
      }

      const rawPlanId = String(session.metadata?.planId ?? "");
      const planId: StripePlanId = isStripePlanId(rawPlanId) ? rawPlanId : "individual";
      const planTier = PLAN_TIER_MAP[planId];

      const customerId = stripeId(session.customer);

      // â”€â”€ Org resolution with ownership tracking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // org is found in one of four ways â€” order matters for ownership semantics:
      // 1) metadata orgId: requires membership check (could be any user's org if session_id leaked)
      // 2) caller's own industry_profile.org_id: guaranteed ownership â€” no check needed
      // 3) Stripe customer ID: requires membership check (customer was created for a specific org)
      // 4) auto-create: guaranteed ownership â€” created for this caller

      type OrgSource = "metadata" | "caller" | "customer" | "created";
      let org: Awaited<ReturnType<typeof storage.getOrganization>> | null = null;
      let orgSource: OrgSource = "created";

      const metaOrgId = parseInt(session.metadata?.orgId ?? "0", 10);
      if (metaOrgId) {
        org = await storage.getOrganization(metaOrgId) ?? null;
        if (org) orgSource = "metadata";
      }

      if (!org) {
        org = await storage.getOrgForUser(userId) ?? null;
        if (org) orgSource = "caller";
      }

      if (!org && customerId) {
        org = await storage.getOrgByStripeCustomer(customerId) ?? null;
        if (org) orgSource = "customer";
      }

      if (!org) {
        // Auto-create â€” fully owned by this caller
        const callerProfile = await storage.getIndustryProfileByUserId(userId).catch(() => null);
        const autoOrgName = callerProfile?.companyName?.trim() || "Personal Workspace";
        org = await storage.createOrganization({
          name: autoOrgName,
          planTier: "none",
          seatLimit: PLAN_SEAT_MAP[planId],
          billingMethod: "stripe",
        });
        await storage.addOrgMember({ orgId: org.id, userId, role: "owner", inviteSource: "self_service", inviteStatus: "active" });
        await storage.setIndustryProfileOrg(userId, org.id);
        orgSource = "created";
        console.log(`[stripe/verify-session] Auto-created org ${org.id} for user ${userId}`);
      }

      // Ownership enforcement: if org came from metadata or customer-id lookup,
      // verify the caller is a member â€” return 403 if not.
      if (orgSource === "metadata" || orgSource === "customer") {
        const members = await storage.getOrgMembers(org.id);
        if (!members.some((m) => m.userId === userId)) {
          console.warn(`[stripe/verify-session] User ${userId} not authorized for org ${org.id} (source=${orgSource})`);
          return res.status(403).json({ error: "Not authorized for this checkout session" });
        }
      }

      // Extract subscription details from the expanded Stripe response
      type ExpandedSub = { id: string; status: string; current_period_end: number; trial_end: number | null; items: { data: { price: { id: string } }[] } };
      const sub: ExpandedSub | null =
        session.subscription && typeof session.subscription === "object"
          ? (session.subscription as unknown as ExpandedSub)
          : null;
      const subscriptionId = sub?.id ?? (typeof session.subscription === "string" ? session.subscription : "");
      const stripeStatus = sub?.status ?? "active";
      const stripePriceId = sub?.items?.data?.[0]?.price?.id ?? "";
      const stripeTrialEnd = sub?.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;

      // Write Stripe fields + grant plan access
      const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end * 1000) : null;
      const updatedOrg = await storage.applyStripeSubscription(org.id, {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripeStatus,
        stripePriceId,
        planTier,
        stripeCurrentPeriodEnd: periodEnd,
        stripeCancelAt: null,
      });

      // Ensure industry_profile.orgId is linked so subsequent getOrgForUser calls succeed
      await storage.setIndustryProfileOrg(userId, org.id);

      const nextBillingAt = sub?.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null;

      console.log(`[stripe] Verified session ${sessionId}: org ${org.id} â†’ planTier=${planTier}, status=${stripeStatus}`);

      res.json({
        planTier,
        planId,
        orgName: updatedOrg?.name ?? null,
        nextBillingAt,
        stripeStatus,
        stripeTrialEnd,
      });
    } catch (err: any) {
      console.error("[stripe/verify-session]", err?.message);
      sentryCaptureException(err);
      res.status(500).json({ error: "Failed to verify session" });
    }
  });

  // POST /api/stripe/upgrade-plan â€” change plan mid-cycle with proration (any direction)
  // Body: { targetPlanId: "individual" | "team5" | "team10" }
  app.post("/api/stripe/upgrade-plan", verifyAnyAuth, async (req, res) => {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: "Stripe is not configured on this server yet" });

    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(400).json({ error: "Missing user id" });

      const rawTargetPlanId = String(req.body?.targetPlanId ?? "");
      if (!isStripePlanId(rawTargetPlanId)) {
        return res.status(400).json({ error: "targetPlanId must be individual | team5 | team10" });
      }
      const targetPlanId: StripePlanId = rawTargetPlanId;

      const org = await storage.getOrgForUser(userId);
      if (!org) return res.status(404).json({ error: "No organisation found for this user" });

      // Only the org owner can change the plan
      const members = await storage.getOrgMembers(org.id);
      const callerMember = members.find((m) => m.userId === userId);
      if (!callerMember || callerMember.role !== "owner") {
        return res.status(403).json({ error: "Only the org owner can change the plan" });
      }

      if (!org.stripeSubscriptionId) {
        return res.status(400).json({ error: "No active Stripe subscription found â€” use checkout to subscribe first" });
      }

      if (org.planTier === targetPlanId) {
        return res.status(400).json({ error: `Already on the ${targetPlanId} plan` });
      }

      const newPriceId = STRIPE_PRICE_MAP[targetPlanId];
      if (!newPriceId) {
        return res.status(503).json({ error: `STRIPE_PRICE_${targetPlanId.toUpperCase()} env var not set` });
      }

      const currentSub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
      const itemId = currentSub.items?.data?.[0]?.id;
      if (!itemId) {
        return res.status(500).json({ error: "Could not find subscription item to update" });
      }

      const updatedSub = await stripe.subscriptions.update(org.stripeSubscriptionId, {
        items: [{ id: itemId, price: newPriceId }],
        proration_behavior: "create_prorations",
      });

      const newStripePriceId = updatedSub.items?.data?.[0]?.price?.id ?? newPriceId;
      const newStatus = updatedSub.status ?? "active";

      // Do NOT write plan tier here — the authoritative update comes from the
      // customer.subscription.updated webhook once Stripe confirms payment.
      // Writing here races against proration invoice failure and can grant
      // a free upgrade when the charge subsequently fails.
      console.log(`[stripe/upgrade-plan] Org ${org.id}: plan change to ${targetPlanId} submitted (sub ${org.stripeSubscriptionId}) — awaiting webhook confirmation`);

      return res.json({ ok: true, pending: true, planTier: PLAN_TIER_MAP[targetPlanId], seatLimit: PLAN_SEAT_MAP[targetPlanId] });
    } catch (err: any) {
      console.error("[stripe/upgrade-plan]", err?.message);
      return res.status(500).json({ error: "Failed to change plan" });
    }
  });

  // POST /api/stripe/webhook â€” handle Stripe events
  // Signature verification is REQUIRED. Returns 503 when STRIPE_WEBHOOK_SECRET is absent.
  app.post("/api/stripe/webhook", async (req, res) => {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: "Stripe not configured â€” STRIPE_SECRET_KEY not set" });

    if (!STRIPE_WEBHOOK_SECRET) {
      console.error("[stripe/webhook] Rejecting event â€” STRIPE_WEBHOOK_SECRET not set");
      return res.status(503).json({ error: "Webhook endpoint not ready â€” STRIPE_WEBHOOK_SECRET not configured" });
    }

    const sig = req.headers["stripe-signature"];
    if (!sig) {
      console.error("[stripe/webhook] Rejecting event â€” missing stripe-signature header");
      return res.status(400).json({ error: "Missing stripe-signature header" });
    }

    const rawBody = req.rawBody as Buffer | string | undefined;
    if (!rawBody) {
      console.error("[stripe/webhook] rawBody missing - cannot verify signature. Returning 400 so Stripe retries.");
      return res.status(400).json({ error: "rawBody unavailable - cannot verify signature" });
    }

    let event: { type: string; data: { object: Record<string, unknown> } };
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET) as unknown as { type: string; data: { object: Record<string, unknown> } };
    } catch (err: any) {
      console.error("[stripe/webhook] Signature verification failed:", err?.message);
      return res.status(400).json({ error: `Webhook signature error: ${err?.message}` });
    }

    const eventType: string = event.type;
    console.log(`[stripe/webhook] Received event: ${eventType}`);

    try {
      switch (eventType) {
        case "checkout.session.completed": {
          // Safety sync fallback â€” verify-session handles the primary write after the browser redirect.
          const sess = event.data.object as Record<string, unknown>;
          const sessMeta = sess["metadata"] as Record<string, string> | undefined;
          const orgId = parseInt(String(sessMeta?.["orgId"] || "0"), 10);
          if (!orgId) break;

          // EdenMarket subscriptions are separate from the main plan tier system
          if (sessMeta?.["product"] === "edenmarket") {
            const customerEM = stripeId(sess["customer"] as string | { id: string } | null);
            const subEM = stripeId(sess["subscription"] as string | { id: string } | null);
            await storage.updateOrganization(orgId, {
              edenMarketAccess: true,
              edenMarketStripeSubId: subEM || undefined,
              ...(customerEM ? { stripeCustomerId: customerEM } : {}),
            });
            // Task #752 â€” sync per-user entitlement.
            await syncOrgMembersMarketEntitlement(orgId, true);
            console.log(`[stripe/webhook] checkout.session.completed (edenmarket): org ${orgId} access activated, sub=${subEM}`);
            break;
          }

          const rawPlanIdC = String(sessMeta?.["planId"] || "");
          const planIdC: StripePlanId = isStripePlanId(rawPlanIdC) ? rawPlanIdC : "individual";
          const planTierC = PLAN_TIER_MAP[planIdC];
          const customerC = stripeId(sess["customer"] as string | { id: string } | null);
          const subC = stripeId(sess["subscription"] as string | { id: string } | null);
          // Capture billing email from Stripe's collected customer_details so
          // renewal and payment-failure emails always have a delivery address.
          const collectedEmail = (sess["customer_details"] as Record<string, unknown> | null)?.["email"] as string | undefined;
          // Derive status: if payment_status is "no_payment_required" the subscription is in trial
          const paymentStatusC = String(sess["payment_status"] ?? "paid");
          const initialStripeStatus = paymentStatusC === "no_payment_required" ? "trialing" : "active";
          if (customerC && orgId) {
            const seatLimitC = isStripePlanId(rawPlanIdC) ? PLAN_SEAT_MAP[rawPlanIdC] : undefined;

            // Retrieve the subscription early so we can record the exact Stripe Price ID.
            let resolvedPriceId: string = STRIPE_PRICE_MAP[planIdC] ?? "";
            let preloadedStripeSub: import("stripe").Stripe.Subscription | null = null;
            if (subC) {
              try {
                const stripeInstance = getStripe();
                if (stripeInstance) {
                  const fetchedSub = await stripeInstance.subscriptions.retrieve(subC);
                  preloadedStripeSub = fetchedSub;
                  const actualPriceId = fetchedSub.items.data[0]?.price?.id;
                  if (actualPriceId) resolvedPriceId = actualPriceId;
                }
              } catch (subPreloadErr: unknown) {
                console.warn("[stripe/webhook] Could not retrieve subscription for price ID:", (subPreloadErr as Error)?.message);
                console.warn(`[stripe/webhook] Falling back to mapped price ID for plan '${planIdC}' â€” actual Stripe price may differ`);
              }
            }

            await storage.applyStripeSubscription(orgId, {
              stripeCustomerId: customerC,
              stripeSubscriptionId: subC,
              stripeStatus: initialStripeStatus,
              stripePriceId: resolvedPriceId,
              planTier: planTierC,
              ...(seatLimitC !== undefined ? { seatLimit: seatLimitC } : {}),
              // Persist the email Stripe collected so renewal/failure emails always resolve
              ...(collectedEmail ? { billingEmail: collectedEmail } : {}),
            }, "checkout_completed");
            console.log(`[stripe/webhook] checkout.session.completed: org ${orgId} â†’ ${planTierC}, priceId=${resolvedPriceId}`);

            if (subC) {
              try {
                const org = await storage.getOrganization(orgId);
                const billingEmail = org?.billingEmail
                  ?? (sess["customer_details"] as Record<string, unknown> | null)?.["email"] as string | undefined
                  ?? undefined;
                if (!billingEmail) {
                  console.warn(`[stripe/webhook] No billing email for org ${orgId} â€” skipping welcome email`);
                } else {
                  // Atomically claim the send slot before sending to prevent concurrent duplicate sends.
                  // markWelcomeEmailSent uses WHERE welcome_email_sent_sub_id IS DISTINCT FROM subC,
                  // so only one concurrent webhook delivery wins (returns true); others skip.
                  const claimed = await storage.markWelcomeEmailSent(orgId, subC);
                  if (!claimed) {
                    console.log(`[stripe/webhook] Welcome email already sent for sub ${subC} â€” skipping`);
                  } else {
                    const seatCount = isStripePlanId(rawPlanIdC) ? PLAN_SEAT_MAP[rawPlanIdC] : 1;
                    let nextBillingDate = "â€”";
                    try {
                      // Reuse the already-retrieved subscription when available.
                      const stripeSub = preloadedStripeSub ?? await (async () => {
                        const stripeInstance = getStripe();
                        return stripeInstance ? stripeInstance.subscriptions.retrieve(subC) : null;
                      })();
                      if (stripeSub) {
                        const periodEnd: number = (stripeSub as unknown as { current_period_end: number }).current_period_end;
                        nextBillingDate = new Date(periodEnd * 1000).toLocaleDateString("en-US", {
                          year: "numeric", month: "long", day: "numeric",
                        });
                      }
                    } catch (subErr: unknown) {
                      console.warn("[stripe/webhook] Could not retrieve subscription for billing date:", (subErr as Error)?.message);
                    }
                    try {
                      await sendSubscriptionWelcomeEmail(
                        billingEmail,
                        org?.name ?? "",
                        planTierC,
                        seatCount,
                        nextBillingDate,
                      );
                      console.log(`[stripe/webhook] Welcome email sent to ${billingEmail} for org ${orgId}, sub ${subC}`);
                    } catch (sendErr: unknown) {
                      // Release the claim so the next Stripe retry can attempt delivery again.
                      console.error("[stripe/webhook] Welcome email delivery failed â€” releasing claim:", (sendErr as Error)?.message);
                      await storage.releaseWelcomeEmailClaim(orgId, subC).catch((e: unknown) =>
                        console.error("[stripe/webhook] Failed to release welcome email claim:", (e as Error)?.message)
                      );
                    }
                  }
                }
              } catch (emailErr: unknown) {
                console.error("[stripe/webhook] Error preparing welcome email:", (emailErr as Error)?.message);
              }
            }
          }
          break;
        }

        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const sub = event.data.object as Record<string, unknown>;
          const stripeCustomerId = String(sub["customer"] ?? "");
          const stripeSubscriptionId = String(sub["id"] ?? "");

          // EdenMarket subscriptions are tracked separately from main plan tier.
          // Activate access idempotently when status is active or trialing; revoke otherwise.
          const subMetaCU = sub["metadata"] as Record<string, string> | undefined;
          if (subMetaCU?.["product"] === "edenmarket") {
            const orgEMCU = stripeCustomerId ? await storage.getOrgByStripeCustomer(stripeCustomerId) : null;
            if (!orgEMCU) {
              console.warn(`[stripe/webhook] ${eventType} (edenmarket): no org for customer ${stripeCustomerId}`);
              break;
            }
            const subStatusCU = String(sub["status"] ?? "");
            const isActive = subStatusCU === "active" || subStatusCU === "trialing";
            const isCanceled = subStatusCU === "canceled";
            // Task #714 â€” three transitions:
            //   active|trialing  â†’ clear grace, ensure access true (reactivation
            //                      after a previous cancel rearms idempotency).
            //   canceled         â†’ start a 30-day grace window (mirrors the
            //                      subscription.deleted branch). Reads continue,
            //                      writes are blocked by requireFullMarketAccess,
            //                      and after 30d getMarketAccessState rejects.
            //   anything else    â†’ past_due / unpaid / incomplete: leave the
            //                      org's access state untouched. Stripe will
            //                      eventually fire either a reactivation
            //                      (active) or a cancellation, which then drives
            //                      the real state transition.
            if (isActive) {
              await storage.updateOrganization(orgEMCU.id, {
                edenMarketAccess: true,
                edenMarketStripeSubId: stripeSubscriptionId,
                marketAccessExpiresAt: null,
                marketGraceEmailSentAt: null,
              });
              await syncOrgMembersMarketEntitlement(orgEMCU.id, true);
              console.log(`[stripe/webhook] ${eventType} (edenmarket): org ${orgEMCU.id} reactivated, status=${subStatusCU}, sub=${stripeSubscriptionId}`);
            } else if (isCanceled) {
              const alreadyInGrace = orgEMCU.marketAccessExpiresAt && orgEMCU.marketAccessExpiresAt > new Date();
              const graceEndsAt = alreadyInGrace
                ? orgEMCU.marketAccessExpiresAt!
                : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
              await storage.updateOrganization(orgEMCU.id, {
                edenMarketAccess: true,
                edenMarketStripeSubId: null,
                marketAccessExpiresAt: graceEndsAt,
              });
              // Task #752 â€” revoke stripe-sourced per-user entitlements so
              // canceled buyers immediately drop to org-only read access
              // (and lose write access). Admin grants are preserved.
              await syncOrgMembersMarketEntitlement(orgEMCU.id, false);
              console.log(`[stripe/webhook] ${eventType} (edenmarket): org ${orgEMCU.id} entered/extended 30-day grace, expires ${graceEndsAt.toISOString()}`);
              // One-time grace-notice email, idempotent on marketGraceEmailSentAt
              const graceEmailTo = orgEMCU.billingEmail ?? undefined;
              if (graceEmailTo && !orgEMCU.marketGraceEmailSentAt && !alreadyInGrace) {
                try {
                  await sendMarketGraceNoticeEmail(graceEmailTo, orgEMCU.name ?? "", graceEndsAt);
                  await storage.updateOrganization(orgEMCU.id, { marketGraceEmailSentAt: new Date() });
                  console.log(`[stripe/webhook] EdenMarket grace notice sent to ${graceEmailTo} (via subscription.updated)`);
                } catch (graceEmailErr) {
                  console.warn("[stripe/webhook] EdenMarket grace notice email failed (subscription.updated):", (graceEmailErr as Error)?.message);
                }
              }
            } else {
              console.log(`[stripe/webhook] ${eventType} (edenmarket): org ${orgEMCU.id} non-terminal status=${subStatusCU} â€” leaving access state unchanged`);
            }
            break;
          }

          // Resolve org by customer ID first, fall back to subscription ID
          let orgU = stripeCustomerId ? await storage.getOrgByStripeCustomer(stripeCustomerId) : null;
          if (!orgU && stripeSubscriptionId) {
            orgU = await storage.getOrgByStripeSubscriptionId(stripeSubscriptionId) ?? null;
          }
          if (!orgU) {
            console.warn(`[stripe/webhook] subscription.updated: no org for customer ${stripeCustomerId} / sub ${stripeSubscriptionId}`);
            break;
          }
          const items = sub["items"] as { data: { price: { id: string } }[] } | undefined;
          const rawPriceId = items?.data?.[0]?.price?.id;
          if (!rawPriceId) {
            console.warn(`[stripe/webhook] subscription.updated: no price ID in payload for org ${orgU.id} â€” retaining existing priceId=${orgU.stripePriceId ?? "(none)"}`);
          }
          const priceId = rawPriceId ?? orgU.stripePriceId ?? "";
          const matchedPlanId = Object.entries(STRIPE_PRICE_MAP).find(([, pid]) => pid === priceId)?.[0];
          const resolvedPlanId: StripePlanId | null = matchedPlanId && isStripePlanId(matchedPlanId) ? matchedPlanId : null;
          const stripeStatusStr = String(sub["status"] ?? "active");
          const isCanceled = stripeStatusStr === "canceled";
          const planTierU = resolvedPlanId ? PLAN_TIER_MAP[resolvedPlanId] : (isCanceled ? "none" : orgU.planTier);
          const seatLimitU = resolvedPlanId ? PLAN_SEAT_MAP[resolvedPlanId] : (isCanceled ? 1 : orgU.seatLimit);
          const periodEndU = typeof sub["current_period_end"] === "number" ? new Date(sub["current_period_end"] * 1000) : null;
          const cancelAtU = typeof sub["cancel_at"] === "number" ? new Date(sub["cancel_at"] * 1000) : null;
          await storage.applyStripeSubscription(orgU.id, {
            stripeCustomerId,
            stripeSubscriptionId,
            stripeStatus: stripeStatusStr,
            stripePriceId: priceId,
            planTier: planTierU,
            seatLimit: seatLimitU,
            stripeCurrentPeriodEnd: periodEndU,
            stripeCancelAt: cancelAtU,
          }, "subscription_updated");
          console.log(`[stripe/webhook] Updated org ${orgU.id} â†’ planTier=${planTierU}, seatLimit=${seatLimitU}, status=${sub["status"]}, priceId=${priceId}`);
          break;
        }

        case "customer.subscription.deleted": {
          const sub = event.data.object as Record<string, unknown>;
          const stripeCustomerId = String(sub["customer"] ?? "");
          const stripeSubscriptionId = String(sub["id"] ?? "");

          // Check if this is an EdenMarket subscription before falling through to main plan revocation
          const subMetaDel = sub["metadata"] as Record<string, string> | undefined;
          const subProductDel = subMetaDel?.["product"] ?? "";
          if (subProductDel === "edenmarket") {
            // Task #714 â€” keep access on but start a 30-day grace period.
            // Reads (browse, deal rooms) continue; writes are blocked by
            // requireFullMarketAccess. After 30d the access naturally
            // expires (getMarketAccessState treats stale grace as no access).
            const orgEMDel = stripeCustomerId ? await storage.getOrgByStripeCustomer(stripeCustomerId) : null;
            if (orgEMDel) {
              const graceEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
              await storage.updateOrganization(orgEMDel.id, {
                edenMarketAccess: true,
                edenMarketStripeSubId: null,
                marketAccessExpiresAt: graceEndsAt,
              });
              // Task #752 â€” revoke stripe-sourced per-user entitlements
              // immediately on cancel; admin grants are preserved.
              await syncOrgMembersMarketEntitlement(orgEMDel.id, false);
              console.log(`[stripe/webhook] EdenMarket subscription canceled â€” org ${orgEMDel.id} entered 30-day grace, expires ${graceEndsAt.toISOString()}`);

              // Send the one-time grace-notice email. Idempotent on
              // marketGraceEmailSentAt so retries don't double-send.
              const graceEmailTo = orgEMDel.billingEmail ?? undefined;
              if (graceEmailTo && !orgEMDel.marketGraceEmailSentAt) {
                try {
                  await sendMarketGraceNoticeEmail(graceEmailTo, orgEMDel.name ?? "", graceEndsAt);
                  await storage.updateOrganization(orgEMDel.id, { marketGraceEmailSentAt: new Date() });
                  console.log(`[stripe/webhook] EdenMarket grace notice sent to ${graceEmailTo}`);
                } catch (graceEmailErr) {
                  console.warn("[stripe/webhook] EdenMarket grace notice email failed:", (graceEmailErr as Error)?.message);
                }
              }
            } else {
              console.warn(`[stripe/webhook] subscription.deleted (edenmarket): no org for customer ${stripeCustomerId}`);
            }
            break;
          }

          // Resolve org by customer ID first, fall back to subscription ID (mirrors subscription.updated)
          let orgDel = stripeCustomerId ? await storage.getOrgByStripeCustomer(stripeCustomerId) : null;
          if (!orgDel && stripeSubscriptionId) {
            orgDel = await storage.getOrgByStripeSubscriptionId(stripeSubscriptionId) ?? null;
          }
          if (!orgDel) {
            console.warn(`[stripe/webhook] subscription.deleted: no org for customer ${stripeCustomerId} / sub ${stripeSubscriptionId}`);
            break;
          }
          const items = sub["items"] as { data: { price: { id: string } }[] } | undefined;
          // Revoke access: planTier "none" is not in PAID_PLANS â†’ ScoutGate blocks
          await storage.applyStripeSubscription(orgDel.id, {
            stripeCustomerId,
            stripeSubscriptionId,
            stripeStatus: "canceled",
            stripePriceId: items?.data?.[0]?.price?.id ?? "",
            planTier: "none",
            stripeCurrentPeriodEnd: null,
            stripeCancelAt: null,
          }, "subscription_deleted");
          console.log(`[stripe/webhook] Org ${orgDel.id} subscription canceled â€” planTier set to "none", access revoked`);
          break;
        }

        case "invoice.payment_failed": {
          // Stripe also fires customer.subscription.updated (status â†’ past_due) shortly after, which
          // is the primary handler. This case provides an extra safety net and writes a billing event
          // so the failure appears in the org's billing history timeline.
          const inv = event.data.object as Record<string, unknown>;
          const invCustomerId = String(inv["customer"] ?? "");
          const invSubId = String(inv["subscription"] ?? "");
          let orgFail = invCustomerId ? await storage.getOrgByStripeCustomer(invCustomerId) : null;
          if (!orgFail && invSubId) {
            orgFail = await storage.getOrgByStripeSubscriptionId(invSubId) ?? null;
          }
          if (!orgFail) {
            console.warn(`[stripe/webhook] invoice.payment_failed: no org for customer ${invCustomerId} / sub ${invSubId}`);
            break;
          }
          // Only write status if not already past_due (avoid redundant updates)
          if (orgFail.stripeStatus !== "past_due") {
            await storage.updateOrganization(orgFail.id, { stripeStatus: "past_due" });
          }
          // Always record the payment failure in billing history for auditability
          const failAmountDue = typeof inv["amount_due"] === "number" ? inv["amount_due"] : null;
          const failCurrency = typeof inv["currency"] === "string" ? inv["currency"] : null;
          await storage.logBillingEvent({
            orgId: orgFail.id,
            stripeSubscriptionId: invSubId || null,
            eventType: "payment_failed",
            stripeStatus: "past_due",
            amountCents: failAmountDue,
            currency: failCurrency,
          });
          console.warn(`[stripe/webhook] invoice.payment_failed: org ${orgFail.id} (${invCustomerId}) â€” payment failed, status â†’ past_due`);

          // Send branded payment failure email with idempotency guard keyed on invoice ID
          const invId = String(inv["id"] ?? "");
          const failBillingEmail = orgFail.billingEmail ?? undefined;
          if (invId && failBillingEmail) {
            try {
              const claimed = await storage.markPaymentFailedEmailSent(orgFail.id, invId);
              if (!claimed) {
                console.log(`[stripe/webhook] Payment failure email already sent for invoice ${invId} â€” skipping`);
              } else {
                // Generate a Stripe billing portal URL so the subscriber can update their payment method directly
                const settingsUrl = `${APP_URL}/industry/settings`;
                let portalUrl = settingsUrl;
                try {
                  const stripeInst = getStripe();
                  if (stripeInst && orgFail.stripeCustomerId) {
                    const portalSession = await stripeInst.billingPortal.sessions.create({
                      customer: orgFail.stripeCustomerId,
                      return_url: settingsUrl,
                    });
                    portalUrl = portalSession.url;
                  }
                } catch (portalErr: unknown) {
                  console.warn("[stripe/webhook] Could not create billing portal session for failure email:", (portalErr as Error)?.message);
                }
                try {
                  await sendPaymentFailedEmail(failBillingEmail, orgFail.name ?? "", portalUrl);
                  console.log(`[stripe/webhook] Payment failure email sent to ${failBillingEmail} for org ${orgFail.id}, invoice ${invId}`);
                } catch (sendErr: unknown) {
                  console.error("[stripe/webhook] Payment failure email delivery failed â€” releasing claim:", (sendErr as Error)?.message);
                  await storage.releasePaymentFailedEmailClaim(orgFail.id, invId).catch((e: unknown) =>
                    console.error("[stripe/webhook] Failed to release payment failure email claim:", (e as Error)?.message)
                  );
                }
              }
            } catch (emailErr: unknown) {
              console.error("[stripe/webhook] Error preparing payment failure email:", (emailErr as Error)?.message);
            }
          } else if (!failBillingEmail) {
            console.warn(`[stripe/webhook] invoice.payment_failed: no billingEmail for org ${orgFail.id} â€” skipping failure email`);
          }
          break;
        }

        case "invoice.payment_succeeded": {
          // Fires on every successful charge: trial conversion, renewal, and reactivation after past_due.
          // The downstream customer.subscription.updated event updates the org record; this handler's
          // sole job is to write a billing event so successful payments appear in the billing timeline.
          const invOk = event.data.object as Record<string, unknown>;
          const invOkCustomerId = String(invOk["customer"] ?? "");
          const invOkSubId = String(invOk["subscription"] ?? "");
          // EdenMarket success-fee invoices carry metadata.dealId and are NOT
          // tied to a subscription. They are handled by the invoice.paid case
          // below â€” skip them here so we don't pollute org billing history.
          const invOkMeta = (invOk["metadata"] as Record<string, string> | null | undefined) ?? {};
          if (invOkMeta["dealId"]) {
            console.log(`[stripe/webhook] invoice.payment_succeeded: skipping EdenMarket success-fee invoice (dealId=${invOkMeta["dealId"]}) â€” handled by invoice.paid`);
            break;
          }
          // Skip initial trial invoices (amount_paid = 0) â€” they're not real payments
          const amountPaid = typeof invOk["amount_paid"] === "number" ? invOk["amount_paid"] : -1;
          if (amountPaid === 0) {
            console.log(`[stripe/webhook] invoice.payment_succeeded: skipping zero-amount invoice (trial) for customer ${invOkCustomerId}`);
            break;
          }

          // EdenMarket safety net: if this invoice belongs to an EdenMarket subscription,
          // ensure access remains on (covers past_due â†’ active recovery) and skip plan billing log.
          if (invOkSubId) {
            try {
              const stripeInst = getStripe();
              if (stripeInst) {
                const fetchedSub = await stripeInst.subscriptions.retrieve(invOkSubId);
                if (fetchedSub.metadata?.product === "edenmarket") {
                  const orgEMInv = invOkCustomerId ? await storage.getOrgByStripeCustomer(invOkCustomerId) : null;
                  if (orgEMInv) {
                    if (!orgEMInv.edenMarketAccess || orgEMInv.edenMarketStripeSubId !== invOkSubId || orgEMInv.marketAccessExpiresAt) {
                      // Task #714 â€” clear any grace on successful renewal/payment.
                      await storage.updateOrganization(orgEMInv.id, {
                        edenMarketAccess: true,
                        edenMarketStripeSubId: invOkSubId,
                        marketAccessExpiresAt: null,
                        marketGraceEmailSentAt: null,
                      });
                      await syncOrgMembersMarketEntitlement(orgEMInv.id, true);
                      console.log(`[stripe/webhook] invoice.payment_succeeded (edenmarket): org ${orgEMInv.id} access ensured + grace cleared, sub=${invOkSubId}`);
                    }
                  } else {
                    console.warn(`[stripe/webhook] invoice.payment_succeeded (edenmarket): no org for customer ${invOkCustomerId}`);
                  }
                  break;
                }
              }
            } catch (subFetchErr: unknown) {
              console.warn("[stripe/webhook] invoice.payment_succeeded: could not retrieve subscription for product check:", (subFetchErr as Error)?.message);
            }
          }

          let orgOk = invOkCustomerId ? await storage.getOrgByStripeCustomer(invOkCustomerId) : null;
          if (!orgOk && invOkSubId) {
            orgOk = await storage.getOrgByStripeSubscriptionId(invOkSubId) ?? null;
          }
          if (!orgOk) {
            console.warn(`[stripe/webhook] invoice.payment_succeeded: no org for customer ${invOkCustomerId} / sub ${invOkSubId}`);
            break;
          }
          const okCurrency = typeof invOk["currency"] === "string" ? invOk["currency"] : null;
          await storage.logBillingEvent({
            orgId: orgOk.id,
            stripeSubscriptionId: invOkSubId || null,
            eventType: "payment_succeeded",
            // Use "active" as the canonical post-payment status rather than reading current
            // org state, which may still reflect "past_due" before subscription.updated arrives.
            stripeStatus: "active",
            amountCents: amountPaid > 0 ? amountPaid : null,
            currency: okCurrency,
          });
          console.log(`[stripe/webhook] invoice.payment_succeeded: org ${orgOk.id} â€” payment recorded, amount=${amountPaid}`);

          // Send renewal confirmation email for subscription cycle renewals (not the initial checkout invoice)
          const billingReason = String(invOk["billing_reason"] ?? "");
          const renewBillingEmail = orgOk.billingEmail ?? undefined;
          if (billingReason === "subscription_cycle" && renewBillingEmail) {
            try {
              const amountFormatted = `$${(amountPaid / 100).toFixed(2)}`;
              await sendRenewalConfirmationEmail(renewBillingEmail, orgOk.name ?? "", amountFormatted);
              console.log(`[stripe/webhook] Renewal confirmation email sent to ${renewBillingEmail} for org ${orgOk.id}, amount=${amountPaid}`);
            } catch (sendErr: unknown) {
              console.error("[stripe/webhook] Renewal confirmation email delivery failed:", (sendErr as Error)?.message);
            }
          }
          break;
        }

        case "invoice.paid": {
          // EdenMarket success-fee invoice paid â€” persist paidAt, email seller a receipt.
          // Idempotent: if successFeePaidAt is already set, do nothing.
          const invPaid = event.data.object as Record<string, unknown>;
          const invPaidMeta = (invPaid["metadata"] as Record<string, string> | null | undefined) ?? {};
          const dealIdStr = invPaidMeta["dealId"];
          if (!dealIdStr) {
            // Not a success-fee invoice (subscription invoices are handled by invoice.payment_succeeded).
            break;
          }
          const dealIdPaid = parseInt(dealIdStr, 10);
          if (!Number.isFinite(dealIdPaid)) {
            console.warn(`[stripe/webhook] invoice.paid: malformed dealId metadata=${dealIdStr}`);
            break;
          }
          const dealPaid = await storage.getMarketDeal(dealIdPaid);
          if (!dealPaid) {
            console.warn(`[stripe/webhook] invoice.paid: deal ${dealIdPaid} not found`);
            break;
          }
          if (dealPaid.successFeePaidAt) {
            console.log(`[stripe/webhook] invoice.paid: deal ${dealIdPaid} already marked paid â€” skipping`);
            break;
          }
          // Defense-in-depth: ensure the paid invoice ID matches the one we
          // recorded against the deal. Guards against accidental metadata
          // mismatch (manual Stripe edits, replay of a stale event, etc.).
          const invPaidId = typeof invPaid["id"] === "string" ? invPaid["id"] : null;
          if (dealPaid.successFeeInvoiceId && invPaidId && dealPaid.successFeeInvoiceId !== invPaidId) {
            console.warn(`[stripe/webhook] invoice.paid: invoice id mismatch for deal ${dealIdPaid} â€” event=${invPaidId} expected=${dealPaid.successFeeInvoiceId}; ignoring`);
            break;
          }
          const paidAt = new Date();
          await storage.updateMarketDeal(dealIdPaid, { successFeePaidAt: paidAt });
          console.log(`[stripe/webhook] invoice.paid: deal ${dealIdPaid} success-fee marked paid at ${paidAt.toISOString()}`);

          // Best-effort receipt email to seller's billing email.
          try {
            const sellerOrgPaid = await storage.getOrgForUser(dealPaid.sellerId);
            const billingEmailPaid = sellerOrgPaid?.billingEmail;
            if (billingEmailPaid) {
              const listingPaid = await storage.getMarketListing(dealPaid.listingId);
              const labelPaid = listingPaid?.assetName || `Listing #${dealPaid.listingId}`;
              const feeDisplay = dealPaid.successFeeAmount
                ? `$${dealPaid.successFeeAmount.toLocaleString("en-US")}`
                : "your EdenMarket success fee";
              const hostedUrl = typeof invPaid["hosted_invoice_url"] === "string" ? invPaid["hosted_invoice_url"] : null;
              const html = `
                <p>Thank you â€” we've received your payment of <strong>${feeDisplay}</strong> for the EdenMarket success fee on Deal #${dealIdPaid} (${labelPaid}).</p>
                ${hostedUrl ? `<p><a href="${hostedUrl}">View your receipt</a></p>` : ""}
                <p>The deal record has been updated with the paid timestamp. If you have any questions, just reply to this email.</p>
              `;
              await sendEmail(
                billingEmailPaid,
                `Payment received â€” EdenMarket success fee, Deal #${dealIdPaid}`,
                html,
              );
              console.log(`[stripe/webhook] invoice.paid: receipt emailed to ${billingEmailPaid} for deal ${dealIdPaid}`);
            } else {
              console.warn(`[stripe/webhook] invoice.paid: deal ${dealIdPaid} â€” seller org has no billing email, skipping receipt`);
            }
          } catch (emailErr: unknown) {
            console.error("[stripe/webhook] invoice.paid: receipt email failed", (emailErr as Error)?.message);
          }
          break;
        }

        default:
          console.log(`[stripe/webhook] Unhandled event type: ${eventType}`);
          break;
      }
    } catch (err: any) {
      console.error(`[stripe/webhook] Error handling event ${eventType}:`, err?.message);
      sentryCaptureException(err);
      return res.status(500).json({ error: "Internal error processing webhook â€” Stripe will retry" });
    }

    res.json({ received: true });
  });

  // GET /api/billing/history â€” returns billing events for the authenticated user's org
  app.get("/api/billing/history", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);
      if (!org) return res.status(404).json({ error: "No organization found for this account" });
      const events = await storage.getBillingHistory(org.id);
      res.json(events);
    } catch (err: any) {
      console.error("[billing/history]", err?.message);
      res.status(500).json({ error: "Failed to fetch billing history" });
    }
  });

  // POST /api/stripe/portal â€” create a Stripe Customer Portal session for self-serve plan management
  app.post("/api/stripe/portal", verifyAnyAuth, async (req, res) => {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: "Stripe is not configured on this server yet" });

    try {
      const userId = req.headers["x-user-id"] as string;
      const org = await storage.getOrgForUser(userId);

      if (!org) {
        return res.status(404).json({ error: "No organization found for this account" });
      }
      if (!org.stripeCustomerId) {
        return res.status(400).json({ error: "No Stripe billing found â€” subscribe to a plan first" });
      }

      const origin = (req.headers.origin ?? req.headers.referer ?? "").replace(/\/$/, "");
      const baseUrl = origin || `https://${req.headers.host}`;

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: org.stripeCustomerId,
        return_url: `${baseUrl}/industry/settings`,
      });

      res.json({ url: portalSession.url });
    } catch (err: any) {
      console.error("[stripe/portal]", err?.message);
      res.status(500).json({ error: "Failed to create portal session" });
    }
  });
}