# EdenRadar Data Policy
**Version:** 1.0 — Pre-Launch  
**Effective Date:** 2026-06-10  
**Owner:** Richard Elles, CEO  

This document describes EdenRadar's current data handling practices and the roadmap to full regulatory compliance. It is intended for internal reference and technical/legal due diligence.

---

## Current State Summary

| Area | Status |
|------|--------|
| Data retention policy | Informal — data retained indefinitely until formal policy is adopted |
| User account deletion | Available via admin panel; process is ad-hoc (no SLA or self-service) |
| GDPR compliance | Not yet required (no EU users); readiness roadmap in place |
| CCPA compliance | Applicable if California residents sign up; formal policy not yet written |
| Privacy Policy | Required before EU or broad consumer launch |
| Data Processing Agreement (DPA) | Required before first EU customer onboards |

---

## Data Retention

### Current Practice
All data is retained indefinitely. No automated deletion or archival jobs are in place.

### Planned Retention Schedule (to be formalized before EU launch)

| Data Category | Planned Retention | Rationale |
|---------------|-------------------|-----------|
| User account data | Duration of account + 30 days post-deletion | Allows account recovery window |
| AI chat sessions (`eden_sessions`) | 12 months from last activity | Operational necessity; longer is a GDPR risk |
| Search and query history | 12 months | Analytics and personalization use |
| API usage logs | 12 months | Security and billing audit |
| Deal room content (messages, documents) | Duration of deal + 5 years | Commercial record-keeping requirement |
| Admin and impersonation audit logs | 7 years | Regulatory and legal hold |
| Stripe billing events | 7 years | Financial record-keeping |
| Email dispatch logs | 3 years | Compliance and deliverability review |
| Scraping and ingestion logs | 90 days | Operational debugging |

---

## Account Deletion

### Current Process
Account deletion is performed manually by an admin via the admin panel. There is no self-service deletion flow and no formal SLA for processing deletion requests.

### What Deletion Currently Covers
When an admin deletes a user account:
- Supabase Auth record is removed
- `industry_profiles` row is removed
- Organization membership (`org_members`) is removed

### Known Gaps
- `eden_sessions` (AI chat history) is not automatically deleted on account deletion
- `search_history`, `eden_queries` entries are not automatically deleted
- `user_asset_feedback`, `saved_assets`, `saved_asset_notes` may persist
- `concept_interests` records referencing the user persist
- `api_usage_logs` IP/user agent records are not deleted

### Before EU Launch: Required
A full cascading deletion job must be implemented that removes or anonymizes all user-linked records across all tables on account deletion. A 30-day deletion SLA must be documented to meet GDPR Article 17 (right to erasure).

---

## GDPR Readiness Roadmap

EdenRadar does not currently serve EU users. The following items must be completed before the first EU customer onboards.

| Item | Priority | Notes |
|------|----------|-------|
| Privacy Policy | Critical | Must cover data categories, retention, lawful basis, user rights, DPO contact |
| Cookie Policy | Critical | Required if any analytics or tracking cookies are set |
| Cascading account deletion | Critical | See "Account Deletion" above |
| Data Processing Agreement (DPA) | Critical | Required with any EU enterprise customer |
| Lawful basis documentation | High | Identify basis for each data category (contract, legitimate interest, consent) |
| Data retention automation | High | Implement scheduled jobs per the retention schedule above |
| Self-service data export | High | GDPR Article 20 right to data portability |
| Formal deletion request process | High | Logged, SLA-bound, with confirmation to requester |
| Sub-processor register | Medium | List Supabase, Stripe, Resend, OpenAI, Google Drive, OneDrive as processors |
| DPO or GDPR contact designation | Medium | Can be internal; must be named in Privacy Policy |
| Data breach notification procedure | Medium | 72-hour notification to supervisory authority under GDPR Article 33 |

---

## Sub-processors

Third-party services that process personal data on behalf of EdenRadar:

| Processor | Data Processed | Purpose |
|-----------|---------------|---------|
| Supabase (AWS us-west-2) | All user and application data | Hosted database and authentication |
| Stripe | Billing email, payment data | Subscription billing |
| Resend | Email addresses, message content | Transactional and digest email delivery |
| OpenAI | User queries, asset content | AI enrichment and EDEN chat |
| Google Drive | File names, document content | Cloud export of reports/briefs |
| Microsoft OneDrive | File names, document content | Cloud export of reports/briefs |

---

## Data Location

All application data is stored in **us-west-2 (Oregon, USA)**. No data is stored or replicated to EU regions at this time. This will be relevant if EU customers require data residency within the EU under GDPR.

---

## What Is Not Stored

- Payment card numbers (handled entirely by Stripe)
- Plaintext passwords (Supabase Auth, hashed externally)
- Raw API keys (stored as hashed values only; plaintext shown once at creation)
- Social Security Numbers, health records, or clinical patient data
