# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-gate.spec.ts >> Admin gate (Tasks #676/#677) >> unauthenticated /admin redirects to /login with redirect param
- Location: playwright/specs/admin-gate.spec.ts:4:3

# Error details

```
TimeoutError: page.waitForURL: Timeout 10000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - region "Notifications (F8)":
    - list
  - generic [ref=e4]:
    - img [ref=e6]
    - generic [ref=e9]:
      - heading "EdenRadar" [level=1] [ref=e10]
      - paragraph [ref=e11]: "Private beta: enter access code"
    - textbox "Access code" [active] [ref=e12]
    - button "Enter" [ref=e13] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test.describe("Admin gate (Tasks #676/#677)", () => {
  4  |   test("unauthenticated /admin redirects to /login with redirect param", async ({
  5  |     page,
  6  |   }) => {
  7  |     await page.goto("/admin");
> 8  |     await page.waitForURL(/\/login/, { timeout: 10_000 });
     |                ^ TimeoutError: page.waitForURL: Timeout 10000ms exceeded.
  9  |     expect(page.url()).toContain("/login");
  10 |     expect(page.url()).toContain("redirect=%2Fadmin");
  11 |   });
  12 | 
  13 |   test("admin API endpoint rejects unauthenticated requests with 401", async ({
  14 |     request,
  15 |   }) => {
  16 |     const res = await request.get("/api/admin/alerts/latency");
  17 |     expect(res.status()).toBe(401);
  18 |     const body = await res.json();
  19 |     expect(body.error).toMatch(/admin/i);
  20 |   });
  21 | 
  22 |   test("admin API endpoint rejects bogus bearer token with 401", async ({
  23 |     request,
  24 |   }) => {
  25 |     const res = await request.get("/api/admin/alerts/latency", {
  26 |       headers: { authorization: "Bearer not.a.real.jwt" },
  27 |     });
  28 |     expect(res.status()).toBe(401);
  29 |   });
  30 | });
  31 | 
```