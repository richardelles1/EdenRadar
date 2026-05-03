# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: login-page.spec.ts >> Login page rendering >> forgot-password link switches view to reset form
- Location: playwright/specs/login-page.spec.ts:12:3

# Error details

```
TimeoutError: locator.click: Timeout 8000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /forgot password/i })

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
  3  | test.describe("Login page rendering", () => {
  4  |   test("sign-in form renders with all expected controls", async ({ page }) => {
  5  |     await page.goto("/login");
  6  | 
  7  |     await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  8  |     await expect(page.getByPlaceholder("Email address")).toBeVisible();
  9  |     await expect(page.getByPlaceholder("Password")).toBeVisible();
  10 |   });
  11 | 
  12 |   test("forgot-password link switches view to reset form", async ({ page }) => {
  13 |     await page.goto("/login");
  14 | 
  15 |     const forgotLink = page.getByRole("button", { name: /forgot password/i });
> 16 |     await forgotLink.click();
     |                      ^ TimeoutError: locator.click: Timeout 8000ms exceeded.
  17 | 
  18 |     await expect(page.getByTestId("input-reset-email")).toBeVisible();
  19 |     await expect(page.getByTestId("button-send-reset")).toBeVisible();
  20 |   });
  21 | 
  22 |   test("back-to-signin link returns to auth view", async ({ page }) => {
  23 |     await page.goto("/login");
  24 |     await page.getByRole("button", { name: /forgot password/i }).click();
  25 |     await page.getByTestId("link-back-to-signin").click();
  26 | 
  27 |     await expect(page.getByPlaceholder("Email address")).toBeVisible();
  28 |   });
  29 | 
  30 |   test("signup mode shows portal-role selector when ?mode=signup", async ({
  31 |     page,
  32 |   }) => {
  33 |     await page.goto("/login?mode=signup");
  34 | 
  35 |     await expect(page.getByRole("heading", { name: /create account/i })).toBeVisible();
  36 |   });
  37 | 
  38 |   test("signup with portal pre-selects role from query param", async ({
  39 |     page,
  40 |   }) => {
  41 |     await page.goto("/login?portal=researcher");
  42 | 
  43 |     await expect(page.getByRole("heading", { name: /create account/i })).toBeVisible();
  44 |   });
  45 | });
  46 | 
```