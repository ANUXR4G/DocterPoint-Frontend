# GlucoGuide — User Manual

**Product:** GlucoGuide clinic booking & WhatsApp reception (web: GlucoGuide)  
**Audience:** Patients, doctors, clinic owners, reception staff, platform admins  
**Last updated:** 13/10/2026  
**Related docs:** [login.md](./login.md) (demo accounts) · [flow.md](./flow.md) (technical flows) · [WhatsApp-How-It-Works.md](./WhatsApp-How-It-Works.md)

---

## Table of contents

1. [Introduction](#1-introduction)
2. [Who uses what](#2-who-uses-what)
3. [Getting started](#3-getting-started)
4. [Patient guide (web)](#4-patient-guide-web)
5. [Patient guide (mobile app)](#5-patient-guide-mobile-app)
6. [Doctor & clinic guide (web)](#6-doctor--clinic-guide-web)
7. [Practice setup (Settings → Practice)](#7-practice-setup-settings--practice)
8. [Subscription & billing](#8-subscription--billing)
9. [WhatsApp booking](#9-whatsapp-booking)
10. [Reviews & ratings](#10-reviews--ratings)
11. [Mira assistant](#11-mira-assistant)
12. [Appearance & account settings](#12-appearance--account-settings)
13. [Provider mobile app](#13-provider-mobile-app)
14. [Platform admin](#14-platform-admin)
15. [Troubleshooting & FAQ](#15-troubleshooting--faq)
16. [Support](#16-support)

---

## 1. Introduction

GlucoGuide helps clinics accept appointments online and over WhatsApp from a single calendar. Patients can **find clinics**, **book a slot or token**, and **manage bookings**. Doctors and clinic staff use a **dashboard**, **queue**, and **calendar** to run the day. Optional **WhatsApp** turns the clinic number into a smart receptionist for booking, status, and reminders.

**GlucoGuide** is the web application (`frontend` + `backend`). The same API also powers:

- **Patient mobile app** — `apps/mobile` (Expo)
- **Provider mobile app** — `apps/provider` (Expo)

---

## 2. Who uses what

| Role | Sign-in | Main tasks |
|------|---------|------------|
| **Patient** | `/login/patient` or mobile app | Find clinics, book, cancel/reschedule, profile, post-visit reviews |
| **Doctor** | `/login/doctor` | Queue, calendar, appointments, analytics, subscription |
| **Clinic owner** | `/login/clinic` (same account type as doctor) | Clinic details, add doctors, WhatsApp setup, Role access. Not a bookable doctor until they open a schedule. |
| **Platform admin** | `/login` → admin | Patients, doctors, clinics, bookings, WhatsApp numbers, approvals |

**Practice membership:** A user can belong to a practice as **Owner**, **Admin**, **Doctor**, **Nurse**, or **Receptionist**. Owners and admins create those logins from **Role access** (`/clinic/access`) and can change the subscription.

---

## 3. Getting started

### 3.1 Web addresses (local development)

| Service | URL |
|---------|-----|
| Web app | http://localhost:3000 |
| API | http://localhost:3001 |

Production URLs depend on your deployment; paths below are the same.

### 3.2 Demo accounts

See **[login.md](./login.md)** for seeded emails and password **`Demo@12345`**.

| Portal | URL | Example account |
|--------|-----|-----------------|
| Patient | `/login/patient` | `patient1@example.com` |
| Doctor | `/login/doctor` | `dr.demo@glucoguide.com` |
| Clinic | `/login/clinic` | `dr.demo@glucoguide.com` |
| Admin | `/login` | `admin@glucoguide.com` |

### 3.3 Create an account

**Patients**

1. Open **Patient login** → **Register**.
2. Optionally upload a government ID — the form can autofill name, date of birth, gender, and address.
3. Complete email, password, and emergency contact.
4. After sign-up you land on the patient dashboard or profile completion.

**Doctors (solo)**

1. Open **Doctor login** → **Register**.
2. Optionally upload a visiting card, licence, or letterhead to autofill details.
3. Complete registration → **Doctor dashboard**.

**Clinics**

1. Open **Clinic login** → **Register** (creates a provider account).
2. Complete the **onboarding wizard** (practice type, name, location, plan).
3. Finish **Settings → Practice** and **Subscription** when ready.

### 3.4 Sign out

Use **Logout** in the sidebar or profile menu. Sessions use secure cookies; closing the browser does not always sign you out until the session expires.

---

## 4. Patient guide (web)

### 4.1 Sidebar navigation

| Menu | Path | Purpose |
|------|------|---------|
| Dashboard | `/patient/dashboard` | Overview and shortcuts |
| Find clinics | `/practices` | Search and browse directory |
| My Bookings | `/patient/bookings` | Upcoming and past visits |
| Profile | `/patient/profile` | Personal and ID details |
| Settings | `/settings` | Theme and text size |

### 4.2 Find a clinic

1. Go to **Find clinics** (`/practices`) or the home page directory.
2. Search by **doctor name**, **specialty**, or **city**.
3. A clinic with more than one doctor shows **one Book button per doctor** (for example **Book Dr. Kabir Mehta** and **Book Dr. Mohammed Gouse**). Opening a button selects that doctor and that doctor’s slots.
4. The clinic owner is not listed for booking until they open their own schedule.
5. Cards show **ratings** when verified reviews exist.

Dates on screen are **dd/mm/yyyy**. When a time is shown it is **dd/mm/yyyy HH:mm** (24-hour, clinic time Asia/Kolkata).

### 4.3 Book an appointment

From a clinic profile:

1. **Consultation type** — **Time slot** (fixed time) or **Token queue** (numbered queue for the day).
2. **Date** — Choose an available day (schedules are set by the clinic).
3. **Slot or token** — Pick from live availability.
4. **Confirm** — Sign in first. The visit is booked on your own patient record. A typed patient id from the browser is ignored.
5. **Confirmation** — You receive a confirmation screen and (when configured) WhatsApp/SMS.

**Manage bookings** (`/patient/bookings`):

- View upcoming and past visits.
- **Cancel** or **reschedule** while the booking is still allowed.
- Open a **completed** booking to leave a **verified review** (see §10).

### 4.4 Profile & health (legacy)

Patient profile stores contact and ID information. Some deployments also expose health records and medications under patient routes; availability depends on your clinic’s configuration.

---

## 5. Patient guide (mobile app)

The **GlucoGuide patient app** (`apps/mobile`) connects to the same API.

Typical tabs:

| Screen | Purpose |
|--------|---------|
| Home | Quick actions and summary |
| Find clinic / Doctors | Browse practices |
| Appointments / Bookings | Your visits |
| Queries | Messages or queries to clinic (if enabled) |
| Profile | Account details |

**Finding a doctor.** Home and **Find a clinic** show **one card per bookable doctor**, with the clinic name under the doctor. Tap the card to book that doctor. The clinic owner is not offered until they open a schedule.

**Booking on mobile** mirrors the web flow: open that doctor → choose date → slot/token → confirm. Dates are **dd/mm/yyyy**. A time is **dd/mm/yyyy HH:mm**.

**One mobile, more than one person.** The country code is part of the number, so `+971 …` and `+1 …` are different people even when the last digits match. Sign-in opens the **account holder**. A person registered as **Child** (also son or daughter) on that same number appears under **People on this number**, labeled **Child · with** the parent. Open that chip to see the child’s own visits and profile. A spouse or any other adult stays on their own record and is not opened by the parent’s sign-in.

**Visit:** A finished visit, or one that already has a chart, shows **Prescription** with vitals, allergies, pain, remarks, and medicines, plus the doctor’s name, licence, and the clinic address. You can **Cancel appointment** while it is still accepted and not yet started.

**Current Android install (08/10/2026, version 0.2.0):** https://expo.dev/artifacts/eas/JSAtpLLJ1--T7QMBAlRUPjg-szIpbdsqrC38Zknkr3E.apk — this file does not yet include the doctor cards or the child switcher. Those appear on the website now and on the phone after the next app build.

**Reviews:** After a **completed** visit, open the booking detail screen and submit a star rating and optional comment.

**API URL:** Set `EXPO_PUBLIC_API_URL` to your backend (e.g. `http://<your-lan-ip>:3001` on a physical device).

---

## 6. Doctor & clinic guide (web)

### 6.1 Sidebar navigation

| Menu | Path | Purpose |
|------|------|---------|
| Dashboard | `/doctor/dashboard` or `/clinic/dashboard` | Today’s queue snapshot and quick links |
| Appointments | `/doctor/appointments` | List and manage appointments |
| Calendar | `/doctor/calendar` | Day/week view of bookings |
| Analytics | `/doctor/analytics` | Charts (Clinic plan for live data) |
| Subscription | `/doctor/subscription` or `/clinic/subscription` | Plan, billing, WhatsApp connect |
| Settings | `/settings` | Account, **Practice**, theme |

Clinic and doctor portals share the same tools; clinic dashboard emphasises multi-doctor context.

### 6.2 Dashboard & queue

**Dashboard** shows live queue metrics and links to **Analytics**, **Practice settings**, and **Subscription**.

**Queue** (`/doctor/queue`):

- Lists today’s bookings for your practice.
- Before arrival: **Arrived**, **No-show** (Did not arrive), or **Canceled** (Patient canceled / Clinic canceled).
- In waiting: **Start consultation**, **No-show** (Left before being seen), or **Canceled** (Patient left / Clinic canceled).
- In consultation: **Finish** only. Finish opens the visit so remarks and medicines save with it. Cancel and No-show are not available once the consultation has started.
- A finished visit is locked.
- Documentation follows the **clinic calendar day** (Asia/Kolkata), not the clock. Any visit whose day is today or earlier can be documented, including a slot later today. A visit on a **later day** cannot: vitals, pain, allergies, remarks, medicines, documents, arrived, start, and finish stay closed. **Cancel** and **No-show** stay available. The chief complaint can still be updated.

**Visit documentation** (open a visit from the queue, appointments, or the patient record):

| Section | What you record |
|---------|-----------------|
| **Vitals** | Height, weight, BMI, temperature, blood pressure, pulse, respiration, SpO2, random blood sugar. Bands show when a value is outside the clinic’s range. |
| **Pain** | Scale, score, location, type, duration, frequency, and radiation, chosen from labels. |
| **Allergies** | Catalog entries, or **No known allergies**. |
| **Remarks** | Advice and follow-up. |
| **Prescription** | Medicine name, dose, and timing. |
| **Documents** | Photos and files for this visit, plus the patient’s general record. |

Each save keeps a version and shows **Saved** with the time. On a finished visit, **Rx** opens the clinic log (vitals, allergies, pain, remarks, prescription) and can send it to the patient on WhatsApp.

The **Patients** list shows the same four lines on each recent visit, so the chart is visible without opening the visit first.

The queue updates in real time when the websocket connection is active.

### 6.3 Calendar

**Calendar** (`/doctor/calendar`) shows bookings and schedule blocks for the selected provider and date. Use it to see capacity and timing conflicts alongside **Settings → Practice → Schedule**.

### 6.4 Appointments

**Appointments** lists historical and upcoming visits with filters. Columns include Patient, MRN, Doctor, When, Arrival, Chief complaint, Status, Payment, Chat, Rx, and Visit. **When** is **dd/mm/yyyy HH:mm**.

**Chief complaint** is blank until someone records it. The doctor can add or change it on this list, including after the visit is finished. That save updates only the reason for the visit.

**Book appointment** looks up a patient by mobile, name, or MRN. A full mobile matches that number only (`+971` does not return a `+1` number that ends with the same digits). **Emergency walk-in** looks up by **name only** (two or more letters). Pick the patient, the doctor, and an optional chief complaint. No slot is required.

### 6.5 Analytics

**Analytics** (`/doctor/analytics`):

- **Total patients** and **bookings** for the selected period (day, week, month, year, year-on-year).
- **Charts:** gender split (bar + doughnut) and booking trend (line).
- **Clinic plan** unlocks live analytics; other plans may show sample charts until you upgrade.

Use **View patients** to jump to the patient list in Practice settings.

### 6.6 Clinic registration (new practices)

1. Register at **`/login/clinic`**.
2. Complete **`/doctor/onboard`** — practice type (solo / clinic / medical center), name, address, and initial plan.
3. Open **Settings → Practice** to configure schedule, doctors, and WhatsApp.
4. Open **Subscription** to activate or upgrade the plan.

---

## 7. Practice setup (Settings → Practice)

Practice management lives under **Settings → Practice** (not the main sidebar). Sub-tabs:

| Sub-tab | What you configure |
|---------|-------------------|
| **Schedule** | Calendar view of bookings; day-to-day schedule |
| **Hours & blocks** | Working days, session times, breaks, slot length, token vs time mode, date overrides |
| **Doctors** | Roster for multi-doctor clinics (Growth / Clinic plans) |
| **Patients** | Patients seen at the practice; visit history links |
| **WhatsApp** | Inbox and conversation view for the clinic line |

### 7.1 Hours & booking mode

Each doctor can run **one mode**:

- **Time slots** — Patients pick a clock time; `maxPerSlot` controls parallel bookings.
- **Token queue** — Patients receive a token number for the session.

Set **working days**, **start/end**, **break**, **slot duration**, and **appointment validity** (how far ahead patients can book).

**Overrides** block days or add extra sessions (holidays, evening clinics).

### 7.2 Adding doctors (clinic)

Under **Doctors** (or **Settings → Account** for clinic-type practices):

1. Enter doctor name, login email, and password.
2. Optional specialty and licence.
3. Doctor signs in at **`/login/doctor`** with those credentials.

**Multi-doctor** requires **Growth** or **Clinic** plan. Solo **Starter** allows one doctor.

### 7.3 Patients list

**Patients** shows **one row per MRN**. The same person is not repeated because of visit status. Two people who share a phone but have different MRNs stay on two rows. Each recent visit lists **Vitals**, **Allergies**, **Pain**, and **Prescription**, plus **Open visit**. Completed queue visits appear here automatically.

---

## 8. Subscription & billing

Open **Subscription** from the sidebar (`/doctor/subscription` or `/clinic/subscription`).

### 8.1 Plans (typical)

| Plan | Monthly (INR) | Booking cap | Highlights |
|------|---------------|-------------|------------|
| **Starter** | ₹1,499 | 150 | Directory listing + WhatsApp line |
| **Growth** | ₹2,999 | 500 | Reminders, reviews, priority listing, multi-doctor |
| **Clinic** | ₹4,999 | 2,000 | Queue analytics, dedicated support |

Exact features and prices are shown in the subscription UI and may be updated by your operator.

### 8.2 Upgrades & downgrades

- **Upgrade** — Takes effect immediately; a new **one-month** billing period starts.
- **Downgrade** — Scheduled for the **end of the current period**; you keep current features until then.
- **Trial** — Where offered, starts entitlements without payment for the trial window.

### 8.3 Payment

Paid plans use **Razorpay** checkout in the browser. After payment, the subscription shows **Active** and entitlements apply immediately.

### 8.4 WhatsApp on subscription page

The same **Subscription** page includes **Connect WhatsApp** (Meta Embedded Signup or assigned pool number, depending on configuration). WhatsApp requires an active plan that includes the WhatsApp line feature.

### 8.5 What happens if subscription lapses

Inactive subscriptions may pause **new bookings**, **WhatsApp inbound**, and **directory priority**. Existing data is retained; renew to restore service.

---

## 9. WhatsApp booking

Patients message the **clinic WhatsApp business number**. The bot (not the doctor’s personal app) replies and can register, list doctors, book, check status, cancel, and reschedule.

**Plain-language guide:** [WhatsApp-How-It-Works.md](./WhatsApp-How-It-Works.md)  
**Meta compliance:** [Whatsapp-Meta-Rules.md](./Whatsapp-Meta-Rules.md)

### 9.1 Patient commands (examples)

| Message | Action |
|---------|--------|
| `HELP` | Menu of options |
| `REGISTER` | Quick sign-up (name, gender) |
| `DOCTORS` | List doctors at the clinic |
| `BOOK` | Start booking flow |
| `STATUS` | Today’s booking status |
| `CANCEL` / `RESCHEDULE` | Change an existing booking |
| `STOP` | Opt out of non-essential messages |

Voice notes are transcribed when speech-to-text is configured.

### 9.2 Clinic setup summary

1. Active **Starter+** subscription with WhatsApp entitlement.
2. Number assigned (pool) or connected via **Subscription → WhatsApp**.
3. Meta-approved **utility templates** for confirmations and reminders.
4. Webhook live on the API.

Doctors use the **web portal** for queue and calendar; they do not need to scan a QR code to “turn on” the bot.

### 9.3 Staff inbox

**Settings → Practice → WhatsApp** shows conversation threads for oversight. Escalations may be handled per your clinic policy.

---

## 10. Reviews & ratings

- Only patients with a **completed** booking can leave a review.
- Reviews are tied to the **booking** (one review per visit).
- **Find clinics** and **clinic profiles** show average rating and review count.
- Web: submit from **`/patient/bookings/[bookingId]`** after completion.
- Mobile: submit from the booking detail screen.

Clinics cannot post fake public reviews; the system requires a verified completed visit.

---

## 11. Mira assistant

**Mira** is the in-app AI helper (floating button on authenticated patient and doctor routes).

- Ask about booking, navigation, or product help.
- Replies are informational only — **not medical advice**.
- For urgent care, contact your clinic or emergency services.

Mira uses the configured LLM backend when available; otherwise it may show a limited or offline state.

---

## 12. Appearance & account settings

**Settings** (`/settings`) has three areas for providers:

| Tab | Contents |
|-----|----------|
| **Account** | Clinic or doctor registration fields, licence, address, add doctors (clinic) |
| **Practice** | Schedule, hours, doctors, patients, WhatsApp (see §7) |
| **Theme** | Light / dark / system, **accent colour**, **text size** (saved to account) |

Patients use **Theme** (and profile elsewhere) for appearance.

**Save** buttons use your selected theme accent colour.

---

## 13. Provider mobile app

The **provider app** (`apps/provider`) is for doctors and staff on the go.

Typical screens:

| Screen | Purpose |
|--------|---------|
| Queue | Today’s patients and status updates |
| Appointments | Visits, emergency walk-in, and Rx on a finished visit |
| Visit | Vitals, pain, allergies, remarks, prescription, documents, and the patient record |
| Patients | Roster with each visit’s vitals, allergies, pain, and prescription |
| Schedule | Working schedule view |
| Inbox / Queries | Patient messages |
| Settings | Account, photos, and the vitals / allergy / pain catalogs |

Sign in with the same **doctor** credentials as the web portal. A clinic owner or receptionist sees every practicing doctor when booking or filtering the queue. A doctor signed in as staff sees their own list.

The visit screen uses the same day rule as the website: document any visit on today’s clinic date, including a later time today; do not document a visit on a later date. Dates are **dd/mm/yyyy HH:mm**.

**Current Android install (08/10/2026, version 0.1.0):** https://expo.dev/artifacts/eas/RzZMwjytUnv6J4uOdDyHvE5lsuMfS4omHCztOJRGx5I.apk — this file does not yet include the day rule or the dd/mm/yyyy clock. Those appear on the website now and on the phone after the next app build.

Point the app API URL to your backend (`EXPO_PUBLIC_API_URL`).

---

## 14. Platform admin

Sign in at **`/login`** with an **admin** account → **`/admin/dashboard`**.

| Area | Purpose |
|------|---------|
| Dashboard | Platform metrics |
| Patients / Doctors / Clinics | Directory of accounts |
| Bookings | Cross-tenant booking oversight |
| Payments | Subscription and payment records |
| Approvals | Go-live and escalation workflows |
| WhatsApp | Number pool, assign numbers to practices |

Admin actions affect production data; follow your organisation’s change-control process ([release-checklist.md](./qms/release-checklist.md)).

---

## 15. Troubleshooting & FAQ

### I cannot sign in

- Use the correct portal: patient vs doctor vs clinic vs admin.
- **Role mismatch** — e.g. doctor account on patient login shows an error; use **Doctor login**.
- Reset password via your deployment’s reset flow, or re-seed demo data locally (`cd backend && yarn seed`).

### A doctor I added does not appear for booking

- Confirm the person is an active **Doctor** on the clinic roster, and that the clinic plan allows more than one doctor.
- The clinic **owner** is not bookable until **Open schedule** is used for that owner.
- On **Find clinics**, use that doctor’s own **Book** button. The clinic card lists every bookable doctor.
- The Android apps installed from the 08/10/2026 builds still show the older list until a new build is installed. The website already lists each doctor.

### Sign-in shows only one person on a shared mobile

- Sign-in opens the **account holder** on that exact number, including country code.
- Register a child as **Child** (or son / daughter) on the parent’s number. They then appear under **People on this number**, with the parent’s name.
- A spouse or another adult is a separate record. The desk can still find them by the full mobile when booking. Their chart is not opened by the parent’s sign-in.

### I cannot document a future appointment

- Documentation is allowed on the appointment’s clinic day, at any time that day.
- A visit dated after today stays closed until that day. Cancel and no-show still work.

### No slots on the booking page

- Clinic may be closed that day, fully booked, or outside **appointment validity** window.
- Try the next weekday; seeded demos are often Mon–Sat only.

### Queue is empty

- Check the **date** filter matches the booking date.
- Bookings must be **scheduled** for today and assigned to your provider.

### Analytics shows “upgrade” or sample data

- **Live queue analytics** requires the **Clinic** plan. Charts may show sample data until upgraded.

### WhatsApp bot does not reply

- Confirm subscription is active and number is assigned/LIVE.
- Meta template approval can take **24–72 hours**.
- Patients must message the **clinic business number**, not the doctor’s personal WhatsApp.

### “Failed to retrieve doctor profile” or API errors

- Ensure the **backend API** is running (`cd backend && yarn dev`).
- Web app proxies to the API; if the API is down, pages show errors or 502.

### Payment / subscription stuck

- Complete Razorpay checkout in the popup; do not close early.
- If checkout succeeded but status did not update, refresh **Subscription** or contact support with payment reference.

### Reviews not available

- Booking must be **Completed** by the clinic in the queue.
- Each booking allows **one** review.

---

## 16. Support

| Channel | Use for |
|---------|---------|
| **Clinic plan dedicated support** | WhatsApp go-live, billing, directory — email **support@glucoguide.com** with your clinic slug |
| **Documentation** | [flow.md](./flow.md), [WhatsApp-How-It-Works.md](./WhatsApp-How-It-Works.md) |
| **Demo / QA** | [login.md](./login.md) |

---

## Quick reference — URLs

| Task | URL |
|------|-----|
| Find clinics | `/practices` |
| Patient login | `/login/patient` |
| Doctor login | `/login/doctor` |
| Clinic login | `/login/clinic` |
| Doctor dashboard | `/doctor/dashboard` |
| Clinic dashboard | `/clinic/dashboard` |
| Queue | `/doctor/queue` |
| Calendar | `/doctor/calendar` |
| Analytics | `/doctor/analytics` |
| Subscription | `/doctor/subscription` or `/clinic/subscription` |
| Practice settings | `/settings?tab=practice` |
| Account settings | `/settings?tab=settings` |
| Theme | `/settings?tab=theme` |
| Patient bookings | `/patient/bookings` |
| Admin | `/admin/dashboard` |

---

*This manual describes the GlucoGuide / GlucoGuide product as implemented in the `frontend` + `backend` stack. Mobile apps follow the same booking and auth model with Expo-specific navigation.*
