import { test, expect } from "@playwright/test"

test.describe("Patient portal", () => {
  test("patient login shows WhatsApp OTP form", async ({ page }) => {
    await page.goto("/login/patient")
    await expect(page.getByRole("heading", { name: /welcome back|patient/i }).first()).toBeVisible()
    await expect(
      page.getByText(/whatsapp|otp|mobile|phone/i).first(),
    ).toBeVisible()
    // Phone field present (OTP flow — full verify needs live WA / QA_EXPOSE_OTP)
    const phone = page.locator('input[name="phone"], input[inputmode="tel"]').first()
    await expect(phone).toBeVisible()
  })
})
