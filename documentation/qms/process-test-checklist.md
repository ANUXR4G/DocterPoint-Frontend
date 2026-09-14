# Process test checklist (GlucoGuide web)

Canonical stack: `frontend/` `:3000` + `backend/` `:3001`. Demo logins: [login.md](../login.md).

Automated coverage: `yarn qa` / `npm run qa` (requires both servers + seeded DB).

## A. Public discovery & booking

| # | Step | Pass? |
|---|------|-------|
| A1 | Open `/practices` — Location + Search inputs visible and usable | |
| A2 | Search city / specialty returns seed clinic | |
| A3 | Fee filter (≤ ₹500 / ₹1000 / ₹2000) narrows list | |
| A4 | Featured / Available-to-book badges render when applicable | |
| A5 | Open `/practices/dr-ananya-sharma-clinic` — profile + booking flow | |
| A6 | Share profile copies/shares URL | |
| A7 | Book a slot as guest or patient → confirmation page | |
| A8 | Unknown slug → not found (no empty 200 leak) | |

## B. Patient

| # | Step | Pass? |
|---|------|-------|
| B1 | Login `patient1@example.com` / `Demo@12345` | |
| B2 | `/patient/bookings` lists upcoming | |
| B3 | Cancel with optional reason → clinic notified path | |
| B4 | Protected patient routes redirect when logged out | |

## C. Doctor / clinic

| # | Step | Pass? |
|---|------|-------|
| C1 | Login `dr.demo@glucoguide.com` / `Demo@12345` | |
| C2 | `/doctor/practice` — schedules / queue for today | |
| C3 | Billing page shows plan + entitlements | |
| C4 | Growth+ gates: multi-doctor, analytics, reviews (Starter blocks correctly) | |

## D. WhatsApp / assistant

| # | Step | Pass? |
|---|------|-------|
| D1 | Test webhook voice path with `transcribedText: HELP` returns bot reply | |
| D2 | Assistant status endpoint healthy | |

## E. Subscriptions

| # | Step | Pass? |
|---|------|-------|
| E1 | Plans catalog returns Starter / Growth / Clinic | |
| E2 | Seed clinic has usable subscription | |
| E3 | Directory listing respects listing entitlement | |

Sign-off: _____________ Date: _____________
