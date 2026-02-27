import { test, expect } from "@playwright/test";

test("homepage loads and displays default message", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByText("Select a project to get started")
  ).toBeVisible();
});

test("API health endpoint responds", async ({ request }) => {
  const response = await request.get("http://localhost:3001/health");
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.status).toBe("ok");
});
