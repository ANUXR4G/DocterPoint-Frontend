# CAPA / Nonconformity log (ISO 9001 §10.2)

Append new entries at the top. Do not delete closed records.

---

## Template (copy for each NC)

```
### NC-YYYYMMDD-##
- **Date opened:**
- **Severity:** 1 / 2 / 3
- **Process:** P-BOOK | P-PROV | P-NOTIFY | P-AUTH | P-REL | P-SUP | Other
- **Description:** (what requirement failed)
- **Evidence:** (logs, screenshots, ticket, Meta email)
- **Containment:** (immediate stop-gap)
- **Root cause:** (brief)
- **Corrective action:** (permanent fix)
- **Owner / due:**
- **Verification:** (how we proved it works)
- **Status:** Open | Verified | Closed
- **Docs updated:** (ISO-9000 / decisions / Meta rules / Cursor rules)
```

---

## Records

### CR-20260928-14
- **Date opened:** 2026-09-28
- **Severity:** 3 (change control — billing)
- **Process:** P-BILL (patient payments) / Settings
- **Description:** Clinics and solo doctors asked to collect patient payments into **their own Razorpay account** instead of the platform account (settlement was manual).
- **Evidence:** User request; all Payment Links (WA advance / fee, custom requests) used the platform `RAZORPAY_KEY_ID` (CR-20260928-11 / -12).
- **Containment:** n/a (new capability; platform account remains the fallback so existing flows are unchanged).
- **Root cause:** Single platform key hard-wired in `lib/razorpay.ts`; no per-practice credentials.
- **Corrective action:** Settings → **Online payments (Razorpay)** (owner / admin, or the solo doctor): Key ID + Key Secret + optional webhook secret, verified live with Razorpay (`GET /payments?count=1`) before saving; secrets AES-256-GCM encrypted (`core/security.encrypt`), excluded from every default Prisma read (global `omit`) and never returned (only `••••last4`). Payment Links use the clinic's account when connected, else the platform account; each `payment_requests` row stores the `razorpay_key_id` it was created with so callbacks / refresh / cancel use the right secret. Per-clinic webhook `POST /procto/payments/razorpay/webhook/:practiceId` verified with the clinic's webhook secret and limited to that clinic's links (platform webhook can't touch clinic-account links). Razorpay 401 mapped to 502 / a clear 400 so it is not mistaken for session expiry. Subscription billing stays on the platform account.
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** 176/176 procto tests (new: key ID format / mode, per-account callback signature, webhook secret HMAC). Browser (dr.solo): panel shows *Not connected* + platform fallback + webhook URL; malformed Key ID → "Enter a valid Razorpay Key ID…"; well-formed fake keys → "Razorpay rejected this Key ID / Key Secret…" (session kept). Server script: save with real keys → connected, secret absent from response, DB values are ciphertext, default practice read has no secret columns; clinic webhook bad signature → 401, good signature → 200, no secret → 200 ignored; keys removed afterwards (practice back to platform fallback). Backend tsc + build, frontend tsc + build, provider tsc clean.

### CR-20260928-13
- **Date opened:** 2026-09-28
- **Severity:** 2
- **Process:** P-BOOK (slots) / Settings
- **Description:** Found while verifying CR-20260928-12. (1) Doctor **Settings** sometimes showed default hours (09:00–17:00, 15-min slots) instead of the saved schedule; pressing *Save* would then overwrite the real slots. (2) **Solo doctors could not save their fee** (nor the new advance amount): `PATCH /procto/practices/:id/profile` returned 403 "only clinic owners…".
- **Evidence:** Browser (dr.solo): after reload the form showed 09:00–17:00 while DB rows were 10:00–14:00 / 20 min; resource timing showed `GET …/schedules?providerId=52T4p8AwTA-…` → 403. Direct profile PATCH → 403; the only member of the SOLO practice has role `DOCTOR`.
- **Containment:** DB schedule rows confirmed untouched (`updatedAt` 2026-09-17) before any further save.
- **Root cause:** (1) `DoctorAccountForm` took `userId` from `/users/doctor/info`, whose `id` is a public encoded ID, not the user UUID; when that request resolved first the schedule fetch 403'd and the form silently kept its defaults with *Save* enabled. (2) SOLO practices are created with the doctor as `DOCTOR` (no owner), but `updatePractice` required `PRACTICE_OWNER` / `PRACTICE_ADMIN`.
- **Corrective action:** (1) Use `membership.userId` (from `/practices/mine`); if the schedule fails to load show the error and disable *Save* (also blocked while loading). (2) New `PracticeService.assertProfileEditor`: owner / admin, or the **only active member** (role DOCTOR) of a **SOLO** practice; used by `updatePractice` only (`assertAdmin` unchanged for doctor / patient management).
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** Reloaded Settings repeatedly → schedules requested with the UUID (200) and real hours shown (10:00–14:00, 20 min). dr.solo saved advance ₹200 → DB 200 → reload shows 200 → cleared → DB `null`; schedule rows still Mon / Wed / Fri 10:00–14:00 / 20 min. Frontend + backend tsc clean.

### CR-20260928-12
- **Date opened:** 2026-09-28
- **Severity:** 3
- **Process:** P-BOOK / billing (WhatsApp + portals)
- **Description:** Requested: WhatsApp payment for an **advance booking amount**, plus **custom amount** requests sent by the doctor from the portal to the patient on WhatsApp (Razorpay), in all portals, and a **Payments** tab where the doctor sees payment status.
- **Evidence:** User request; only a consultation-fee prepay link per booking existed (CR-20260928-11).
- **Containment:** n/a.
- **Root cause:** No configurable advance amount, no way to request arbitrary amounts, no payment list.
- **Corrective action:** Additive migration `20260352000000_payment_requests` (`practices.advance_booking_amount`; `payment_requests` ledger with unique `link_id`, indexes, FKs; backfilled existing booking links) — applied to Supabase before backend deploy. `PaymentRequestService` (create custom link + WA `docline_payment_request`, resend, cancel, refresh, lazy expiry, list + summary, callback / webhook → `PAID` once + receipt `docline_payment_received`, booking fields synced only for matching prepay links). WA prepay uses the advance when set ("pay the advance booking amount (₹X)"), else the fee. Routes `/procto/payments/practice/:id`, `/requests`, `/requests/:id[/resend|/cancel]`; socket `payment_updated`. Settings: *Advance booking amount* in clinic + doctor forms. Web: `/doctor/payments` + `/clinic/payments` (sidebar + portal links), `PaymentRequestModal`, *Request payment* in the visit Payment status dialog. Provider app: **More → Payments** (list, status chips, request form, share / refresh / resend / cancel). Risk R19 added.
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** 170/170 procto tests (new: advance vs fee offer, custom amount parse, link expiry clamp, phone normalisation, kind labels). Orchestrator smoke on a temp conversation + non-existent booking: re-prompt reads "pay the advance booking amount (₹300)", *No* → pay at clinic → document offer (conversation deleted). Browser (dr.solo): Payments page loads (summary, tabs, range, search), sidebar + portal link present, request modal validation ("Enter the amount…") and patient suggestions work — **no request sent** (live Razorpay key + real patients). Settings round-trip (see CR-20260928-13). Backend tsc + build, frontend tsc + build, provider tsc clean. **Open:** `docline_payment_request` / `docline_payment_received` need Meta approval per WABA for delivery outside the 24 h window; production Razorpay webhook needs `payment_link` events + `RAZORPAY_WEBHOOK_SECRET`.

### CR-20260928-11
- **Date opened:** 2026-09-28
- **Severity:** 3
- **Process:** P-BOOK / billing (WhatsApp booking)
- **Description:** Requested: on WhatsApp, ask the patient whether they want to **pay before the appointment**; *Yes* → send a Razorpay link for the consultation fee. Add a **Payment status** button on the appointment page.
- **Evidence:** User request; bookings had no payment fields and WA fee collection was deferred in `decisions.md`.
- **Containment:** n/a.
- **Root cause:** No per-appointment payment capability.
- **Corrective action:** Additive migration `20260351000000_booking_payment` (`payment_status`, `payment_amount`, `payment_link_id` (+ index), `payment_link_url`, `payment_id`, `paid_at`; applied to Supabase before backend deploy). `lib/razorpay.ts` Payment Links create / fetch / callback-signature verify. `BookingPaymentService` (create / reuse link, decline, apply state, refresh, callback, webhook). WA step `awaiting_pay_offer` after booking confirmation (skipped with no fee or no Razorpay keys) → then the existing document offer. `GET /procto/payments/razorpay/callback` (HTML result page), `payment_link.*` in the Razorpay webhook, `GET /procto/bookings/:id/payment[?refresh=1]`. Socket + list carry payment fields. UI: `PaymentStatusButton` pill + dialog in the Appointments table (desktop + mobile) and visit header. Risk R18 added.
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** New `bookingPayment.test.ts` (amount, expiry clamp, status mapping, staff view, signature accept / reject) — 162/162 pass. Razorpay test-mode link created, fetched and cancelled via the API (request shape confirmed). Forged callback signature → 400, no booking change. Orchestrator smoke on a temp conversation with a non-existent booking ID: unclear reply re-prompts Yes/No; *No* → "pay at the clinic" → document offer; *Yes* with link failure → graceful fallback → document offer (conversation deleted; no real booking touched). Browser (dr.solo): Appointments *Payment* column shows *Not requested*; dialog shows ₹700 clinic fee + Refresh; visit header pill present. Backend + frontend tsc + builds clean. **Open:** production webhook needs `payment_link` events enabled in the Razorpay dashboard + `RAZORPAY_WEBHOOK_SECRET` (callback + Refresh work without it); production key mode (test / live) unverified.

### CR-20260928-10
- **Date opened:** 2026-09-28
- **Severity:** 3
- **Process:** P-BOOK (queue / visit)
- **Description:** Requested: patient **Arrival time** in the appointment tables and on the visit (inner) page. No arrival timestamp existed — only status.
- **Evidence:** User request; `PracticeBooking` had no arrival field.
- **Containment:** n/a.
- **Root cause:** Status changes were not time-stamped.
- **Corrective action:** Additive migration `20260350000000_booking_arrived_at` (`arrived_at TIMESTAMPTZ NULL`, applied to Supabase before backend deploy). `arrivalPatch` stamps on first move to WAITING / IN_PROGRESS / COMPLETED in `updateStatus` and `updateVisit`, clears on revert to SCHEDULED / REQUESTED / ACCEPTED or NO_SHOW; walk-ins stamped at creation. `listForPractice` selects it; socket `arrived_at`; `patchBookingFields` merges it; lists patch it from the status response. UI: *Arrival* column (Appointments + Queue), mobile "Arrived:" line, visit header *Arrival …*.
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** 5 new `arrivalPatch` unit tests (152/152 pass). Column present in DB (`information_schema`); local API list returns `arrivedAt` on all 7 rows. Browser (dr.solo): Appointments headers "When · Arrival · Chief complaint", Queue headers "Appointment · Arrival · Name", visit header "Arrival not yet" (Accepted) / "Arrival —" (Finished, pre-change). No real booking status changed for the test. Backend + frontend tsc clean.

### CR-20260928-09
- **Date opened:** 2026-09-28
- **Severity:** 3
- **Process:** P-BOOK (clinic-side manual booking)
- **Description:** No way to add a patient who walks in with an emergency — the Appointments page had no manual-booking button in the doctor portal, and the clinic modal requires a free slot. Requested: button on the Appointments page; no time-slot question, just an emergency walk-in.
- **Evidence:** User request; `DoctorAppointmentsList` rendered *Book appointment* only for `portal="clinic"`; `ClinicBookAppointmentModal` blocks without an open slot.
- **Containment:** n/a.
- **Root cause:** Only slot/token-based booking existed; no desk-emergency path.
- **Corrective action:** New `BookingService.createWalkIn` + `POST /procto/bookings/walk-in` (`booking:update`, active membership, DOCTOR only for self, quota enforced) → booking at now in `WAITING`, `consultationType = EMERGENCY_WALK_IN`, no patient template. Appointments page (both portals): red **Emergency walk-in** button + modal (doctor, name, mobile, optional chief complaint) and **Book appointment** for everyone; after adding, list jumps to Today. Red *Walk-in* badge in Appointments / Queue / visit page; `consultationTypeLabel` shows "Emergency walk-in" instead of the raw code (web, provider app, patient app). Risk R17 added.
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** API (local :3002, dr.solo): bad phone → 400, blank name → 400, foreign practice → 403, doctor → other provider → 403 "only to their own list", no auth → 401 (no booking created). Browser: header shows *Emergency walk-in* + *Book appointment*; modal has no slot picker, fixed doctor for solo, empty submit → "Enter the patient name." Backend tests 147/147; backend, frontend, provider, patient-app tsc clean.

### CR-20260928-08
- **Date opened:** 2026-09-28
- **Severity:** 3
- **Process:** P-BOOK (visit page documents); P-AUTH (patient record access)
- **Description:** Doctors could not find a patient's *General* documents from the appointment page — only visit files were shown; general files were only behind the Patients-tab paperclip. Requested: *General* and *Appointment* document options on the visit page.
- **Evidence:** User report; visit page rendered `booking.documents` only.
- **Containment:** n/a.
- **Root cause:** No API exposed `Patient.documents` per booking for the visit page.
- **Corrective action:** Visit page Documents → tabs *Appointment (n)* / *General (n)*; General lists + uploads to `Patient.documents` via new `GET/POST /procto/bookings/:id/general-documents`. Access: view requires `assertCanViewBooking`; add requires active membership and own visit unless owner/admin. Patient resolved from `booking.patientId` or a single phone match only (no guessing on shared numbers). Finish still only from the visit page (list controls stop at *Appointment started*).
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** Browser (dr.solo): Roopa visit → Appointment (1) / General (0) "No general documents yet"; Satheesh visit → Appointment (3) / General (1) lists WhatsApp general doc "Logo myplex.png" with date. Backend + frontend + provider tsc.
- **Status:** Verified (local)
- **Docs updated:** `documentation/flow.md`

### CR-20260928-07
- **Date opened:** 2026-09-28
- **Severity:** 3
- **Process:** P-BOOK (WhatsApp Branch F — attach document)
- **Description:** Clinic could not find the *Select Appointment / General Document* choice: it only appeared after a file was uploaded, never after post-booking *Yes* (auto-attached to the new visit) and never with no upcoming visits. Requested: ask the choice before asking for the document.
- **Evidence:** User report; code path `startReportAttachFlow` → `awaiting_document_upload`; post-booking Yes set `lastBookingId` → `attach_preferred`.
- **Containment:** n/a (behaviour change).
- **Root cause:** Upload-first design of Branch F.
- **Corrective action:** Menu → Attach and post-booking *Yes* now go to `awaiting_document_link` with no file: buttons first. *General* → (shared number) patient pick → `docTarget: "general"` + `docPatientUserId` → upload saved to that record only (`receiveWhatsAppBranchFDocument({ general })` skips visit lookup; patient id re-validated). *Select Appointment* → visit (list if 2+) → upload prompt names the visit. *No* before upload cancels.
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** Smoke on temp conversation (no uploads): attach → buttons; General → picker → "saved to *Rathul Satheesh*'s record"; reminder keeps General prompt; No → cancelled + state cleared; Select Appointment → visit prompt with label; post-booking Yes → buttons. Backend tsc; 147/147 procto tests.
- **Status:** Verified (local)
- **Docs updated:** `documentation/flow.md`, `documentation/decisions.md`

### CR-20260928-06
- **Date opened:** 2026-09-28
- **Severity:** 2 (includes a booking-safety defect found during the change)
- **Process:** P-BOOK (WhatsApp booking flow; Queue / Appointments UI)
- **Description:** (a) Ask *"Add chief complaint? Yes / No"* before collecting it; (b) show the chief complaint in its own column on the Queue and Appointments tables and on the visit page. **Defect found in testing:** a stale `complaint:yes` button tap arriving at `awaiting_confirm` was classified by NLU as `confirm_yes` and called `confirmBooking` — a booking could be created without the patient pressing *Confirm*.
- **Evidence:** Local smoke (`runOrchestrator`, temp conversation, date with no schedule) returned "no schedule configured" from `confirmBooking` after a `complaint:yes` tap; no booking created (count 7 → 7).
- **Containment:** Not deployed; found before release.
- **Root cause:** `awaiting_confirm` fell through to NLU for any non-`confirm:*` payload; affirmative button IDs mapped to `confirm_yes`.
- **Corrective action:** New step `awaiting_chief_complaint_opt` (Yes / No buttons; direct 2+ word complaint accepted; vague replies re-asked). At `awaiting_confirm`, any interactive payload that is not `confirm:*` re-shows the Confirm card and never books. Shared `chiefComplaintOf` + `ChiefComplaintCell`; "Chief complaint" column after *Name* (Queue) and after *When* (Appointments); line on mobile cards.
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** Smoke: Yes → complaint prompt → saved; No → summary without complaint; direct complaint at opt step → saved; stale `complaint:no` at confirm → Confirm card re-shown, no booking (7 → 7). Browser (dr.solo, 1440 px): Queue headers `… Name | Chief complaint | MRN …`, Appointments `… When | Chief complaint | Status …`. Backend tsc, frontend tsc, 145/145 procto tests.
- **Status:** Verified (local)
- **Docs updated:** `documentation/flow.md` (book flow + chief complaint paragraph)

### NC-20260928-05
- **Date opened:** 2026-09-28
- **Severity:** 2
- **Process:** P-BOOK (Appointments page ← WhatsApp bookings)
- **Description:** WhatsApp bot bookings "not showing" on the Appointments page. Page defaults to *Today* (range fetched from backend); a WA booking for a later date (Roopa Satheesh, booked 00:12 IST for 30 Sep) was invisible with no hint, and a booking made while the page was open never appeared (no refetch on socket events).
- **Evidence:** DB has the booking (`WHATSAPP_AI`, ACCEPTED); `listForPractice` returns it for 28 Sep–4 Oct but not for today-only; production commit `27bfbde` has no refetch on `bookingTick`.
- **Containment:** Use *This week* / *Custom* filter until deploy.
- **Root cause:** Range-only fetch (introduced with date filters) dropped the live-update path and gave no signal that future bookings exist outside *Today*.
- **Corrective action:** Refetch the selected range on `booking_created/updated` socket ticks (debounced), on tab focus, and every 60 s when the socket is down; *Upcoming* preset (today → +90 days); on *Today*, "N more upcoming appointment(s) after today · View upcoming".
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** Browser (dr.solo): Today → Rathul 10:40 + "1 more upcoming… View upcoming"; Upcoming → Rathul + Roopa (30 Sep); This week → both. Backend `listForPractice` checked with TZ=UTC (Railway) for today/week/month. Frontend tsc.
- **Status:** Verified (local)
- **Docs updated:** capa-log

### CR-20260928-04 (change request — booking flow)
- **Date opened:** 2026-09-28
- **Process:** P-BOOK (WhatsApp booking)
- **Change:** Ask the patient's chief complaint (typed or voice note, *Skip* allowed) after slot/token selection and before the booking summary; save to `practice_bookings.disease`; show on doctor queue + visit page.
- **Risk review:** No clinical advice sent (collects patient words only); complaint text bypasses NLU; outbound-guard trigger words are not echoed ("Noted ✓") so the summary is never replaced; bare "ok/yes" re-asked. Tenant/booking engine unchanged (single `BookingService.createBooking`).
- **Verification:** DB smoke on temp conversation (slot tap → prompt + Skip; "ok" → re-ask; voice transcript → summary line; "need diagnosis…" → "Noted ✓"; Skip → no line; bookings 7 → 7, temp conv deleted); `whatsapp.chiefComplaint.test.ts`; tsc backend + frontend; 144/144 procto tests.
- **Status:** Verified (local; not deployed)
- **Docs updated:** flow.md, capa-log

### NC-20260928-03
- **Date opened:** 2026-09-28
- **Severity:** 3
- **Process:** P-BOOK (WhatsApp booking confirmation → attach document)
- **Description:** After booking, the Yes/No "attach document" card showed only "Tap *Yes* or *No* below." — the question ("Would you like to send a report or document to your doctor?") was missing; the .ics file arrived after the card, burying it.
- **Evidence:** Patient report 2026-09-28; `processInbound` long-confirm path built the button body from `reply.split("\n\n").slice(-1)`, and `askAttachDocument` is two paragraphs.
- **Containment:** N/A (full text was in the preceding message; Yes/No still worked).
- **Root cause:** Card body derived by guessing the last paragraph of a combined reply instead of an explicit prompt.
- **Corrective action:** `OrchestratorResult.buttonPrompt` carries the attach question; `splitReplyForButtonCard` sends confirmation (without the question) → .ics → card with the full question + Yes / No / Main Menu. `.ics` sent once via `sendIcsOnce`.
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** `whatsapp.confirmCard.test.ts` (EN + HI full question on card, fallback); tsc; 140/140 procto tests.
- **Status:** Verified
- **Docs updated:** capa-log

### NC-20260928-02
- **Date opened:** 2026-09-28
- **Severity:** 3
- **Process:** P-BOOK (Practice Patients roster)
- **Description:** Patients tab listed only people with a booking; patients who registered (WhatsApp self/family, or with the practice MRN prefix) but had not booked yet were invisible to the clinic.
- **Evidence:** `PracticeService.listPatients` built rows only from `practiceBooking`; profile "123" (MR00000004, registered via WhatsApp 2026-09-25, no bookings) missing on both practices whose lines it messaged.
- **Containment:** N/A (data intact; list-only gap).
- **Root cause:** Roster derived from bookings; there is no patient→practice link other than practice MRN prefix and WhatsApp conversation phone.
- **Corrective action:** `listRegisteredWithoutBookings` adds profiles whose MRN starts with `{practice.mrnPrefix}MR` or whose phone/contact number matches a WhatsApp conversation on this practice (last 10 digits), deduped against booked rows by patientId and phone+name. Shown to clinic owners/admins and solo doctors; clinic staff doctors keep booking-scoped lists. UI shows a "Registered" badge, 0 visits, and registration date.
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** DB run: Dr. Priya Nair Clinic (solo) 6 rows incl. "123" (0 visits); Dr. Ananya Sharma Clinic owner 3 rows incl. "123", staff doctor 0 registered-only rows; no duplicates for booked profiles. Browser check as dr.solo: "Registered" badge + Phone/Registered details. tsc (backend + frontend), 137/137 procto tests.
- **Status:** Verified
- **Docs updated:** capa-log

### NC-20260928-01
- **Date opened:** 2026-09-28
- **Severity:** 3
- **Process:** P-SUP (WhatsApp idle reminder / resume)
- **Description:** Idle nudge "It looks like you stepped away… Tap Continue" gave no context; tapping Continue replied "Reply below to continue" without repeating the pending question or its buttons (family DOB/ID, gender, relationship, Self/Family, pickers).
- **Evidence:** Patient screenshot 2026-09-27 22:33 (UAE); local repro on conv state `awaiting_register_family_details` → generic hint, no buttons.
- **Containment:** N/A (state was preserved; patient could still type the answer).
- **Root cause:** `repromptHintForStep` covered only a few steps and returned text only; Continue attached buttons for one step (`awaiting_nlu_book_confirm`).
- **Corrective action:** `continueFlowPrompt` re-sends each step's original prompt with its buttons/list from saved state (read-only). Reminder names the activity ("…while *adding Roopa Satheesh to your family*").
- **Owner / due:** Engineering / 2026-09-28
- **Verification:** Repro: Continue on family DOB/ID, gender, relationship, book-whom, date → correct prompt + buttons, state unchanged; 137/137 procto tests (3 new).
- **Status:** Verified
- **Docs updated:** capa-log

### NC-20260927-05
- **Date opened:** 2026-09-27
- **Severity:** 2
- **Process:** P-BOOK (WhatsApp family registration)
- **Description:** Registering a second family member without their own mobile failed at the last step with "You're already registered as Rathul Satheesh… Reply BOOK" and looped back to the DOB/ID prompt.
- **Evidence:** Patient screenshot 2026-09-27 22:17; conv `10bfa009` stuck at `awaiting_register_family_details` with Roopa Satheesh / Spouse / 1979-12-20 / female. Old `syntheticDependentPhone("971507801104", any)` = `815078011041` = Rathul's login phone.
- **Containment:** Collected details kept in state; patient can resend DOB + ID after deploy to finish.
- **Root cause:** Placeholder dependent phone was `8 + last10(primary) + first digit of Date.now()` — deterministic per WhatsApp number, so every dependent after the first collided on `findByPhone` (409 self-registration message).
- **Corrective action:** `allocateDependentPhone` — `8 + last4 + 10 random digits`, checked unique on last-10 against user phone and patient contactNumber (6 attempts). Family save 409 now shows a family-specific message instead of the self-registration text.
- **Owner / due:** Engineering / 2026-09-27
- **Verification:** 10 allocations for 971507801104 → 10 distinct 15-digit numbers, none equal Rathul's, 0 `findByPhone` hits; backend `tsc` OK. Live WA confirmation pending deploy.
- **Status:** Verified
- **Docs updated:** capa-log

### NC-20260927-04
- **Date opened:** 2026-09-27
- **Severity:** 2
- **Process:** P-NOTIFY / WhatsApp provisioning
- **Description:** Clinic line +91 99900 52082 stored with the Meta phone id of the +1 555 test number; outbound notifications failing (131037 display name, #100 invalid parameter).
- **Evidence:** Graph: +91 99900 52082 = `1378039178715653`, +1 555-498-8759 = `1288187721051113`, both `name_status: DECLINED`. `whatsapp_numbers` row for 9990052082 held `1288187721051113` (last written at boot 2026-09-26 18:12 UTC; unchanged by 2026-09-27 deploys ⇒ Railway env pins the test id). Webhook chain verified OK (verify handshake, signed POST, probe conversation written to prod DB).
- **Containment:** Row corrected to `1378039178715653` (approved).
- **Root cause:** Railway `WHATSAPP_PHONE_NUMBER_ID` / `GLUCOGUIDE_OTP_PHONE_NUMBER_ID` set to the test number id; `pinPlatformMetaPhoneId` re-applies it on every boot. Display name "Docter Point" declined by Meta.
- **Corrective action:** Set Railway env ids to `1378039178715653`; resubmit a compliant display name in WhatsApp Manager; clinic alerts must not target the clinic's own bot number (#100).
- **Owner / due:** Ops (Railway env, Meta display name) + Engineering / 2026-09-28
- **Verification:** Pending — after redeploy, row keeps `1378…`; notifications SENT.
- **Status:** Open
- **Docs updated:** —

### NC-20260927-03
- **Date opened:** 2026-09-27
- **Severity:** 2
- **Process:** P-NOTIFY / WhatsApp Branch F (document attach)
- **Description:** *General Document* on a shared number saved the file to an arbitrary profile (Self or first linked) without asking which patient.
- **Evidence:** `attachWhatsAppPatientDocument` used `linked.find(isSelf) ?? linked[0]`; clinic notification anchored to the latest booking on the phone (any family member).
- **Containment:** Picker before save when >1 profile is linked.
- **Root cause:** Branch F assumed one patient per WhatsApp number.
- **Corrective action:** New step `awaiting_document_patient` (pending file kept, pick by tap / number / name, cancel discards); `patientUserId` validated against `listLinkedToWhatsApp` before write; clinic anchor = chosen patient's booking (phone fallback only when single profile); confirmation names the patient.
- **Owner / due:** Engineering / 2026-09-27
- **Verification:** `yarn build`; WA smoke on 971507801104 → picker "Self · Satheesh / Rathul Satheesh · Child", invalid reply re-asks, pending file retained; foreign `patientUserId` rejected without write.
- **Status:** Closed 2026-09-27
- **Docs updated:** qms/risk-register.md (R16), decisions.md

### NC-20260927-02
- **Date opened:** 2026-09-27
- **Severity:** 3
- **Process:** P-BOOK / WhatsApp View–Manage booking
- **Description:** WhatsApp *View / Manage booking* listed a 25 Sep appointment (already elapsed, status still ACCEPTED) for reschedule / cancel.
- **Evidence:** Booking `c98b2009…` slotStart 2026-09-25 11:40 IST, status ACCEPTED, shown on 2026-09-27.
- **Containment:** Manage list filters out elapsed visits at query time.
- **Root cause:** `listUpcomingBookingsUncached` filtered by status only (no time check); `cancelByPatient` / `reschedule` had no elapsed guard. The list also read the oldest 50 bookings first, so heavy histories could hide real upcoming ones.
- **Corrective action:** `isBookingStillUpcoming` (slot not started / token day ≥ clinic today); `BookingService.listForPatient({ practiceId, statuses, upcomingOnly, take })` filters in SQL; patient cancel (except WAITING) and reschedule reject elapsed visits.
- **Owner / due:** Engineering / 2026-09-27
- **Recurrence (same day):** *Message doctor* list had its own status-only filter and still showed `c98b2009…`. Now: upcoming (not elapsed) + IN_PROGRESS/COMPLETED updated in last 30 days, filtered in SQL via `listForPatient({ updatedSince })`.
- **Verification:** `yarn build`; WA smoke on 971507801104 → only 28 Sep visit listed; reschedule of `c98b2009…` rejected; guard true for today/tomorrow token day, false for yesterday. Message doctor → 28 Sep (Rathul) + 23 Sep completed (Satheesh) only.
- **Status:** Closed 2026-09-27
- **Docs updated:** qms/risk-register.md (R15)

### NC-20260927-01
- **Date opened:** 2026-09-27
- **Severity:** 2
- **Process:** P-AUTH / WhatsApp booking identity
- **Description:** WhatsApp "Hi" / Book showed a family dependent (Rathul · Child) as *Self* instead of the account owner (Satheesh).
- **Evidence:** Dependent row created with synthetic phone (`wa8…` placeholder email) later had `user.phone` rewritten to the owner's WA MSISDN; `listLinkedToWhatsApp` marked every phone match as self and sorted by name.
- **Containment:** Self detection now excludes dependents; OTP login picks the owner.
- **Root cause:** `verifyOtp` used unordered `findFirst` over `phone OR patient.contactNumber` (dependents share contactNumber), logged in as the dependent and overwrote its phone. Self = "phone matches" with no dependent guard.
- **Corrective action:** `pickPrimaryPatientUser` (no `patient.relationship`, real email first, oldest) used by `findByPhone`, `listLinkedToWhatsApp` (exactly one self) and `phoneOtpAuth.verifyOtp`.
- **Owner / due:** Engineering / 2026-09-27
- **Verification:** `yarn build`; live read-only check on 971507801104 → self = Satheesh, Rathul = family. Data repair (approved): Rathul `user.phone` restored to `815078011041`, name → "Rathul Satheesh".
- **Status:** Closed 2026-09-27
- **Docs updated:** qms/risk-register.md (R14)

### NC-20260912-01
- **Date opened:** 2026-09-12
- **Severity:** 2
- **Process:** P-NOTIFY / WhatsApp multi-tenant
- **Description:** Multiple WhatsApp numbers appeared under / routed as the same clinic.
- **Evidence:** Boot `ensureWhatsAppInfrastructure` + `assignToPractice` stamped shared `WHATSAPP_PHONE_NUMBER_ID` onto every LIVE/assigned row; webhook `findPracticeByWhatsAppTo` used `findFirst` on that Meta id.
- **Containment:** Prefer phoneNumber routing; refuse ambiguous Meta ids; clear duplicate Meta ids on boot (keep oldest).
- **Root cause:** Platform env Meta phone id treated as shared identity for all clinics.
- **Corrective action:** Remove env backfill; assign keeps only row-owned Meta id; pool add rejects duplicate Meta ids; admin UI assigns only clinics without a line and captures Meta Phone Number ID.
- **Owner / due:** Engineering / 2026-09-12
- **Verification:** Restart API; each LIVE row has unique/non-shared Meta id or null; inbound `to` phone resolves correct practice.
- **Status:** Open
- **Docs updated:** Whatsapp-Meta-Rules.md (routing note if needed)

### NC-20260911-01
- **Date opened:** 2026-09-11
- **Severity:** 2
- **Process:** P-NOTIFY
- **Description:** WhatsApp notification_events stayed PENDING (54+); message_templates empty; bot treated "hi" as Hindi; LIVE pool missing wabaPhoneNumberId.
- **Evidence:** DB groupBy PENDING; Redis bull wait length 62; webhook/test reply in Hindi for "hi"; templates count 0.
- **Containment:** Drain via in-process worker on API boot.
- **Root cause:** Notification worker not started with `yarn dev`; seed never synced Meta UTILITY catalog; `parseLanguageChoice` matched bare `hi`.
- **Corrective action:** Inline worker in `index.ts`; `ensureWhatsAppInfrastructure` seeds templates (phone-id backfill later removed in NC-20260912-01); seed sync; language parser fix; Meta #131037 → SKIPPED; remove enqueue race timeout.
- **Owner / due:** Engineering / 2026-09-11
- **Verification:** templates=10; "hi" → language menu; worker logs re-queue; verify_token OK.
- **Status:** Verified
- **Docs updated:** decisions.md

### NC-20260910-01
- **Date opened:** 2026-09-10
- **Severity:** 2
- **Process:** P-BOOK
- **Description:** Using top-level `id` from `GET /procto/practices/mine` as practiceId caused `403 not a member of this practice` because `id` was the membership UUID.
- **Evidence:** Page QA / e2e scripts; doctor queue fetch with `mine[0].id` before normalize.
- **Containment:** Frontend already preferred `membership.practice.id` in most UI paths.
- **Root cause:** API returned membership row shape without remapping; scripts assumed `id === practiceId`.
- **Corrective action:** `getForUser` sets `id`/`practiceId` to practice UUID and exposes `membershipId`; FE `resolvePracticeId`; Cursor rule `practice-membership-id.mdc`; calendar validates UUIDs → 400.
- **Owner / due:** Engineering / 2026-09-10
- **Verification:** Queue with normalized `id` → 200; membershipId → 403; bad calendar providerId → 400.
- **Status:** Verified
- **Docs updated:** decisions.md; `.cursor/rules/practice-membership-id.mdc`

### NC-20260827-01
- **Date opened:** 2026-08-27
- **Severity:** 2
- **Process:** P-AUTH
- **Description:** Admin login with `role: "admin"` failed because `normalizeAuthRole` only mapped doctor vs user.
- **Evidence:** `yarn qa` `auth.admin.login` failed; curl with role=admin returned 403 wrong-portal hint.
- **Containment:** Login without role still worked for admin email.
- **Root cause:** Auth role normalizer omitted `admin`.
- **Corrective action:** Accept `admin` in `normalizeAuthRole` and improve mismatch hints (`backend/src/services/auth.ts`).
- **Owner / due:** Engineering / 2026-08-27
- **Verification:** `yarn qa` 55/55; curl admin login with role returns token.
- **Status:** Closed
- **Docs updated:** `documentation/qms/records/qa-findings.md`

### NC-20260826-01 (bootstrap)
- **Date opened:** 2026-08-26
- **Severity:** 3
- **Process:** P-REL
- **Description:** QMS documentation and enforcement rules were missing; quality controls were informal.
- **Evidence:** No `documentation/ISO-9000.md` / `documentation/qms` prior to this date.
- **Containment:** N/A (documentation gap).
- **Root cause:** Project prioritized feature delivery without a written QMS.
- **Corrective action:** Added `documentation/ISO-9000.md`, `documentation/qms/*`, and `.cursor/rules/iso9000-qms.mdc`.
- **Owner / due:** Engineering / 2026-08-26
- **Verification:** Files present; release checklist referenced from decisions.md.
- **Status:** Closed
- **Docs updated:** documentation/ISO-9000.md, documentation/qms/*, iso9000-qms.mdc, decisions.md
