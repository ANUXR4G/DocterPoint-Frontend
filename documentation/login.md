# Demo logins (GlucoGuide)

Password for all accounts below: **`Demo@12345`**

There are **two kinds of doctors**:

| Type | How they exist | Login |
|------|----------------|-------|
| **Independent doctor** | Self-register at `/login/doctor` → own **SOLO** practice | Doctor Login |
| **Clinic doctor** | Created by clinic from dashboard (name/email/password) | Doctor Login |
| **Clinic owner** | Register at `/login/clinic` | Clinic Login (Doctor Login also OK if they practice) |

Independently registered doctors **cannot** be added to a clinic roster. Clinics create staff logins only from the dashboard.

## Admin — `/login` → `/admin/dashboard`

| Email | Password |
|-------|----------|
| `admin@glucoguide.com` | `Demo@12345` |

## Clinic portal — `/login/clinic`

| Email | Password | Role |
|-------|----------|------|
| `dr.demo@glucoguide.com` | `Demo@12345` | Clinic owner — Dr. Ananya Sharma Clinic |

## Doctor portal — `/login/doctor`

| Email | Password | Role |
|-------|----------|------|
| `dr.solo@glucoguide.com` | `Demo@12345` | Independent solo doctor · WA **+91 99900 52082** |
| `dr.staff@glucoguide.com` | `Demo@12345` | Clinic-added staff doctor |
| `dr.demo@glucoguide.com` | `Demo@12345` | Clinic owner (also practices) |

## Provider Expo — `apps/provider`

Same credentials as web. On the login screen choose **Doctor** or **Clinic**, then sign in (or register an independent doctor / new clinic in-app). After login you land on **Home** (today metrics + quick actions), with Queue, Calendar, Patients, Analytics, and More in the dock.

## Patient — web `/login/patient` or Expo `apps/mobile`

Patient login **and** Expo signup are **mobile number + WhatsApp OTP** only.

| Mobile (demo) | Notes |
|---------------|-------|
| `9999973601` | Seeded patient `patient1@example.com` / Ravi Kumar |

## Browse

- Find Care: `/practices`
- Clinic profile: `/practices/dr-ananya-sharma-clinic`
- Solo profile: `/practices/dr-priya-nair-clinic`

## Re-seed

```bash
cd backend && yarn seed
```

After re-seeding, **sign out and sign in again** (old session cookies point at wiped user IDs and show “No practice linked”).

## Client demo — clinic WhatsApp booking (multi-doctor)

Clinic line (seed): patient WhatsApp → practice number ending **9876543210** (LIVE demo line).

Use a **patient** phone (not staff). Seeded patient: `9999973601` (Ravi Kumar — already registered).

**Script (≈ 60 seconds):**

1. Patient: `BOOK`  
   → Bot lists doctors with specialization (tappable *Doctors* list when Meta is connected):  
   - Dr. Kabir Mehta — Diabetology  
   - Dr. Ananya Sharma — Endocrinology  
2. Patient: `1` (or tap Kabir / type `Kabir`)  
3. Patient: `TOMORROW`  
4. Patient: pick a slot number (or confirm token if prompted)  
5. Patient: `YES`  
6. Optional: `STATUS` to show the booking; open Clinic Login → Queue to show live update

**Tips**

- First `BOOK` skips the language gate (defaults to English) for a faster demo.  
- `DOCTORS` shows the same specialized list anytime.  
- After re-seed, clear any old WhatsApp conversation state or use a fresh patient number if the bot seems stuck mid-flow.  
- Clinic portal: `dr.demo@glucoguide.com` / Doctor staff: `dr.staff@glucoguide.com` — password `Demo@12345`.

## Registration Tel → Meta phone list

When a clinic or independent doctor registers with a **Tel** number:

1. GlucoGuide calls Meta `POST /{WHATSAPP_WABA_ID}/phone_numbers` (requires `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_WABA_ID`).
2. The number appears on the Meta WhatsApp account phone list and as a `WhatsAppNumber` row in Admin → WhatsApp.
3. Newly added numbers stay **VERIFYING** until SMS/voice OTP is completed in WhatsApp Manager (or Billing → Connect). Numbers already on the WABA connect as **LIVE**.
4. Without Meta credentials (local demo), the Tel is linked as a **MOCK LIVE** line so the admin list and bot routing still work.
