import { test, expect } from "@playwright/test"
import { API_URL, DEMO, requestOtpViaApi } from "./helpers"

/**
 * Contract tests for the same /api/v1 endpoints Expo apps/mobile + apps/provider call.
 * Does not start Metro; validates the API surface Expo depends on.
 */
test.describe("Expo API contracts", () => {
  test("doctor portal login (provider app)", async ({ request }) => {
    const res = await request.post(`${API_URL}/api/v1/auth/login`, {
      data: {
        email: DEMO.doctorSolo,
        password: DEMO.password,
        role: "doctor",
        portal: "doctor",
      },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.access_token || body.token).toBeTruthy()
    expect(body.role).toMatch(/doctor/i)
  })

  test("clinic portal login (provider app)", async ({ request }) => {
    const res = await request.post(`${API_URL}/api/v1/auth/login`, {
      data: {
        email: DEMO.clinic,
        password: DEMO.password,
        role: "doctor",
        portal: "clinic",
      },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.access_token || body.token).toBeTruthy()
  })

  test("patient WhatsApp OTP request + verify (mobile app)", async ({
    request,
  }) => {
    const debugOtp = await requestOtpViaApi(request, DEMO.patientPhone)

    const verify = await request.post(`${API_URL}/api/v1/auth/otp/verify`, {
      data: { phone: DEMO.patientPhone, code: debugOtp },
    })
    expect(verify.ok(), await verify.text()).toBeTruthy()
    const session = await verify.json()
    expect(session.access_token || session.token).toBeTruthy()
    expect(session.role).toMatch(/user/i)
  })

  test("provider practices/mine after doctor login", async ({ request }) => {
    const login = await request.post(`${API_URL}/api/v1/auth/login`, {
      data: {
        email: DEMO.doctorStaff,
        password: DEMO.password,
        role: "doctor",
        portal: "doctor",
      },
    })
    const { access_token, token } = await login.json()
    const bearer = access_token || token
    const mine = await request.get(`${API_URL}/api/v1/procto/practices/mine`, {
      headers: { Authorization: `Bearer ${bearer}` },
    })
    expect(mine.ok(), await mine.text()).toBeTruthy()
  })
})
