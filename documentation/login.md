# Demo logins (GlucoGuide)

Minimal seed: **1 clinic · 1 doctor · 1 patient** (+ platform admin).  
Password for all accounts below: **`Demo@12345`**

## Admin — `/login` → `/admin/dashboard`

| Email | Password |
|-------|----------|
| `admin@glucoguide.com` | `Demo@12345` |

## Clinic portal — `/login/clinic`

Same account as the doctor (SOLO practice owner):

| Email | Password | Clinic |
|-------|----------|--------|
| `dr.demo@glucoguide.com` | `Demo@12345` | Dr. Ananya Sharma Clinic |

## Doctor portal — `/login/doctor`

| Email | Password | Practice |
|-------|----------|----------|
| `dr.demo@glucoguide.com` | `Demo@12345` | Dr. Ananya Sharma Clinic |

## Patient — web `/login/patient` or Expo `apps/mobile`

Patient login **and** Expo signup are **mobile number + WhatsApp OTP** only (from GlucoGuide `+91 99900 52082`).

| Mobile (demo) | Notes |
|---------------|-------|
| `9999973601` | Seeded patient `patient1@example.com` / Ravi Kumar — request OTP on login |

Email/password is **not** used on patient login or mobile create-account screens. Doctor/clinic/admin still use email + `Demo@12345`.

**Expo / mobile:** set `EXPO_PUBLIC_API_URL` to a reachable API (Railway or LAN IP). Restart Expo after env changes.

## Browse

- Find Care: `/practices`
- Clinic profile: `/practices/dr-ananya-sharma-clinic`
- Practice billing: `/doctor/practice?tab=billing`

Re-seed: `cd backend && yarn seed`

## QA demo accounts (from `npx tsx scripts/qa-seed.ts`)

Password for all: **`Demo@12345`**

| Role | Email | Notes |
|------|-------|-------|
| Admin | `admin@glucoguide.com` | Platform ops |
| Doctor A | `qa.doctor.a@glucoguide.com` | Owner of `qa-clinic-a` |
| Doctor B | `qa.doctor.b@glucoguide.com` | Member of `qa-clinic-a` |
| Patient A | `qa.patient.a@glucoguide.com` | Multi-status bookings + review |
| Patient B | `qa.patient.b@glucoguide.com` | Isolation peer |
| Patient C | `qa.patient.c@glucoguide.com` | Isolation peer |

Clinic profile: `/practices/qa-clinic-a`

QA seed is non-destructive (upsert). Re-run: `cd backend && npx tsx scripts/qa-seed.ts`  
Cross-role API suite: `cd backend && npx tsx scripts/qa-e2e-flow.ts`
