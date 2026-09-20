import { test, expect } from "@playwright/test"
import {
  DEMO,
  fillRoleLogin,
  loginPatientViaApi,
  pickFirstAvailableSlot,
  expectLoggedInDashboard,
} from "./helpers"

test.describe("Web book → clinic queue", () => {
  test("patient books at Ananya clinic; booking appears for clinic staff", async ({
    page,
    request,
    browser,
  }) => {
    test.setTimeout(180_000)
    const diseaseMarker = `E2E web book ${Date.now()}`

    await loginPatientViaApi(page, request)
    await page.goto("/practices/dr-ananya-sharma-clinic")
    await expect(
      page.getByRole("heading", { name: /Dr\. Ananya Sharma Clinic/i }),
    ).toBeVisible({ timeout: 20_000 })

    const kabir = page.getByRole("button", { name: /Dr\.?\s*Kabir Mehta/i })
    if (await kabir.isVisible().catch(() => false)) {
      await kabir.click()
    }

    const dateInput = page.locator('input[type="date"]').first()
    await expect(dateInput).toBeVisible({ timeout: 20_000 })

    let bookedToday = true
    let slotLabel = ""
    for (let add = 0; add <= 6; add++) {
      const d = new Date()
      d.setDate(d.getDate() + add)
      if (d.getDay() === 0) continue
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      await dateInput.fill(iso)
      await page.waitForTimeout(800)
      const anySlot = page.getByRole("button", { name: /^\d{1,2}:\d{2}/ }).first()
      if (await anySlot.isVisible().catch(() => false)) {
        bookedToday = add === 0
        slotLabel = await pickFirstAvailableSlot(page)
        break
      }
    }
    expect(slotLabel, "expected at least one open slot in the next week").toBeTruthy()

    await page.getByRole("checkbox", { name: /consent to GlucoGuide/i }).check()
    await page.getByRole("button", { name: /Review booking/i }).click()

    await expect(page.getByTestId("booking-review-summary")).toBeVisible({
      timeout: 15_000,
    })
    await page.getByLabel(/What is the problem/i).fill(diseaseMarker)
    await page.getByRole("button", { name: /Confirm booking/i }).click()

    await expect(page).toHaveURL(/\/bookings\/confirmation/, { timeout: 30_000 })
    await expect(
      page.getByRole("heading", { name: /Booking confirmed/i }),
    ).toBeVisible()

    // Fresh context — patient cookies must not block clinic login.
    const clinicCtx = await browser.newContext()
    const clinicPage = await clinicCtx.newPage()
    await clinicPage.goto("/login/clinic")
    await fillRoleLogin(clinicPage, DEMO.clinic)
    await expectLoggedInDashboard(clinicPage, "/clinic")

    if (bookedToday) {
      await clinicPage.goto("/clinic/queue")
      await expect(clinicPage).toHaveURL(/\/clinic\/queue/)
      const marker = clinicPage.getByText(diseaseMarker).or(
        clinicPage.getByText(DEMO.patientName),
      )
      await marker.first().scrollIntoViewIfNeeded()
      await expect(marker.first()).toBeVisible({ timeout: 20_000 })
    } else {
      await clinicPage.goto("/clinic/appointments")
      // Patient name may sit in a truncated/tooltip cell — attach + scroll.
      await expect(clinicPage.getByText(DEMO.patientName).first()).toBeAttached({
        timeout: 20_000,
      })
      await expect
        .poll(async () => clinicPage.getByText(DEMO.patientName).count())
        .toBeGreaterThan(0)
    }

    await clinicCtx.close()
  })
})
