# EdenRadar Playwright E2E harness

End-to-end tests for the 9 critical user journeys identified in Task #688.

## Status

Last verified run: **20 passing, 8 skipped (skeletons)**.

| Spec file               | Tests   | Coverage                                                          |
|-------------------------|---------|-------------------------------------------------------------------|
| `public-pages.spec.ts`  | 6 / 6   | `/`, `/market/preview`, `/what-we-do`, `/pricing`, `/tos`, `/privacy` render without auth (SiteGate-bypassed paths and SSR'd marketing routes). |
| `unsubscribe.spec.ts`   | 6 / 6   | Journey 8 — signed token unsubscribes user, double-unsubscribe shows already-state, missing/tampered tokens render error UI, RFC 8058 one-click POST `/unsubscribe`, JSON `/api/digest/unsubscribe` rejects bad tokens with 400. DB state asserted via `fixtures/db.ts`. |
| `admin-gate.spec.ts`    | 3 / 3   | Journey 7 (partial) — unauth `/admin` redirects to `/login?redirect=/admin`, admin API endpoints return 401, `/login` page renders for redirect target. |
| `login-page.spec.ts`    | 5 / 5   | Login form rendering smoke: email/password inputs, submit button, "Forgot password" link, error toast on bad creds. |
| `_skeletons.spec.ts`    | 0 / 8   | Journeys 1, 2, 3, 4, 5, 6, 9 — `test.fixme` placeholders with detailed TODO blocks naming the exact infrastructure each needs (test-only Supabase project, network mocks, ingestion fixtures, etc.). |

Total: **28 tests across 5 spec files.** Active specs cover Journey 7 (partial) and Journey 8 (full); the other 7 journeys are scaffolded as `test.fixme` skeletons with implementation notes.

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
  ⚠️ The fixture **refuses to open the pool** unless `E2E_ALLOW_DB_WRITES=true`
  is set — an explicit opt-in confirming the target DB is non-production.
  `scripts/test-e2e.sh` sets it automatically; CI must export it manually.
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
