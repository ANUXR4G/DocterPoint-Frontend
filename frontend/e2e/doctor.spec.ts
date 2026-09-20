import { test, expect } from "@playwright/test"
import { DEMO, fillRoleLogin, expectLoggedInDashboard } from "./helpers"

test.describe("Doctor portal", () => {
  test("solo doctor can sign in and reach dashboard", async ({ page }) => {
    await page.goto("/login/doctor")
    await expect(page.getByRole("heading", { name: /doctor login/i })).toBeVisible()
    await fillRoleLogin(page, DEMO.doctorSolo)
    await expectLoggedInDashboard(page, "/doctor")
    await expect(page).toHaveURL(/\/doctor\/dashboard/)
  })

  test("staff doctor can sign in", async ({ page }) => {
    await page.goto("/login/doctor")
    await fillRoleLogin(page, DEMO.doctorStaff)
    await expectLoggedInDashboard(page, "/doctor")
  })

  test("solo doctor appointments page loads", async ({ page }) => {
    await page.goto("/login/doctor")
    await fillRoleLogin(page, DEMO.doctorSolo)
    await expectLoggedInDashboard(page, "/doctor")
    await page.goto("/doctor/appointments")
    await expect(page).toHaveURL(/\/doctor\/appointments/)
    await expect(page.locator("body")).toBeVisible()
  })
})
