import { test, expect } from "@playwright/test";

test.describe("Admin gate (Tasks #676/#677)", () => {
  test("unauthenticated /admin redirects to /login with redirect param", async ({
    page,
  }) => {
    await page.goto("/admin");
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain("/login");
    expect(page.url()).toContain("redirect=%2Fadmin");
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
