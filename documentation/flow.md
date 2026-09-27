# flow.md — GlucoGuide

End-to-end flows for the canonical web app (`frontend/` + `backend/`).

Local: **http://localhost:3000** (web) · **http://localhost:3001** (API)  
Patient Expo: `apps/mobile` · Provider Expo: `apps/provider` (`npm run dev:provider`)  
Credentials: [login.md](./login.md)

---

## 0. System architecture (channels → one calendar)

```
                    ┌─────────────────────────────┐
                    │   Postgres PracticeBooking  │
                    │  TIME_BASED + TOKEN_BASED   │
                    │  maxPerSlot / maxTokens     │
                    └──────────────▲──────────────┘
           ┌───────────┬──────────┼──────────┬───────────┐
           │           │          │          │           │
     Web portal   Provider app  Patient   WhatsApp AI  Notifications
     /doctor/*    apps/provider app       bot + STT    confirm/remind
     /practices   (Expo)        (Expo)    Meta webhook cancel/queue
```

**Practice types (onboard):** `SOLO` · `CLINIC` (small polyclinic, no HIS) · `MEDICAL_CENTER` (HIS offline; GlucoGuide = online booking layer).

**RBAC:** `User.role` portals + `PracticeMember` (`PRACTICE_OWNER`, `PRACTICE_ADMIN`, `DOCTOR`, `RECEPTIONIST`).

---

## 1. Run & health

```
Postgres (:5432) + Redis (:6379)
        │
        ▼
backend yarn dev  ──►  :3001  /api/v1/*
        ▲
frontend yarn dev ──►  :3000  (pages + /api/v1 proxy)
```

1. Start Redis and Postgres.
2. `cd backend && yarn run dev`
3. `cd frontend && yarn run dev`
4. Open `:3000`. Re-seed if needed: `cd backend && yarn seed`.

---

## 2. Auth (email + password)

```
/login/patient  or  /login/clinic  or  /login/doctor
        │
        ├─ Register ──► POST /auth/signup { email, password, role, name? }
        │                     │
        │                     └─ cookies set ──► patient info / clinic onboard / doctor dashboard
        │
        └─ Login ─────► POST /auth/login { email, password, role }
                              │
                              ├─ role mismatch ──► 403 + hint to other portal
                              └─ cookies set ──► role dashboard
```

| Portal | Role sent | Success landing |
|--------|-----------|-----------------|
| Patient | `user` | `/patient/info` if profile incomplete, else `/patient/dashboard` |
| Clinic | `doctor` | Register → `/doctor/onboard`; login → `/doctor/practice` |
| Doctor | `doctor` | Register or login → `/doctor/dashboard` |
| Patient Google | OAuth | `/patient/dashboard` (or login error query) |

Middleware: unauthenticated `/patient/*` and `/doctor/*` redirect to the matching login with `?callback=…`.

On `/login/patient?mode=register`, patients **upload a government ID first**; OCR autofills name, DOB, gender, address, and contact into the form. They review/edit, add emergency contact / profession / email / password, then create the account. Guest OCR: `POST /auth/id-scan` (JPG/PNG/WEBP/**PDF** — PDF page 1 is rasterized then vision-OCR’d). Logged-in scan also on `/patient/info` and Profile → Edit via `POST /patient/profile/id-scan` (`OPENAI_API_KEY` / `HF_TOKEN`).

On `/login/doctor?mode=register` and `/login/clinic?mode=register`, providers can **upload a visiting card, letterhead, medical licence, or clinic registration** to autofill name / clinic / licence / reg no / phone / email / address. Guest OCR: `POST /auth/doc-scan`.

---

## 3. Patient — discover & book (Procto)

```
/  or  /practices
        │
        ▼
/practices/[slug]     BookingFlow (3 steps)
        │
        ├─ 1. Consultation type   TIME_BASED | TOKEN_BASED
        ├─ 2. Date + slot/token   GET /procto/bookings/availability
        └─ 3. Confirm             POST /procto/bookings
                    │               (patientPhone required; patientId if logged in)
                    ▼
        /bookings/confirmation?id=…
                    │
                    ▼
        /patient/bookings         GET /procto/bookings/mine
                                  PATCH /procto/bookings/:id/cancel
```

Notes:

- Guest booking allowed if phone is provided.
- Logged-in patients auto-fill name/phone/email from profile.
- Seeded schedules are typically Mon–Sat; Sunday defaults to next weekday in the UI.

---

## 4. Clinic registration & doctor login (separate portals)

**Clinic** (`/login/clinic`) — practice owners register and onboard the clinic.  
**Doctor** (`/login/doctor`) — providers sign in for queue / calendar / bookings.

1. **Clinic owner account** — `/login/clinic?mode=register` → `POST /auth/signup` (`role: doctor`)
2. **Practice onboard** — `/doctor/onboard` → Practice → Clinic → Launch → `POST /procto/practices/onboard`

```
Register clinic (/login/clinic?mode=register) ──► /doctor/onboard
        │                      3-step wizard → POST /procto/practices/onboard
        ▼
/doctor/practice
        │  calendar · schedules · overrides
        │  GET/POST …/practices/:id/calendar|schedules|overrides
        ▼
/doctor/queue
        │  today's PracticeBooking list
        │  PATCH /procto/bookings/:id/status
        │  Native ws procto room for live updates
        ▼
(optional) /doctor/patients · appointments · analytics
           legacy hospital appointment flows still available
```

Doctor day-to-day: `/login/doctor` → `/doctor/dashboard` (queue / calendar without clinic registration framing).

| Role | Typical practice |
|------|------------------|
| `dr.demo@…` | Independent / Ananya clinic |
| `anjali@glucoguide.com` | Mehta Skin (`PRACTICE_OWNER`) |
| `rohan@` / `priya@` | City Care (multi-doctor) |

### Subscriptions (enforced)

Plans are seeded/upserted by `NumberPoolService.ensureDefaultPlans` and paid via **Razorpay** Checkout when `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` are set (otherwise mock activate for local).

| Plan | Price | Cap | Includes |
|------|-------|-----|----------|
| Starter | ₹1,499/mo | 150 bookings | Directory + WhatsApp line |
| Growth | ₹2,999/mo | 500 bookings | + reminders, reviews, Find Care priority ranking, multi-doctor |
| Clinic | ₹4,999/mo | 2,000 bookings | + queue analytics, dedicated support |

Gender attribution + analytics class diagrams / flowcharts: [Gender-Analytics-Flow.md](./Gender-Analytics-Flow.md).

- Practice UI: `/doctor/practice?tab=billing`
- Webhook (live): `POST /api/v1/procto/billing/razorpay-webhook` (+ `RAZORPAY_WEBHOOK_SECRET`)
- Entitlements gate bookings, WhatsApp assign/inbound, reminders, reviews, multi-doctor add, analytics
- Find Care (`/practices`) sorts `priorityListing` plans first and shows a **Featured** badge

---

## 5. Practice booking data path

```
ProviderSchedule (+ ScheduleOverride)
        │
        ▼
BookingService.getAvailability(practiceId, providerId, locationId, date)
        │  timeSlots[] / tokenSessions[]
        ▼
BookingService.createBooking({ slotStart | sessionDate, mode, patientPhone, … })
        │
        ├─ PracticeBooking row (ACCEPTED — auto-accepted)
        ├─ optional patient phone sync
        └─ async: notify queue + Socket broadcast
```

Status lifecycle (doctor queue):  
`ACCEPTED` → `WAITING` → `IN_PROGRESS` → `COMPLETED` · or `CANCELED` / `NO_SHOW`.  
`COMPLETED` is set only from the visit page (**Finish appointment** on web, **Save & finish** in the provider app), which saves remarks + medicines in the same call. Queue / Appointments list controls stop at *Appointment started* (+ No-show / Cancel).

---

## 6. Public vs app shells

| Area | Shell | Examples |
|------|--------|----------|
| Marketing / directory / login | `PublicShell` + `SiteNavbar` | `/`, `/practices`, `/about`, `/login/*` |
| Patient app | Patient layout + sidebar | `/patient/*` |
| Doctor app | Doctor layout + sidebar | `/doctor/*` |

---

## 7. API map (booking-critical)

| Method | Path | Who |
|--------|------|-----|
| POST | `/auth/login`, `/auth/signup` | All |
| GET | `/procto/practices`, `/procto/practices/:slug` | Public |
| GET | `/procto/bookings/availability` | Public |
| POST | `/procto/bookings` | Public / patient |
| GET | `/procto/bookings/:id` | Public (confirmation) |
| GET | `/procto/bookings/mine` | Patient |
| PATCH | `/procto/bookings/:id/cancel` | Patient |
| PATCH | `/procto/bookings/:id/reschedule` | Patient |
| GET | `/procto/practices/mine` | Doctor |
| GET | `/procto/bookings/practice/:practiceId` | Doctor |
| PATCH | `/procto/bookings/:id/status` | Doctor |
| GET/POST | `/procto/practices/:id/schedules\|calendar\|overrides` | Doctor |
| GET | `/procto/whatsapp/webhook` | Meta verify |
| POST | `/procto/whatsapp/webhook` | Meta inbound |
| POST | `/procto/whatsapp/webhook/test` | Local simulator |

All browser calls go through `http://localhost:3000/api/v1/…`.

---

## 8. WhatsApp LLM booking bot

**Patients only** — doctor / clinic / staff phone numbers are refused (use the web portal). LLM NLU when configured; otherwise regex (structured steps skip LLM for speed). Meta Cloud send when env is set; otherwise **simulated** sends.

**GlucoGuide number pool:** Ops adds numbers via `POST /api/v1/procto/admin/numbers`, assigns with `POST .../numbers/assign` `{ "practiceId": "..." }` (admin JWT). **Registration also auto-provisions:** clinic/doctor Tel at signup is POSTed to the platform Meta WABA (`/{WABA_ID}/phone_numbers`) when `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_WABA_ID` are set, then linked in `WhatsAppNumber` as **VERIFYING**. GlucoGuide auto-requests Meta SMS OTP (`request_code`); the owner confirms in Billing → WhatsApp (`verify_code` + Cloud API `register`) to go **LIVE** without WhatsApp Manager. MOCK LIVE locally when Meta env is unset. LIVE / connected numbers set **both** `practice.whatsappBusinessNumber` and `practice.phone` (clinic Settings **Tel** = the WhatsApp bot patients message). Self-serve Connect under Billing does the same. Profile Tel cannot diverge while a line is active — change the line via Billing → WhatsApp or admin reassignment. Provisioning SLA target **24–72h** once Meta is live; local uses `MOCK` provider.

```
Inbound → practice resolve → staff gate
        → (voice note → download media → Whisper/HF STT → text)
        → NLU (LLM only on free-form steps)
        → Orchestrator
             REGISTER (name→gender→YES)
             DOCTORS — list clinic doctors
             BOOK → auto-register if needed → auto doctor/mode/slot defaults
             STATUS / CANCEL / RESCHEDULE
        → BookingService + NotificationService (confirm / reminder / queue)
```

**Voice notes:** Patient sends a WhatsApp voice message → Meta webhook `type=audio` → download via Graph API → speech-to-text (`OPENAI_API_KEY` Whisper, else `HF_TOKEN`) → same orchestrator as typed text. No fixed phrase format is required: one note can carry date + time + doctor (“book tomorrow at 10 am with Kabir”). Unclear / empty STT replies asking the patient to speak again or type freely. Spoken times are matched to the nearest open slot when available. Optional `WHATSAPP_STT_LANGUAGE=hi` (or `en`) to bias Whisper. Local test:

**Attach document (Menu → Attach, or *Yes* after booking):** bot first asks **Select Appointment | General Document** (*No* cancels) → *Select Appointment*: 1 upcoming visit → "Send a photo or PDF for this visit: *…*"; 2+ → visit list first → *General Document*: shared number → *Which patient?* → "Send a photo or PDF — saved to *X*'s record (not linked to any appointment)" → file saved to the chosen place. A file sent without choosing first still gets the two buttons after upload when an upcoming visit exists.

**Visit page → Documents:** two tabs — **Appointment** (this visit's `PracticeBooking.documents`, max 5, read-only once finished) and **General** (the patient's `Patient.documents` health record: WhatsApp *General Document* uploads + clinic uploads, max 30). General tab uses `GET/POST /procto/bookings/:id/general-documents` (view: `assertCanViewBooking`; add: active member, own visit unless owner/admin). Patient is resolved from `booking.patientId`, or a *single* account on that phone — never guessed on a shared number (tab then says the visit isn't linked).

**Visit documents (patient → doctor):** Outside active *REGISTER* steps, inbound WhatsApp *image* or *PDF* (`type=image|document`) downloads via Graph → uploads to Cloudinary (same `gluco-guide-users` preset as portal) → appends to the patient’s open `PracticeBooking.documents` (max 5) → live `booking_updated` + care-chat ping to the doctor. Caption becomes the file name. Reply *REPORT* for how-to; *MY DOCS* / *STATUS* list attachments. Active register flow + captions like “Aadhaar/PAN/ID” still use ID OCR — **JPG/PNG/PDF** (PDF page 1 is rasterized, then the same vision OCR as photos).

```json
POST /api/v1/procto/whatsapp/webhook/test
{
  "from": "9999973601",
  "to": "9876543210",
  "type": "audio",
  "transcribedText": "BOOK"
}
```

Or send `audioBase64` + `mimeType` to exercise live STT.

**Care chat ↔ WhatsApp (two-way):** Doctor messages from portal/app care chat fan out to the patient WhatsApp line (`chat.whatsappFanout.ts`) and mark the conversation `handed_off`. Patient text replies on that line are mirrored into care chat (`chat.whatsappInbound.ts`) and pushed on the same `_CHAT` WebSocket rooms; booking commands (`BOOK`, `BOT`, etc.) still go to the orchestrator.

**Visit summary to patient:** When a doctor finishes a visit (`COMPLETED`), `NotificationService.enqueueVisitSummary` sends remarks / medicines / document count on WhatsApp (`VISIT_SUMMARY` / `docline_visit_summary`, free-form fallback). **Prescription mid-visit:** saving medicines on an open visit enqueues `PRESCRIPTION_UPDATE` / `docline_prescription` to the patient WhatsApp (skipped on finish so only the full summary is sent). The same fields are on booking APIs for the patient portal and mobile app.

**Automated patient path**
1. *HELP* / welcome menu is numbered — reply `1`–`9` (or the keyword) when idle: 1 BOOK · 2 DOCTORS · 3 STATUS · 4 REGISTER · 5 FAQ · 6 CANCEL · 7 RESCHEDULE · 8 LANGUAGE · 9 REPORT. Digits during doctor/slot pick still choose that option, not the menu.
2. Mid-flow with no reply: after ~10 min the bot sends an idle **reminder**; after ~30 min it sends **chat closed**, resets to idle, and offers *Menu* again (override with `WA_IDLE_REMINDER_MS` / `WA_IDLE_CLOSE_MS`).
3. *BOOK* without an account → quick register (name → gender → optional email Yes/No → **store WhatsApp sender as registered mobile Yes/No** → confirm) → continues into booking. Email is optional (Yes asks for address; No skips). Mobile is the WhatsApp *from* number (not from ID OCR); No lets the patient type a different 10-digit number. Sign-in remains mobile OTP.
4. Sole doctor / sole mode / sole slot are auto-selected
5. Suggests next open day when booking with a single doctor
6. Confirmations + clinic alerts + 30‑min / token-morning reminders run via workers

**Register flow (standalone):** `REGISTER` → name → gender → email Yes/No → (email if Yes) → **phone Yes/No** (`+91 …` WhatsApp sender) → (type mobile if No) → YES
**Doctors list:** `DOCTORS` (or “list doctors” / “who are the doctors”)  
**Book flow (registered):** `BOOK` → date (**Dates** list = next 7 working days) → (doctor if needed) → (mode buttons if needed) → slot (**time buttons** or *Slots* list) → **"Add chief complaint?" Yes / No** → (Yes) chief complaint (type or voice note; *Skip* button) → summary (shows *Chief complaint*) → **Confirm / Change / Cancel** buttons

**Chief complaint** (`awaiting_chief_complaint_opt` → `awaiting_chief_complaint`): after the slot/token the bot first asks *Would you like to add the chief complaint?* with **Yes / No** buttons. *No* goes straight to the summary; *Yes* (or ok / haan) asks for the complaint. A patient who types a real complaint (2+ words) at the Yes/No step skips the extra question; vague replies ("maybe") re-show the buttons. Asked once per summary; picking a new slot via *Change* asks again. A stale button tap from an earlier card at the confirm step only re-shows the Confirm card — it never books. Voice notes use the same STT path; the text bypasses NLU so symptoms are never re-classified as commands (exact *Menu* / *Cancel* / *Help* still work). Stored as the patient's own words (≤500 chars) in `practice_bookings.disease` (same field as the clinic modal's "Reason for visit"); shown to the doctor in a **Chief complaint** column on the Queue and Appointments tables (a line on mobile cards) and on the visit page. No AI brief or advice is generated. If the text contains words that trip the outbound clinical guard (e.g. "diagnosis"), the summary shows "Noted ✓" instead of echoing it; the full text is still saved.

Local test (no Meta account):

1. `cd backend && yarn worker:all` (notifications + reminders)
2. Seed a practice with `whatsappBusinessNumber` (see seed)
3. `POST http://localhost:3001/api/v1/procto/whatsapp/webhook/test`
   ```json
   { "from": "9876543210", "to": "<practice whatsappBusinessNumber>", "body": "HELP" }
   ```
4. Scripted: `HELP` → `1` (or `BOOK`) → … ; also `REGISTER` → name → gender → `YES` → `DOCTORS` → `BOOK` → … → `STATUS` → `RESCHEDULE` → `CANCEL`

Outbound templates (patient + clinic): confirmation, reminder (~30 min slot / morning-of token), cancel, reschedule, override impact, queue alert (`IN_PROGRESS`).

**Meta compliance:** see [Whatsapp-Meta-Rules.md](./Whatsapp-Meta-Rules.md) — UTILITY-only catalog, STOP opt-out, template sends outside the 24h window, no passwords / medical advice on WA.

**Quality (ISO 9000):** see [ISO-9000.md](./ISO-9000.md) and [qms/](./qms/) — release checklist, risk register, CAPA log.

---

## 9. Smoke checklist

1. Login doctor + patient from [login.md](./login.md).
2. Open `/practices` → search by specialty/name or city (pan-India directory).
3. Open `/practices/city-care-polyclinic` → pick a weekday slot → confirm.
4. As City Care doctor, open `/doctor/queue` (pick booking date if not today) → change status.
5. As patient, `/patient/bookings` → cancel a scheduled booking.
6. Doctor `/doctor/practice` calendar loads for a member practice.
7. WhatsApp simulator: `HELP` / `BOOK` against seeded practice number (see §8).
8. Hospitals home: city search filters the map list.

See [decisions.md](./decisions.md) for why these paths exist.
