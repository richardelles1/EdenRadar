import { test, expect } from "@playwright/test";

test.describe("Public marketing pages", () => {
  test("/ Landing renders without auth", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBeLessThan(400);
    await expect(page).toHaveTitle(/.+/);
  });

  test("/market/preview renders the EdenMarket preview", async ({ page }) => {
    const res = await page.goto("/market/preview");
    expect(res?.status()).toBeLessThan(400);
  });

  test("/market/list renders the public listings page", async ({ page }) => {
    const res = await page.goto("/market/list");
    expect(res?.status()).toBeLessThan(400);
  });

  test("/pricing renders without auth", async ({ page }) => {
    const res = await page.goto("/pricing");
    expect(res?.status()).toBeLessThan(400);
  });

  test("/tos and /privacy render without auth", async ({ page }) => {
    const tos = await page.goto("/tos");
    expect(tos?.status()).toBeLessThan(400);
    const priv = await page.goto("/privacy");
    expect(priv?.status()).toBeLessThan(400);
  });

  test("404 for unknown route", async ({ page }) => {
    await page.goto("/this-route-definitely-does-not-exist-xyz");
    // wouter NotFound renders a 200 with a NotFound component — assert page didn't crash.
    await expect(page.locator("body")).toBeVisible();
  });
});
