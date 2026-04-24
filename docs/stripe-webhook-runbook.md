# Stripe Webhook Configuration Runbook

## Status: Configured (Test Mode)
**Date configured:** 2026-04-24  
**Configured by:** Task #525 (automated via Stripe API)

---

## Registered Webhook Endpoints

### 1. Replit Preview Environment
- **Endpoint ID:** `we_1TP9aGGalzdvFwc8kPOwaSt3`
- **URL:** `https://edenradar.replit.app/api/stripe/webhook`
- **Status:** enabled

### 2. Production Domain
- **Endpoint ID:** `we_1TP9XBGalzdvFwc858fJ3Pyn`
- **URL:** `https://edenradar.com/api/stripe/webhook`
- **Status:** enabled

---

## Registered Events (both endpoints)

| Event | Purpose |
|-------|---------|
| `checkout.session.completed` | Activates subscription after checkout |
| `customer.subscription.updated` | Syncs plan tier, seat limit, status changes |
| `customer.subscription.deleted` | Revokes access when subscription is canceled |
| `invoice.payment_failed` | Records failed payment in billing history, sends failure email |
| `invoice.payment_succeeded` | Records successful payment in billing history |
| `customer.subscription.trial_will_end` | Future: notify users before trial expires |

---

## Environment Secrets Required

| Secret | Description |
|--------|-------------|
| `STRIPE_SECRET_KEY` | Stripe API key (test: `sk_test_...`, live: `sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret from Stripe Dashboard |

---

## Go-Live Checklist

Before switching to live Stripe keys:

1. **Update `STRIPE_SECRET_KEY`** — Replace test key with live key (`sk_live_...`) in Replit Secrets
2. **Update `STRIPE_WEBHOOK_SECRET`** — Get the signing secret from Stripe Dashboard → Developers → Webhooks for each endpoint and update the secret in Replit
3. **Verify webhook delivery** — Use Stripe CLI: `stripe trigger invoice.payment_failed` and confirm a `payment_failed` row appears in the `stripe_billing_events` table
4. **Test checkout flow** — Run a real checkout and verify:
   - `checkout.session.completed` fires and org is activated
   - Row appears in `stripe_billing_events` with event type `checkout_completed`

---

## Verification Steps (Test Mode — Stripe CLI)

Install Stripe CLI and run:
```bash
# Forward webhooks to local dev server
stripe listen --forward-to localhost:5000/api/stripe/webhook

# In another terminal, trigger test events
stripe trigger invoice.payment_failed
stripe trigger invoice.payment_succeeded
stripe trigger customer.subscription.updated
```

Then confirm rows appear in the database:
```sql
SELECT * FROM stripe_billing_events ORDER BY created_at DESC LIMIT 10;
```

---

## Handler Location

Webhook handler: `server/routes.ts` — `POST /api/stripe/webhook`

Billing events table schema: `shared/schema.ts` — `stripeBillingEvents`

Table creation on startup: `server/index.ts` — `stripe_billing_events table ensured`
