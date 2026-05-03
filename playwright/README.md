# EdenRadar Playwright E2E harness

End-to-end tests for the 9 critical user journeys identified in Task #688.

## Status

| # | Journey                                               | Status        |
|---|-------------------------------------------------------|---------------|
| 1 | Signup → trial active                                 | skeleton      |
| 2 | Digest opt-in → admin trigger → email logged          | skeleton      |
| 3 | Realtime alert latency                                | skeleton      |
| 4 | EdenScout search → save asset                         | skeleton      |
| 5 | EdenMarket EOI → mutual interest                      | skeleton      |
| 6 | NDA sign → deal room unlocked                         | skeleton      |
| 7 | Admin password reset / non-admin denial               | partial ✅    |
| 8 | Unsubscribe (RFC 8058 + UI)                           | full ✅       |
| 9 | Team invite → accept → org membership                 | skeleton      |

Plus: `login-page` (rendering smoke), `public-pages` (landing/market/pricing/tos).

## Running

The dev server must already be running on port 5000 (the standard "Start
application" workflow). Playwright will reuse it.

```bash
# All specs
npx playwright test

# Single file
npx playwright test playwright/specs/unsubscribe.spec.ts

# Headed (debugging)
npx playwright test --headed --workers=1

# UI mode (interactive)
npx playwright test --ui

# Convenience wrapper (also handles cleanup)
bash scripts/test-e2e.sh
```

> If you want a real `npm run test:e2e` script, ask the user to add this to
> `package.json` — Replit Agent is not allowed to edit `package.json`:
> ```json
> "test:e2e": "playwright test"
> ```

## How specs interact with state

- **DB writes** go through `playwright/fixtures/db.ts`, which uses the same
  `SUPABASE_DATABASE_URL` the app uses. All E2E rows have `company_name`
  prefixed with `e2e-test-` and are deleted in `afterAll`.
- **Token signing** (e.g. unsubscribe HMAC) is mirrored in
  `playwright/fixtures/tokens.ts` so specs do not import server-only modules.
  ⚠️ If `server/email.ts` changes its signing algorithm, update tokens.ts too.
- **External APIs** (Supabase Auth, Resend, OpenAI, Stripe) are NOT mocked in
  the working specs. The skeleton specs document exactly which mocks each
  remaining journey needs.

## Adding a new spec

1. If you need DB seeding, add a helper to `playwright/fixtures/db.ts` that
   tags the row with the `E2E_MARKER` prefix so cleanup catches it.
2. Add a file in `playwright/specs/your-journey.spec.ts`.
3. Use `data-testid` selectors (the codebase already enforces these via the
   fullstack-js skill).
4. Run locally with `npx playwright test --headed` until green.

## Why not all 9 journeys?

Journeys 1–6 and 9 require authenticated Supabase sessions. Implementing them
robustly needs ONE of:

- A dedicated **Supabase test project** with seed data and the service-role
  key in CI secrets, OR
- A **Playwright network-mock layer** that intercepts `*.supabase.co` calls
  and returns synthetic JWTs that the backend's `verifyAnyAuth` middleware
  will accept (requires either a relaxed test-mode middleware or a JWT
  signed with the real Supabase JWT secret), OR
- A **test-only server endpoint** (`POST /api/_e2e/login-as`) gated by an
  `E2E_TEST_TOKEN` env var that mints sessions for synthetic users.

Each of these is its own follow-up task — see the TODO blocks inside
`playwright/specs/_skeletons.spec.ts`.

## CI

The `chromium` browser is downloaded into
`/home/runner/workspace/.cache/ms-playwright`. CI must restore that cache
or run `npx playwright install chromium` (allow ~5 min for the first run).
