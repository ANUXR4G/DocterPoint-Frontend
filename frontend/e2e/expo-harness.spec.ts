import { test, expect } from "@playwright/test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { API_URL, DEMO, requestOtpViaApi } from "./helpers"

const repoRoot = join(__dirname, "../..")

/**
 * Expo apps (apps/mobile patient, apps/provider doctor/clinic) share /api/v1 with web.
 * This harness validates the API surface + package entrypoints without Metro.
 * For device UI: Expo Go with EXPO_PUBLIC_API_URL pointing at the same API.
 */
test.describe("Expo apps harness", () => {
  test("patient + provider package scripts exist", () => {
    const mobile = JSON.parse(
      readFileSync(join(repoRoot, "apps/mobile/package.json"), "utf8"),
    )
    const provider = JSON.parse(
      readFileSync(join(repoRoot, "apps/provider/package.json"), "utf8"),
    )
    expect(mobile.name).toBe("@glucoguide/mobile")
    expect(provider.name).toBe("@glucoguide/provider")
    expect(mobile.scripts.start).toMatch(/expo start/)
    expect(provider.scripts.start).toMatch(/expo start/)
    expect(provider.scripts.web).toMatch(/8082/)
  })

  test("API health matches Expo default backend", async ({ request }) => {
    const res = await request.get(`${API_URL}/health`)
    expect(res.ok()).toBeTruthy()
  })

  test("patient mobile OTP session can list practices", async ({ request }) => {
    const debugOtp = await requestOtpViaApi(request, DEMO.patientPhone)

    const verify = await request.post(`${API_URL}/api/v1/auth/otp/verify`, {
      data: { phone: DEMO.patientPhone, code: debugOtp },
    })
    const session = await verify.json()
    const bearer = session.access_token || session.token
    expect(bearer).toBeTruthy()

    const practices = await request.get(`${API_URL}/api/v1/procto/practices`, {
      headers: { Authorization: `Bearer ${bearer}` },
    })
    expect(practices.ok(), await practices.text()).toBeTruthy()
  })

  test("provider doctor can load mine + practice bookings", async ({
    request,
  }) => {
    const login = await request.post(`${API_URL}/api/v1/auth/login`, {
      data: {
        email: DEMO.doctorStaff,
        password: DEMO.password,
        role: "doctor",
        portal: "doctor",
      },
    })
    expect(login.ok()).toBeTruthy()
    const { access_token, token } = await login.json()
    const bearer = access_token || token
    const headers = { Authorization: `Bearer ${bearer}` }

    const mine = await request.get(`${API_URL}/api/v1/procto/practices/mine`, {
      headers,
    })
    expect(mine.ok(), await mine.text()).toBeTruthy()
    const mineBody = await mine.json()
    const practices = (mineBody.data ?? mineBody) as Array<{ id?: string }>
    const practiceId = Array.isArray(practices)
      ? practices[0]?.id
      : (practices as { id?: string })?.id
    expect(practiceId, "staff doctor should have a practice").toBeTruthy()

    const bookings = await request.get(
      `${API_URL}/api/v1/procto/bookings/practice/${practiceId}`,
      { headers },
    )
    expect(bookings.ok(), await bookings.text()).toBeTruthy()
  })
})