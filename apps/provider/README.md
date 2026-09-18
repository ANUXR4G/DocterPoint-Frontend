# GlucoGuide Doctor / Clinic (Expo)

Provider mobile app — **Home dashboard**, day queue, calendar, patients, visit notes, and **practice subscription / billing**.

Same `PracticeBooking` engine as the web doctor/clinic portals, patient app, and WhatsApp.

## Features

| Screen | Behavior |
|--------|----------|
| Login | Doctor **or** Clinic portal (`role: doctor` + `portal`) · demo accounts |
| Register | Independent doctor signup · **clinic register** (owner + practice + trial) |
| Home | Today metrics · quick actions (queue, calendar, patients, analytics, plans) |
| Queue | Today's list · status filters · open visit |
| Calendar | Week view of upcoming visits |
| Patients | Practice roster · search · recent visits |
| Analytics | Patients and bookings over time |
| Plans | Practice subscription · trial / Razorpay · plan change |
| Visit | Status · remarks · medicines · Care chat |
| More | WhatsApp takeover · hours/blocks · web portal links · practice switch |

## Setup

```bash
# API (GlucoGuide backend on :3001)
cd backend && npm run dev

# Provider app (Metro port 8082 beside patient Expo)
cd apps/provider
npm install
npm start
```

**API URL:** `EXPO_PUBLIC_API_URL` (default `http://localhost:3001`).
**Web deep links:** `EXPO_PUBLIC_WEB_URL` (default `http://localhost:3000`).
On a **physical device**, point both at your LAN / tunnel hosts.

## Demo

- Clinic / owner: `dr.demo@glucoguide.com` / `Demo@12345` (sign in as **Clinic**)
- Staff: `dr.staff@glucoguide.com` / `Demo@12345`
- Solo doctor: `dr.solo@glucoguide.com` / `Demo@12345` (sign in as **Doctor**)
- See [login.md](../../documentation/login.md)

Login matches the web portals (`portal: doctor` | `clinic`). New clinics and independent doctors can register in-app.

## Architecture note

Central entity: `PracticeBooking`. Subscriptions are **practice** plans (not patient). Clinic-admin tools (hours, team) use the same membership roles as web.
