import { test, expect } from "@playwright/test"
import { DEMO, fillRoleLogin, expectLoggedInDashboard } from "./helpers"

test.describe("Clinic portal", () => {
  test("clinic owner can sign in and reach dashboard", async ({ page }) => {
    await page.goto("/login/clinic")
    await expect(page.getByRole("heading", { name: /clinic login/i })).toBeVisible()
    await fillRoleLogin(page, DEMO.clinic)
    await expectLoggedInDashboard(page, "/clinic")
    await expect(page).toHaveURL(/\/clinic\/dashboard/)
  })

  test("clinic queue page loads after login", async ({ page }) => {
    await page.goto("/login/clinic")
    await fillRoleLogin(page, DEMO.clinic)
    await expectLoggedInDashboard(page, "/clinic")
    await page.goto("/clinic/queue")
    await expect(page.locator("body")).toBeVisible()
    await expect(page).toHaveURL(/\/clinic\/queue/)
  })
})
