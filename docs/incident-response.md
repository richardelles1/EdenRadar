# EdenRadar Incident Response Policy
**Version:** 1.0  
**Effective Date:** 2026-06-11  
**Owner:** Richard Elles, CEO  
**Responders:** EdenNX Team

---

## What Counts as an Incident

EdenRadar is a B2B intelligence platform. Not all service degradation is customer-facing. This policy applies only to **customer-facing incidents** — failures that directly affect a user's ability to use the product.

### Customer-Facing (triggers this policy)

| Condition | Examples |
|-----------|---------|
| Authentication is broken | Users cannot log in or sessions are being dropped |
| Deal room is inaccessible | Buyer or seller cannot access messages, documents, or term sheet during an active deal |
| Scout search is down | Search returns no results or errors across all queries |
| Platform is fully unreachable | App returns 5xx errors or does not load |

### Internal / Operational (does not trigger this policy)

| Condition | Handling |
|-----------|---------|
| Scraper downtime or lag | Internal monitoring; users do not see update cadence |
| Enrichment pipeline backed up | Internal queue; no user-visible impact |
| EDEN AI degraded | Monitor and restore; notify only if fully down for > 2 hours |
| Alert delivery delayed | Internal; users are not harmed by a delay of hours |
| Admin panel unavailable | Internal tooling; no customer impact |

### Data Breach

A confirmed or suspected data breach is treated as a separate, highest-priority incident regardless of customer visibility. See the Data Breach section below.

---

## Responders

The EdenNX team holds production access and is responsible for incident response. All team members with admin access have access to the Supabase admin panel, Stripe dashboard, and the EdenRadar admin panel.

No on-call rotation or SLA is in place at this stage. Response is best-effort during business hours; critical incidents (auth down, deal room down) are addressed as soon as a responder is available.

---

## Detection

- **Status page:** `edenradar.com/status` — live health checks for all core services, refreshed every 30 seconds. Publicly accessible without login.
- **User reports:** Customers may report issues directly via email to support@edenradar.com.
- **Supabase dashboard:** Database health, query errors, and connection metrics visible at supabase.com.

---

## Response Steps

### 1. Confirm the incident
Verify the failure is real and customer-facing before communicating. Check:
- `/api/status` health endpoint
- Supabase dashboard for database errors
- Browser test of affected feature

### 2. Classify severity

| Severity | Condition |
|----------|-----------|
| **Critical** | Auth broken, deal room inaccessible, full platform down |
| **High** | Scout search down, core feature degraded for all users |
| **Low** | Single-user issue, partial degradation, non-core feature |

### 3. Communicate to customers (Critical and High only)

Customer notification is sent via the admin panel incident notification tool. This requires:
- Admin login to the EdenRadar admin panel
- Password re-authentication before send is authorized (prevents accidental or unauthorized mass send)
- Selection of affected services, incident status, and message body

**Notification statuses:**
- **Investigating** — issue confirmed, cause not yet identified
- **Identified** — root cause known, fix in progress
- **Resolved** — service restored, brief description of what happened

**Who receives notifications:**
- All active industry user accounts
- Status page email subscribers

**For Low severity:** No customer notification. Fix silently and monitor.

### 4. Resolve and restore
Work to restore the affected service. No formal RTO (recovery time objective) is committed at this stage.

### 5. Post-incident
For Critical incidents, write a brief internal note covering:
- What broke and why
- How it was detected
- How it was fixed
- Whether any customer data was affected

File in `reports/` with the date (e.g., `reports/incident-2026-06-11.md`).

---

## Data Breach Protocol

A data breach is any confirmed or suspected unauthorized access to user data. This is treated separately from service incidents.

### Immediate steps (within 24 hours)
1. Identify the scope: which users, which data, what time window
2. Revoke any compromised credentials or sessions via Supabase admin
3. Preserve logs — do not delete or modify anything until scope is understood
4. Notify affected users directly via personal email (not the bulk notification tool)

### Notification obligations
- **US users:** No federal breach notification law applies broadly; state laws vary. California (CCPA) requires notification if personal information of California residents is breached.
- **EU users:** GDPR Article 33 requires notification to the relevant supervisory authority within 72 hours of becoming aware of a breach. Article 34 requires notification to affected individuals if the breach is likely to result in high risk to their rights.
- **Current position:** EdenRadar has no EU users. When EU customers onboard, a designated GDPR contact must be named and the 72-hour notification procedure must be activated.

---

## Status Page

The status page at `edenradar.com/status` displays live health for:
- Scout Search
- EDEN AI
- Asset Dossier
- Landscape Intelligence
- Authentication
- Database
- API
- Alert Delivery
- TTO Data Ingestion

The status page is publicly accessible without login and reflects live system health. During a full application outage, the status page will also be unavailable — at that point, direct customer communication via the incident notification tool is the primary channel.

During an incident, the status page reflects real-time health automatically via the `/api/status` endpoint.

---

## Gaps and Planned Improvements

| Gap | Priority | Target |
|-----|----------|--------|
| No formal RTO/SLA commitment | Low | Define before first enterprise contract |
| No automated uptime monitoring with alerting | Medium | Add before EU customers onboard |
| No self-service incident subscription management | Low | Next admin sprint |
| GDPR 72-hour breach notification procedure | High | Required before first EU customer |
| Incident notification tool not yet built | High | Next sprint |
