# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: unsubscribe.spec.ts >> Unsubscribe flow (RFC 8058 + UI) >> tampered token shows error UI
- Location: playwright/specs/unsubscribe.spec.ts:52:3

# Error details

```
Error: page.goto: Target page, context or browser has been closed
Call log:
  - navigating to "http://localhost:5000/unsubscribe?t=garbage.signature", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import {
  3  |   cleanupE2ERows,
  4  |   closePool,
  5  |   getIndustryProfile,
  6  |   seedIndustryProfile,
  7  | } from "../fixtures/db";
  8  | import { signUnsubscribeToken } from "../fixtures/tokens";
  9  | import { bypassSiteGate } from "../fixtures/sitegate";
  10 | 
  11 | test.describe("Unsubscribe flow (RFC 8058 + UI)", () => {
  12 |   test.beforeEach(async ({ page }) => {
  13 |     await bypassSiteGate(page);
  14 |   });
  15 | 
  16 |   test.afterAll(async () => {
  17 |     await cleanupE2ERows();
  18 |     await closePool();
  19 |   });
  20 | 
  21 |   test("signed token unsubscribes the user and updates DB", async ({ page }) => {
  22 |     const userId = await seedIndustryProfile({ subscribedToDigest: true });
  23 |     const token = signUnsubscribeToken(userId);
  24 | 
  25 |     await page.goto(`/unsubscribe?t=${encodeURIComponent(token)}`);
  26 | 
  27 |     await expect(page.getByTestId("page-unsubscribe")).toBeVisible();
  28 |     await expect(page.getByTestId("text-unsubscribe-success")).toBeVisible({
  29 |       timeout: 10_000,
  30 |     });
  31 | 
  32 |     const profile = await getIndustryProfile(userId);
  33 |     expect(profile?.subscribed_to_digest).toBe(false);
  34 |   });
  35 | 
  36 |   test("repeat unsubscribe shows already-unsubscribed state", async ({ page }) => {
  37 |     const userId = await seedIndustryProfile({ subscribedToDigest: false });
  38 |     const token = signUnsubscribeToken(userId);
  39 | 
  40 |     await page.goto(`/unsubscribe?t=${encodeURIComponent(token)}`);
  41 | 
  42 |     await expect(page.getByTestId("text-unsubscribe-already")).toBeVisible({
  43 |       timeout: 10_000,
  44 |     });
  45 |   });
  46 | 
  47 |   test("missing token shows error UI", async ({ page }) => {
  48 |     await page.goto(`/unsubscribe`);
  49 |     await expect(page.getByTestId("text-unsubscribe-error")).toBeVisible();
  50 |   });
  51 | 
  52 |   test("tampered token shows error UI", async ({ page }) => {
> 53 |     await page.goto(`/unsubscribe?t=garbage.signature`);
     |                ^ Error: page.goto: Target page, context or browser has been closed
  54 |     await expect(page.getByTestId("text-unsubscribe-error")).toBeVisible({
  55 |       timeout: 10_000,
  56 |     });
  57 |   });
  58 | 
  59 |   test("RFC 8058 one-click POST endpoint accepts signed token", async ({
  60 |     request,
  61 |   }) => {
  62 |     const userId = await seedIndustryProfile({ subscribedToDigest: true });
  63 |     const token = signUnsubscribeToken(userId);
  64 | 
  65 |     const res = await request.post(`/unsubscribe?t=${encodeURIComponent(token)}`, {
  66 |       headers: { "content-type": "application/x-www-form-urlencoded" },
  67 |       data: "List-Unsubscribe=One-Click",
  68 |     });
  69 | 
  70 |     expect(res.status()).toBe(200);
  71 |     const profile = await getIndustryProfile(userId);
  72 |     expect(profile?.subscribed_to_digest).toBe(false);
  73 |   });
  74 | 
  75 |   test("JSON unsubscribe API rejects bad token with 400", async ({ request }) => {
  76 |     const res = await request.post(`/api/digest/unsubscribe`, {
  77 |       data: { token: "not.a.real.token" },
  78 |     });
  79 |     expect(res.status()).toBe(400);
  80 |     const body = await res.json();
  81 |     expect(body.ok).toBe(false);
  82 |   });
  83 | });
  84 | 
```