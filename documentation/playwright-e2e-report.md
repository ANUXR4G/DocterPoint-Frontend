# Playwright E2E report — GlucoGuide

**Date:** 2026-09-20  
**Suite:** `frontend` Playwright Chromium  
**Result:** **22 / 22 passed** (~2.8 minutes)  
**Command:** `cd frontend && yarn test:e2e`

## Scope completed

| Area | Coverage | Specs |
|------|----------|--------|
| Full patient WhatsApp OTP verify | Web UI: request → Dev code → `/patient/*` | `e2e/patient-otp.spec.ts` |
| End-to-end web book → queue | Patient books Ananya clinic → clinic appointments/queue shows patient | `e2e/book-queue.spec.ts` |
| Expo apps | API contracts + package harness (same `/api/v1` as `apps/mobile` + `apps/provider`) | `e2e/expo-api.spec.ts`, `e2e/expo-harness.spec.ts` |
| Regression | Admin / clinic / doctor portals, public pages | `e2e/admin.spec.ts`, `clinic.spec.ts`, `doctor.spec.ts`, `public.spec.ts`, `patient.spec.ts` |

## How the suite runs

Playwright starts:

1. **Backend** on `http://127.0.0.1:3002` with `QA_EXPOSE_OTP=1` (OTP Dev code in API/UI; short resend cooldown in QA).
2. **Next.js frontend** on `http://localhost:3000` with `BACKEND_URL=http://127.0.0.1:3002`.

Config: `frontend/playwright.config.ts`  
Helpers: `frontend/e2e/helpers.ts` (OTP retry, patient cookie login, slot picker).

### Demo credentials (seed)

| Role | Identity |
|------|----------|
| Patient OTP | `9999973601` (Anurag Nanda) |
| Patient email (API cookie login) | `patient1@example.com` / `Demo@12345` |
| Clinic | `dr.demo@glucoguide.com` / `Demo@12345` |
| Solo doctor | `dr.solo@glucoguide.com` |
| Staff doctor | `dr.staff@glucoguide.com` |

## Results detail (2026-09-20 run)

```
✓ Admin portal — sign in → dashboard
✓ Web book → clinic — book Ananya → clinic appointments show Anurag Nanda
✓ Clinic portal — login + queue page
✓ Doctor portal — solo/staff login + appointments
✓ Expo API — doctor/clinic login, patient OTP verify, practices/mine
✓ Expo harness — package scripts, health, OTP→practices, practice bookings
✓ Patient WhatsApp OTP — UI Dev code → patient dashboard
✓ Patient portal — OTP form present
✓ Public — home, practices, clinic/solo profiles, login hub

22 passed (2.8m)
```

HTML report (local): `frontend/playwright-report/` after a run (`yarn test:e2e:report`).

## Patient WhatsApp OTP

1. `POST /api/v1/auth/otp/request` with phone; response includes `data.debugOtp` when `QA_EXPOSE_OTP=1` or non-production.
2. Web shows **Dev code: ######** on `/login/patient`.
3. `POST /api/v1/auth/otp/verify` issues the same JWT session as password login.
4. OTP sender line: GlucoGuide platform number **+91 99900 52082** (not clinic pool).

QA affordance: with `QA_EXPOSE_OTP=1`, resend cooldown is **2s** (production remains **45s**) so the suite can request OTP more than once.

## Web book → clinic

Flow under test:

1. Patient session via API password login + cookies.
2. Open `/practices/dr-ananya-sharma-clinic`, pick first open slot (labels like `09:00 2/2`).
3. Consent → review → confirm with a unique chief-complaint marker.
4. Fresh browser context → clinic login → `/clinic/queue` (if today) or `/clinic/appointments` (future day).

Note: clinic **queue is today-only**; future-day bookings are asserted on appointments.  
WhatsApp clinic new-booking template may fall back to free text if Meta template name is missing (`docline_clinic_new_booking`); booking still persists.

## Expo apps

Device UI (Expo Go / simulators) is not driven by Playwright Metro. Coverage is the **shared API surface**:

| App | Validated endpoints |
|-----|---------------------|
| `apps/mobile` | `POST /auth/otp/request`, `/auth/otp/verify`, `GET /procto/practices` |
| `apps/provider` | `POST /auth/login` (doctor + clinic portal), `GET /procto/practices/mine`, `GET /procto/bookings/practice/:id` |

### Manual Expo smoke (device)

```bash
# Terminal A — API on 3002 (or 3001 if free)
cd backend && PORT=3002 QA_EXPOSE_OTP=1 yarn dev

# Patient app
cd apps/mobile && EXPO_PUBLIC_API_URL=http://127.0.0.1:3002 yarn start

# Provider app (port 8082)
cd apps/provider && EXPO_PUBLIC_API_URL=http://127.0.0.1:3002 yarn start
```

Use the same demo phone / doctor emails as web. Physical devices need the Mac LAN IP instead of `127.0.0.1` (see `apps/*/lib/resolveApiUrl.ts`).

## Known limitations / follow-ups

1. **Supabase session pool (`EMAXCONNSESSION`)** — intermittent admin overview errors under load; prefer transaction pooler + Prisma `connection_limit` for CI.
2. **Hydration mismatch** on authenticated practice pages (`DashboardShell` vs public shell) — does not fail booking but noisy in logs.
3. **Meta UTILITY template** `docline_clinic_new_booking` missing in WABA translation — text fallback works; approve template before LIVE messaging SLAs.
4. Expo **web** (`expo start --web`) is optional; apps are validated via API contracts until `react-native-web` is wired for CI screenshots.

## QMS links

- Risk: Supabase pool exhaustion + OTP Dev exposure only with `QA_EXPOSE_OTP` — see [risk-register.md](./qms/risk-register.md).
- Auth / WhatsApp OTP behaviour: [flow.md](./flow.md), [Whatsapp-Meta-Rules.md](./Whatsapp-Meta-Rules.md).
- Demo logins: [login.md](./login.md).

## Re-run checklist

```bash
# Free ports used by the suite
lsof -nP -iTCP:3000,3002 -sTCP:LISTEN

cd frontend
yarn test:e2e
yarn test:e2e:report   # optional HTML
```

Requires Postgres reachable from `backend/.env` (`DATABASE_URL` / pooler).
