import { test, expect } from "@playwright/test"
import { DEMO, patientOtpLogin, expectLoggedInDashboard } from "./helpers"

test.describe("Patient WhatsApp OTP", () => {
  test("request OTP, verify with Dev code, reach patient area", async ({
    page,
  }) => {
    await patientOtpLogin(page, DEMO.patientPhone)
    await expectLoggedInDashboard(page, "/patient")
    await expect(page.getByText(/Patient portal|Your care|dashboard/i).first()).toBeVisible()
  })
})
