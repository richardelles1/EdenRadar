# EdenRadar Database Reference
**Last Updated:** 2026-06-10  
**Database:** Supabase PostgreSQL 17.6 — Eden Radar Core Product  
**Region:** us-west-2 (Oregon, USA)  
**Plan:** Pro  
**Status:** ACTIVE_HEALTHY

---

## Infrastructure & Backup

| Property | Value |
|----------|-------|
| Provider | Supabase (managed PostgreSQL 17.6) |
| Region | us-west-2 (Oregon, USA) |
| Backup cadence | Daily automated snapshots |
| Backup retention | 7 days |
| Point-in-time recovery | Not active (available on Team plan) |
| Encryption at rest | Yes (Supabase-managed) |
| Encryption in transit | Yes (TLS) |
| High availability | Yes (replication within region) |
| Cross-region replication | Not active |
| ORM | Drizzle ORM (TypeScript, parameterized queries throughout) |
| Auth | Supabase Auth (JWT) + internal API key authentication |

---

## Schema Overview

The database contains **72 tables** organized across five functional domains.

---

### Domain 1: EdenScout — Asset Corpus & Ingestion

The core data asset: ~350+ scrapers harvest technology transfer listings from academic and research institutions worldwide. All records are AI-enriched and relevance-scored.

| Table | Purpose |
|-------|---------|
| `ingested_assets` | Primary asset corpus. ~100k+ records. Each row is one TTO technology listing with AI-enriched fields: target, modality, stage, indication, mechanism of action, IP status, embedding vectors. |
| `ingestion_runs` | Metadata for each full corpus ingestion run (status, counts, timestamps). |
| `sync_sessions` | Live per-institution scraping session tracking (phase, counts, errors). |
| `sync_staging` | Staging buffer: raw scraped records held here before dedup/relevance check and promotion to `ingested_assets`. |
| `enrichment_jobs` | AI enrichment batch job tracking (model, token cost, completeness before/after). |
| `enrichment_run_log` | Persisted summary of last run per pipeline type; survives server restarts. |
| `scan_institution_counts` | Per-institution asset counts per ingestion run; used for scraper health monitoring. |
| `institution_metadata` | Reference data for ~400+ institutions: city, TTO name, website, specialties, continent. |
| `manual_institutions` | Admin-curated institution overrides (TTO URL, name corrections). |
| `institution_quality_snapshots` | Point-in-time quality metrics per institution (completeness, enrichment queue). |
| `review_queue` | Assets flagged for human admin review (duplicate suspicion, quality issues). |
| `therapy_area_taxonomy` | Hierarchical therapy area classification tree. |
| `convergence_signals` | Detected cross-institution research convergence signals (therapy area + target clusters). |
| `regulatory_designations` | FDA orphan drug designations synced from openFDA weekly. Used in asset dossier. |
| `deal_comparables` | SEC 8-K biotech/pharma licensing deal records used as market comparables in EdenMarket. |
| `asset_signal_events` | Append-only event log per asset: stage changes, citation updates, content changes. Powers momentum scoring. |
| `relevance_holdout` | ML holdout set for relevance model evaluation (human-verified + strong signal labels). |
| `relevance_metrics` | Aggregated weekly save/dismiss-rate metrics by dimension (source, asset class, institution). |

---

### Domain 2: EdenLab — Researcher Workspaces

Tools for academic researchers to organize, document, and publish their work.

| Table | Purpose |
|-------|---------|
| `research_projects` | Researcher project workspaces. Rich structured content: hypotheses, PICO, screening papers, evidence tables, milestones, dissemination plans, contributor lists. |
| `discovery_cards` | Published researcher discovery cards (public-facing listings for industry to browse). |
| `concept_cards` | Industry-submitted concept cards: idea submissions seeking collaborators or funding. |
| `concept_interests` | Expressions of interest logged against concept cards (interest type: collaborating, funding, advising). |
| `research_needs` | Industry research needs/requirements posted for researcher response. |
| `saved_grants` | Researcher grant tracking per project (agency, deadline, amount, status). |
| `saved_references` | Literature references saved per research project. |

---

### Domain 3: EdenMarket — Deal Platform

Structured marketplace for buying and selling biotech/pharma IP and licensing rights.

| Table | Purpose |
|-------|---------|
| `market_listings` | Technology listings posted for sale or licensing. Supports blind/unblind fields, TRL level, patent metadata. |
| `market_eois` | Expressions of interest submitted by buyers against listings (company, role, rationale, budget range). |
| `market_subscriptions` | Market platform subscription records (linked to Stripe). |
| `market_deals` | Deal room records created when a seller accepts an EOI. Tracks NDA status, signing events, financial terms. |
| `market_deal_documents` | Documents uploaded to a deal room (NDAs, diligence packages, data room files). |
| `market_deal_document_views` | Audit trail of document open/view events per counterparty. |
| `market_deal_messages` | Deal room message thread between buyer and seller. |
| `market_deal_observers` | Third-party observers (legal counsel, licensing advisors) invited to deal rooms with read-only access. |
| `market_deal_term_sheets` | Collaborative term sheet per deal. Fields: upfront, milestones, royalty, territory, exclusivity, IP ownership. Lockable once both parties agree. |
| `market_deal_feedback` | Post-deal feedback from both parties (outcome type, ratings, time-to-LOI, deal value). Feeds platform benchmarking. |
| `market_availability_notifications` | In-app notifications to industry users when a previously-scouted asset becomes available on EdenMarket. |
| `market_saved_searches` | Buyer saved search filters + keywords. Triggers notifications when matching listings go active. |

---

### Domain 4: Platform — Users, Orgs, Billing, Auth

All identity, subscription, and access control infrastructure.

| Table | Purpose |
|-------|---------|
| `users` | Legacy internal user table (username/password). Supabase Auth is the primary identity system. |
| `industry_profiles` | Industry user profiles keyed to Supabase Auth UUIDs. Stores preferences, alert settings, org membership. |
| `organizations` | Billing entities. Holds Stripe subscription state, plan tier, seat limits, EdenMarket access flags, seller verification. |
| `org_members` | Organization membership roster (role: owner/admin/member, invite status, invite source). |
| `invite_tokens` | Custom invite tokens stored in DB to prevent email-scanner pre-fetch consuming one-time OTP links. |
| `shared_links` | Shareable link tokens for dossiers and pipeline briefs (UUID token, expiry, optional password hash). |
| `stripe_billing_events` | Immutable audit log of all Stripe subscription events (checkout, upgrade, downgrade, payment failure, cancellation). |
| `admin_events` | Immutable audit log of all admin actions (role changes, user deletion, org edits, market access grants). |
| `impersonation_sessions` | Records each admin "act-as-user" session (started/ended timestamps, action count). 8-hour max lifetime. |
| `impersonation_audit_events` | Per-request audit trail during an impersonation session (route, method, status code). |
| `api_keys` | Developer API keys (hashed, prefixed). Tier: starter/professional/enterprise. Scoped, with per-key daily limits. |
| `api_usage_logs` | API call log per key (endpoint, method, status, response time, IP address, user agent). |
| `api_rate_limit_windows` | Rolling daily rate limit window per API key. |
| `api_key_audit_log` | Admin audit log for API key lifecycle events (create, revoke, suspend). |
| `plan_entitlements` | Source of truth for per-plan feature limits (API calls, seats, pipeline lists, reports, market access). |
| `org_entitlement_overrides` | Per-org custom limit overrides above/below plan defaults (enterprise customization without code deploy). |

---

### Domain 5: Analytics & AI

Usage telemetry, AI session data, and email infrastructure.

| Table | Purpose |
|-------|---------|
| `eden_sessions` | EDEN AI chat sessions. Stores full message history (user queries + assistant responses + referenced asset IDs). |
| `eden_queries` | Per-query analytics: query text, intent, filter set, asset count returned, latency. |
| `eden_message_feedback` | Thumbs up/down feedback on individual EDEN AI responses. |
| `search_history` | Scout search query history per user (query text, source, result count). |
| `saved_assets` | Assets saved to user pipelines with status tracking (watching, evaluating, in_discussion, on_hold, passed). |
| `saved_asset_notes` | Free-text notes and system events on saved assets (author name, content, timestamp). |
| `pipeline_lists` | Named pipeline lists owned by users or organizations. |
| `saved_reports` | AI-generated research reports saved by users (query, asset snapshot, report JSON). |
| `user_alerts` | User alert subscriptions (filters: modality, stage, institution, target; cadence: weekly/daily/frequent). |
| `user_asset_feedback` | Append-only log of user save/dismiss/view/NDA-request actions. Drives relevance model. |
| `team_activities` | Team activity feed events (saved, moved, noted, removed — per org). |
| `weekly_recaps` | Weekly market recap snapshots per org (Mon–Sun windows, frozen once sealed). |
| `dispatch_logs` | Outbound email dispatch audit log (subject, recipients, asset list, window hours). |
| `email_unsubscribes` | Email unsubscribe list for non-account recipients (token-signed unsubscribe links). |
| `eden_brief_issues` | Eden Brief newsletter issues (slug, content JSON, published status). |
| `eden_brief_subscribers` | Eden Brief subscriber email list. |
| `app_events` | Generic usage analytics events (dossier opened, report generated, pipeline brief generated, etc.). |

---

## PII Register

Personal data held in the database, by category.

| Category | Tables | Fields | Notes |
|----------|--------|--------|-------|
| User identity | `industry_profiles`, `users`, `org_members` | email, name, company name, company type | Primary user PII. Supabase Auth holds passwords (hashed) and email externally. |
| Contact information | `concept_cards`, `discovery_cards`, `research_projects` | submitter email, contact email, contributor emails | User-supplied as part of content creation. |
| Professional profile | `industry_profiles` | therapeutic areas, deal stages, modalities, company type | Self-reported professional preferences. |
| AI conversation content | `eden_sessions` | Full message thread between user and EDEN AI | May contain user-described deal context, asset details, or proprietary company information. |
| Search and query history | `eden_queries`, `search_history` | Query text, filters, timestamps | Tied to userId. Reveals research intent. |
| Deal room communications | `market_deal_messages` | Message body between buyer and seller | Confidential deal negotiation content. |
| Deal room participants | `market_deal_observers` | Observer name, email, role (counsel/advisor) | Third-party legal/advisor contact info. |
| Financial deal data | `market_deal_term_sheets`, `market_deal_feedback` | Deal value, upfront, royalty, territory | Confidential commercial terms. |
| Network addresses | `api_usage_logs` | IP address, user agent | Logged per API call. |
| Email lists | `eden_brief_subscribers`, `email_unsubscribes`, `dispatch_logs` | Email addresses | Marketing/newsletter opt-in/out list. |
| Admin activity | `admin_events`, `impersonation_sessions` | Admin email, target user email, actions taken | Internal audit trail; not user-facing. |
| Billing data | `organizations` | Billing email | Stripe holds full card data; only billing email stored here. |

---

## Key Relationships

```
organizations
  ├── org_members (userId FK → Supabase Auth)
  ├── industry_profiles (orgId)
  ├── pipeline_lists (orgId)
  ├── team_activities (orgId)
  ├── weekly_recaps (orgId)
  ├── stripe_billing_events (orgId)
  ├── market_subscriptions (orgId)
  ├── market_listings (orgId)
  └── org_entitlement_overrides (orgId)

market_listings
  ├── market_eois (listingId)
  │     └── market_deals (eoiId + listingId)
  │           ├── market_deal_documents
  │           ├── market_deal_messages
  │           ├── market_deal_observers
  │           ├── market_deal_term_sheets
  │           └── market_deal_feedback
  └── market_availability_notifications (listingId)

ingested_assets
  ├── saved_assets (ingestedAssetId)
  ├── asset_signal_events (assetId)
  └── market_listings (ingestedAssetId, optional link)

research_projects
  ├── saved_grants (projectId)
  ├── saved_references (projectId)
  └── discovery_cards (researcherId)
```

---

## Notes for Due Diligence

- **No SQL injection exposure:** All queries use Drizzle ORM parameterized bindings throughout. No raw string concatenation in database queries.
- **No cross-user data leakage in AI:** EDEN AI prompts are scoped to the authenticated user's own data only.
- **Researcher data isolation:** `verifyResearcherAuth` derives identity from verified JWT, never from client-supplied headers.
- **Card data:** Not stored. Stripe handles all payment card data; only Stripe subscription/customer IDs and billing email are held here.
- **Passwords:** Not stored in plaintext. Supabase Auth manages credential hashing externally.
- **API keys:** Stored as hashed values only (`key_hash`). The plaintext key is shown once at creation and never persisted.
