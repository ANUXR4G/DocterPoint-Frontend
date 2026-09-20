import { test, expect } from "@playwright/test"
import { DEMO, fillRoleLogin, expectLoggedInDashboard } from "./helpers"

test.describe("Admin portal", () => {
  test("admin can sign in and reach dashboard", async ({ page }) => {
    await page.goto("/login/admin")
    await expect(page.getByRole("heading", { name: /admin login/i })).toBeVisible()
    await fillRoleLogin(page, DEMO.admin)
    await expectLoggedInDashboard(page, "/admin")
    await expect(page).toHaveURL(/\/admin\/dashboard/)
  })
})
