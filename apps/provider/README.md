# GlucoGuide Doctor (Expo)

Doctor mobile app — day-to-day queue, calendar, patients, visit notes, and **practice subscription / billing**.

Same `PracticeBooking` engine as the web doctor dashboard, patient app, and WhatsApp.

## Features

| Screen | Behavior |
|--------|----------|
| Login | Email + password (`role: doctor`) |
| Queue / Schedule | Today's list **or** week calendar (List \| Calendar switch) · open visit |
| Patients | Practice roster · search · recent visits |
| Plans | Practice subscription · trial / Razorpay activate · plan change |
| Visit | Status · remarks · medicines · Care chat |
| More | WhatsApp takeover · hours/blocks · web portal links · practice switch |

## Setup

```bash
# API (GlucoGuide backend on :3001)
cd backend && npm run dev

# Doctor app (Metro port 8082 beside patient Expo)
cd apps/provider
npm install
npm start
```

**API URL:** `EXPO_PUBLIC_API_URL` (default `http://localhost:3001`).
**Web deep links:** `EXPO_PUBLIC_WEB_URL` (default `http://localhost:3000`).
On a **physical device**, point both at your LAN / tunnel hosts.

## Demo

- `dr.demo@glucoguide.com` / `Demo@12345`
- See [login.md](../../documentation/login.md)

## Architecture note

This is the **doctor** surface of `apps/provider` (not a clinic-admin-only app). Central entity: `PracticeBooking`. Subscriptions are **practice** plans (not patient).
