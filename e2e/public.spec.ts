import { test, expect } from "@playwright/test"

test.describe("Public pages", () => {
  test("home loads with GlucoGuide branding", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveTitle(/GlucoGuide/i)
    await expect(page.locator("body")).toBeVisible()
  })

  test("practices directory loads", async ({ page }) => {
    await page.goto("/practices")
    await expect(page.locator("body")).toBeVisible()
    await expect(page.getByText(/Ananya|Priya|clinic|Find|Care|practice/i).first()).toBeVisible({
      timeout: 20_000,
    })
  })

  test("clinic public profile loads", async ({ page }) => {
    await page.goto("/practices/dr-ananya-sharma-clinic")
    await expect(page.getByText(/Ananya Sharma/i).first()).toBeVisible({
      timeout: 20_000,
    })
  })

  test("solo doctor public profile loads", async ({ page }) => {
    await page.goto("/practices/dr-priya-nair-clinic")
    await expect(page.getByText(/Priya Nair/i).first()).toBeVisible({
      timeout: 20_000,
    })
  })

  test("login hub links to role portals", async ({ page }) => {
    await page.goto("/login")
    await expect(page.getByRole("link", { name: /doctor/i }).first()).toBeVisible()
    await expect(page.getByRole("link", { name: /clinic/i }).first()).toBeVisible()
    await expect(page.getByRole("link", { name: /patient/i }).first()).toBeVisible()
  })
})
