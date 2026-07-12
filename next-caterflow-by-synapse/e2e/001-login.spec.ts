import { test, expect } from "@playwright/test";

test("login page renders and password reset modal opens", async ({ page }) => {
  const response = await page.goto("/login", { waitUntil: "networkidle" });
  await expect(response?.ok()).toBeTruthy();

  await page.waitForSelector('input[placeholder="Enter your email"]', {
    timeout: 15000,
  });
  await expect(page.getByPlaceholder("Enter your email")).toBeVisible();
  await expect(page.getByPlaceholder("Enter your password")).toBeVisible();
  await expect(page.getByRole("button", { name: /Sign In/i })).toBeVisible();

  await page.getByRole("button", { name: /Forgot your password\?/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await page
    .getByPlaceholder("Enter your email address")
    .fill("test@example.com");

  await page.route("**/api/auth/send-verification-code", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "Verification code sent.",
      }),
    });
  });

  await page.getByRole("button", { name: /Send Reset Code/i }).click();
  await expect(
    page.getByText(/password reset link has been sent/i),
  ).toBeVisible();
});
