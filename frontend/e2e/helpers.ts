import { expect, type APIRequestContext, type Page } from "@playwright/test"

export const DEMO = {
  password: "Demo@12345",
  admin: "admin@glucoguide.com",
  clinic: "dr.demo@glucoguide.com",
  doctorSolo: "dr.solo@glucoguide.com",
  doctorStaff: "dr.staff@glucoguide.com",
  patientEmail: "patient1@example.com",
  patientPhone: "9999973601",
  patientName: "Anurag Nanda",
} as const

export const API_URL =
  process.env.PLAYWRIGHT_API_URL ?? "http://127.0.0.1:3002"
export const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"

/** Fill email/password login form used by AuthPortal audiences. */
export async function fillRoleLogin(
  page: Page,
  email: string,
  password = DEMO.password,
) {
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole("button", { name: /^sign in$/i }).click()
}

export async function expectLoggedInDashboard(
  page: Page,
  pathPrefix: "/admin" | "/clinic" | "/doctor" | "/patient",
) {
  await expect(page).toHaveURL(new RegExp(`${pathPrefix}/`), { timeout: 30_000 })
  await expect(page.locator("body")).not.toContainText(
    /Login service unavailable|Backend unavailable/i,
  )
}

/** Request OTP via API; retry after Meta/resend cooldown when needed. */
export async function requestOtpViaApi(
  request: APIRequestContext,
  phone = DEMO.patientPhone,
): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await request.post(`${API_URL}/api/v1/auth/otp/request`, {
      data: { phone },
    })
    const body = await res.json()
    const debugOtp =
      body?.data?.debugOtp || body?.debugOtp || body?.data?.data?.debugOtp
    if (typeof debugOtp === "string" && /^\d{6}$/.test(debugOtp)) {
      return debugOtp
    }
    const msg = String(body?.message || body?.error || "")
    if (/wait\s+\d+s/i.test(msg) || res.status() === 429) {
      const sec = Number(msg.match(/(\d+)\s*s/i)?.[1] || 45)
      await new Promise((r) => setTimeout(r, (sec + 1) * 1000))
      continue
    }
    throw new Error(
      `OTP request failed (${res.status()}): ${JSON.stringify(body)}`,
    )
  }
  throw new Error("OTP request exhausted retries (cooldown)")
}

/** Patient UI OTP login — uses Dev code when QA_EXPOSE_OTP / non-prod exposes it. */
export async function patientOtpLogin(
  page: Page,
  phone = DEMO.patientPhone,
) {
  await page.goto("/login/patient")
  await page.locator('input[name="phone"]').fill(phone)

  for (let attempt = 0; attempt < 4; attempt++) {
    await page.getByRole("button", { name: /send whatsapp otp/i }).click()
    const otpInput = page.locator('input[name="otp"]')
    const cooldown = page.getByText(/Please wait \d+s/i)
    try {
      await expect(otpInput).toBeVisible({ timeout: 8_000 })
      break
    } catch {
      if (await cooldown.isVisible().catch(() => false)) {
        const text = (await cooldown.textContent()) || ""
        const sec = Number(text.match(/(\d+)\s*s/i)?.[1] || 45)
        await page.waitForTimeout((sec + 1) * 1000)
        continue
      }
      if (attempt === 3) throw new Error("OTP step not shown after retries")
    }
  }

  const devCode = page.getByText(/Dev code:\s*\d{6}/i)
  await expect(devCode).toBeVisible({ timeout: 15_000 })
  const text = await devCode.textContent()
  const otp = text?.match(/(\d{6})/)?.[1]
  if (!otp) throw new Error("debugOtp not shown — set QA_EXPOSE_OTP=1 on API")

  await page.locator('input[name="otp"]').fill(otp)
  await page.getByRole("button", { name: /verify/i }).click()
  await expect(page).toHaveURL(/\/patient\//, { timeout: 30_000 })
}

/** Set session cookies via API password login (skips OTP UI). */
export async function loginPatientViaApi(
  page: Page,
  request: APIRequestContext,
) {
  const res = await request.post(`${API_URL}/api/v1/auth/login`, {
    data: {
      email: DEMO.patientEmail,
      password: DEMO.password,
      role: "user",
    },
  })
  expect(res.ok(), `patient API login ${res.status()}`).toBeTruthy()
  const body = await res.json()
  const access = String(body.access_token || body.token || "")
  const refresh = String(body.refresh_token || "")
  expect(access.length).toBeGreaterThan(10)

  // Playwright: use domain+path (not url+path together).
  await page.context().addCookies([
    {
      name: "access_token",
      value: access,
      domain: "localhost",
      path: "/",
    },
    ...(refresh
      ? [
          {
            name: "refresh_token",
            value: refresh,
            domain: "localhost",
            path: "/",
          },
        ]
      : []),
  ])
}

/** Pick first enabled time-slot button (label like "09:00" or "09:00 2/2"). */
export async function pickFirstAvailableSlot(page: Page) {
  const slot = page
    .getByRole("button", { name: /^\d{1,2}:\d{2}/ })
    .filter({ hasNot: page.locator("[disabled]") })
    .first()
  await expect(slot).toBeVisible({ timeout: 25_000 })
  const label = (await slot.textContent())?.trim() ?? ""
  await slot.click()
  return label
}
