# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 001-login.spec.ts >> login page renders and password reset modal opens
- Location: e2e/001-login.spec.ts:3:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForSelector: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('input[placeholder="Enter your email"]') to be visible

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - complementary [ref=e2]:
    - generic [ref=e5]: Loading...
  - generic [ref=e6]:
    - generic [ref=e10]: Loading...
    - contentinfo [ref=e11]:
      - separator [ref=e12]
      - generic [ref=e14]:
        - paragraph [ref=e15]:
          - text: © 2026 Caterflow by
          - link "Synapse Digital" [ref=e16] [cursor=pointer]:
            - /url: https://synapse-digital.vercel.app
          - text: . All rights reserved.
        - generic [ref=e17]:
          - link "Privacy Policy" [ref=e18] [cursor=pointer]:
            - /url: /privacy
          - link "Terms of Service" [ref=e19] [cursor=pointer]:
            - /url: /terms
          - link "Support" [ref=e20] [cursor=pointer]:
            - /url: https://caterflow-docs.vercel.app/
  - button "Open Next.js Dev Tools" [ref=e26] [cursor=pointer]:
    - img [ref=e27]
  - alert [ref=e30]
  - generic:
    - region "Notifications-top"
    - region "Notifications-top-left"
    - region "Notifications-top-right"
    - region "Notifications-bottom-left"
    - region "Notifications-bottom"
    - region "Notifications-bottom-right"
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test("login page renders and password reset modal opens", async ({ page }) => {
  4  |   const response = await page.goto("/login", { waitUntil: "networkidle" });
  5  |   await expect(response?.ok()).toBeTruthy();
  6  | 
> 7  |   await page.waitForSelector('input[placeholder="Enter your email"]', {
     |              ^ Error: page.waitForSelector: Test timeout of 30000ms exceeded.
  8  |     timeout: 15000,
  9  |   });
  10 |   await expect(page.getByPlaceholder("Enter your email")).toBeVisible();
  11 |   await expect(page.getByPlaceholder("Enter your password")).toBeVisible();
  12 |   await expect(page.getByRole("button", { name: /Sign In/i })).toBeVisible();
  13 | 
  14 |   await page.getByRole("button", { name: /Forgot your password\?/i }).click();
  15 |   await expect(page.getByRole("dialog")).toBeVisible();
  16 | 
  17 |   await page
  18 |     .getByPlaceholder("Enter your email address")
  19 |     .fill("test@example.com");
  20 | 
  21 |   await page.route("**/api/auth/send-verification-code", (route) => {
  22 |     route.fulfill({
  23 |       status: 200,
  24 |       contentType: "application/json",
  25 |       body: JSON.stringify({
  26 |         success: true,
  27 |         message: "Verification code sent.",
  28 |       }),
  29 |     });
  30 |   });
  31 | 
  32 |   await page.getByRole("button", { name: /Send Reset Code/i }).click();
  33 |   await expect(
  34 |     page.getByText(/password reset link has been sent/i),
  35 |   ).toBeVisible();
  36 | });
  37 | 
```