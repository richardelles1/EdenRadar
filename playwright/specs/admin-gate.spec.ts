import { test, expect } from "@playwright/test";
import { bypassSiteGate } from "../fixtures/sitegate";

test.describe("Admin gate (Tasks #676/#677)", () => {
  test("unauthenticated /admin redirects to /login with redirect param", async ({
    page,
  }) => {
    await bypassSiteGate(page);
    await page.goto("/admin");
    // Auth context resolves client-side, then AdminAuthGate's useEffect calls
    // navigate("/login?redirect=/admin"). Allow generous time for cold loads.
    await page.waitForURL(/\/login/, { timeout: 25_000 });
    expect(page.url()).toContain("/login");
    // The redirect= param may or may not be URL-encoded depending on wouter's
    // location helpers; accept both forms.
    expect(page.url()).toMatch(/redirect=(%2F|\/)admin/);
  });

  test("admin API endpoint rejects unauthenticated requests with 401", async ({
    request,
  }) => {
    const res = await request.get("/api/admin/alerts/latency");
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/admin/i);
  });

  test("admin API endpoint rejects bogus bearer token with 401", async ({
    request,
  }) => {
    const res = await request.get("/api/admin/alerts/latency", {
      headers: { authorization: "Bearer not.a.real.jwt" },
    });
    expect(res.status()).toBe(401);
  });
});
