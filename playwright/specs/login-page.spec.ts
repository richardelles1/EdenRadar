import { test, expect } from "@playwright/test";

test.describe("Login page rendering", () => {
  test("sign-in form renders with all expected controls", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    await expect(page.getByPlaceholder("Email address")).toBeVisible();
    await expect(page.getByPlaceholder("Password")).toBeVisible();
  });

  test("forgot-password link switches view to reset form", async ({ page }) => {
    await page.goto("/login");

    const forgotLink = page.getByRole("button", { name: /forgot password/i });
    await forgotLink.click();

    await expect(page.getByTestId("input-reset-email")).toBeVisible();
    await expect(page.getByTestId("button-send-reset")).toBeVisible();
  });

  test("back-to-signin link returns to auth view", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /forgot password/i }).click();
    await page.getByTestId("link-back-to-signin").click();

    await expect(page.getByPlaceholder("Email address")).toBeVisible();
  });

  test("signup mode shows portal-role selector when ?mode=signup", async ({
    page,
  }) => {
    await page.goto("/login?mode=signup");

    await expect(page.getByRole("heading", { name: /create account/i })).toBeVisible();
  });

  test("signup with portal pre-selects role from query param", async ({
    page,
  }) => {
    await page.goto("/login?portal=researcher");

    await expect(page.getByRole("heading", { name: /create account/i })).toBeVisible();
  });
});
