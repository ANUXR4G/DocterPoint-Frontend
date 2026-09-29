# decisions.md — GlucoGuide

Architecture and product decisions that the codebase currently follows. Prefer updating this file when a decision changes.

## Product surface

| Decision | Choice | Why |
|----------|--------|-----|
| Canonical product | **GlucoGuide only** (`frontend/` + `backend/` on `:3000` / `:3001`) | Single product for patients, clinics, and doctors |
| Parallel DocLine monorepo (`apps/api`, `apps/web`) | **Removed** | Was a mistaken dual stack from an old build prompt; do not revive |
| Patient mobile | Expo `apps/mobile` → `:3001` | Patient book + visits |
| Doctor mobile | Expo `apps/provider` → `:3001` (branded GlucoGuide Doctor) | Queue, calendar, patients, visit notes/CareChat, **practice subscription/billing**, analytics; same Doctor Login as web |

## Auth (web)

| Decision | Choice | Why |
|----------|--------|-----|
| Primary patient login | **Phone + WhatsApp OTP only** (`+91 99900 52082`) | App + patient dashboard; no email/password on patient login |
| Primary doctor/clinic/admin login | **Email + password** | Provider portals unchanged |
| Password transport | AES-GCM encrypt on client when possible; backend accepts plaintext fallback | Browser crypto failures must not block login |
| Session | JWT in cookies (`access_token`, `refresh_token`) via Next proxy → Express | Same-origin API under `/api/v1` |
| Role portals | Separate `/login/patient` and `/login/doctor` | Prevents wrong-role login; middleware enforces scopes |
| Google OAuth | Patients only | Doctor accounts are email/password + practice onboarding |
| Mobile auth | Phone OTP only against `backend/` `:3001` | `POST /auth/otp/request` + `/auth/otp/verify`; GlucoGuide platform WA only |

## Domain model

| Decision | Choice | Why |
|----------|--------|-----|
| Practice booking | `Practice` + `PracticeBooking` + schedules/overrides (Procto) | Clinic token/slot booking separate from legacy hospital appointments |
| Legacy appointments | Still present (`Appointment`, doctor dashboards) | Older GlucoGuide hospital flow coexists with practice bookings |
| Multi-doctor clinic | `PracticeMember` roles (`PRACTICE_OWNER`, `DOCTOR`, …) | City Care–style multi-provider clinics |
| Tenant isolation | Practice membership + auth scopes; **clinic staff (`DOCTOR`) scoped to own `providerId`** on bookings/patients/analytics (owners/admins see clinic-wide) | Doctors only manage their own roster; clinic portal sees all |
| `/practices/mine` shape | Top-level `id` = **practice UUID**; `membershipId` = membership PK | Prevents booking/billing 403 when clients use `row.id` as practiceId |

## Booking & realtime

| Decision | Choice | Why |
|----------|--------|-----|
| Slot engine | Server-side availability from `ProviderSchedule` + overrides | Single source of truth for open slots/tokens |
| Calendar quick slots | Drag / click / *+ Slot* on the Day-view doctor columns creates an **`EXTRA_SLOT` override** (date + window) — no second slot model; reception / admins for any doctor, a doctor for themselves; server rejects overlap with hours, extra windows, blocks, leave days and past time; adding availability sends no patient message; undo deletes the window only while nothing is booked in it. Override / token `DATE` columns are compared by their stored UTC date key (written from clinic midnight) | Receptionists extend a doctor's day without leaving the calendar, through the same slot engine as every booking channel |
| Quick-add: repeat, slot length, capacity | *Extend schedule* materialises one `EXTRA_SLOT` row per chosen day (shared `series_id`, max one year / 120 days) instead of editing the weekly schedule; each day is checked against the version in force that day and unfit days are skipped with a reason (server dry-run preview). Extra windows may carry their own `slot_interval_min` and `capacity`; booking uses the engine slot's capacity, so only extra windows can be shared queue slots — regular hours stay one patient per slot | Reuses the proven per-day override path (undo per day or per series, booked days protected) and keeps permanent hour changes behind Settings' effective-date and conflict safeguards |
| Quick-add: MANAGE_SLOTS_INLINE + confirm-on-conflict | `MANAGE_SLOTS_INLINE` is a practice permission computed from the membership role (owner / admin / receptionist → any doctor, doctor → own calendar), enforced on preview, save and remove and exposed via `GET …/permissions` for the UI. Break, blocked time, leave and off-duty weekdays are **warnings**: a save without `confirm: true` returns 200 `needsConfirmation` and writes nothing; hard conflicts (regular hours, existing extra slots, token mode, past) stay errors | Token scopes are identical for every clinic member, so the role is the only reliable source; a role map keeps one place to change when per-member toggles arrive. A 200 "ask first" answer keeps the check atomic on the server (same advisory lock as the save) without a second validation engine, and overlapping regular hours stays refused so extra windows never duplicate base slots |
| Audit trail: practice_audit_events | One append-only table per practice (actor id + name + role snapshot, action, entity, doctor, human summary, JSON meta) written from the existing services (extra slots, leave / blocks, walk-ins, desk registrations) via `recordAudit`, which never throws; `schedule_overrides.created_by` feeds the calendar's *Added by* line; read access is the role-derived `VIEW_AUDIT_LOG` permission (owner / admin all, doctor own, reception none) | Admin reporting needs who / what / when in plain words without joining live rows that may since be deleted; a snapshot of name and role keeps history correct after staff changes, and never failing the staff action keeps booking paths unaffected by an audit-write fault |
| Walk-in needs a Patient ID | Emergency walk-ins must reference a registered patient (`patientId` + matching phone); the desk searches known patients (name / partial) or any patient by full mobile / exact MRN, and registers missing ones in place (name, mobile, gender, DOB; family members as dependants) through `PatientService.registerViaWhatsApp` with `source: clinic_desk` | Walk-ins without an MRN left visits unlinked to any record; reusing the one registration path keeps MRN allocation and dependant handling identical to WhatsApp, and limiting fuzzy search to the clinic's own patients avoids cross-clinic browsing while full-number lookup still prevents duplicates |
| Schedule edits | **Effective-dated versions** (`provider_schedules.effective_from`); a day uses the latest version starting on/before it; saving never rewrites earlier days; preview lists booked visits the new hours would drop, with a coded reason (day off / outside hours / in break / off-grid / mode / capacity) and a safe start date; a version that clashes with bookings is saved **Pending verification** (ignored by the slot engine) until the clinic activates it from a safe date, activates anyway, or discards it; bookings are never auto-moved or cancelled. An explicit **resolution step** (reception / admin / own doctor) reschedules to auto-matched slots, reassigns to a doctor free at the same time, cancels with a reason, or keeps the visit as an *Override slot* (booking flag, not a schedule override) — always dry-run reviewed, then confirmed; all writes via `BookingService`. **Per-clinic notice period** (24 h / 48 h / 72 h / 7 days, default 48 h): a change cannot affect booked visits inside it — the start date moves past them instead (no bypass; overrides cover emergencies). Patient alerts from resolution are **held** in `schedule_change_alerts` and sent once, with the final outcome, when all clashes are resolved / the version is activated or discarded / staff press *Send now* / the worker sweep finds them due; WhatsApp + email only (no SMS provider) | Changing hours must not corrupt appointments already booked under the old schedule |
| Booking identity | `patientPhone` required; optional `patientId` when logged in | Guest book + logged-in book both work |
| Patient problem at book | Required `disease` text; AI visit brief → `notes` + seeds `doctorRemarks` | Doctor sees problem + AI explanation in Remarks; not a diagnosis |
| Accept before visit | Bookings are **auto-accepted** (`ACCEPTED`) on create/reschedule — no manual Accept | Front desk starts at Arrived → Started → Finished |
| Doctor analytics | Live Procto booking series only — no sample/demo chart fallbacks | Empty period shows “No data”; Clinic plan required for charts |
| Live queue | Native `ws` `/api/v1/ws/procto/:practiceId` (JWT + practice membership) | Doctor/clinic queue + calendar without polling |
| Dashboard load | `GET /procto/practices/mine/bootstrap` + JWT claims auth (no DB) | Avoid mine→bookings waterfall; re-login refreshes enriched JWT |
| Patient visits live | Native `ws` `/api/v1/ws/patient` (JWT) | Patient web + Expo visit status |
| Admin ops live | Native `ws` `/api/v1/ws/admin/ops` (platform admin JWT) | Replaces 20–30s support polling |
| Mira AI | **HTTP only** (`POST /assistant/chat`) | No WebSocket for Mira FAB/chat/LLM |
| Post-visit ratings | Clinic + doctor stars after `COMPLETED` | Zomato-style; one review per booking |
| Notifications | Redis BullMQ + WhatsApp (Meta when env set, else simulate); **notification worker runs in-process with API** (`NOTIFICATION_WORKER_INLINE=0` to disable) | Booking HTTP must not fail if notify fails; PENDING rows were stuck when only `yarn dev` ran without `worker:notifications` |
| WhatsApp booking bot | DeepSeek/OpenAI NLU + regex fallback; multi-step orchestrator in `backend/`; **patients only**; voice notes = STT → free-form NLU (date+time in one utterance; clarify if unclear) | Patient register/book/status/cancel/reschedule via chat or voice; doctors/clinics use web portal; clinic alerts on confirm/cancel/reschedule/queue **and** waiting / no-show / completed / shared documents / schedule override |
| Language choice | `1`/`English` → en; `2`/`Hindi`/`hin` → hi; bare **`hi` is greeting, not Hindi** | Avoid mis-setting language on "hi" |
| Meta #131037 | Mark notification `SKIPPED` (display name not approved) | Do not leave infinite PENDING/FAILED retries when Meta blocks the number |

## UI / design

| Decision | Choice | Why |
|----------|--------|-----|
| Public chrome | Shared `SiteNavbar` + `PublicShell` | One nav language across home, practices, login |
| Marketing home | React Framer-style canvas — **no Impilo iframe/mirror** | Impilo assets and rewrites removed |
| Loaders | `thinking-orbs` via `ThinkingLoader` | Replaces CoolKid full-page loaders on public/loading routes |
| Theme | Light / dark / system toggle | `document.documentElement` `dark` class |

## Infra

| Decision | Choice | Why |
|----------|--------|-----|
| DB | Postgres `gluco_guide` | Canonical GlucoGuide database |
| Cache / queues | Redis on `:6379` | Required for cache + notification workers |
| API proxy | Next `app/api/v1/[...path]` → `BACKEND_URL` | Browser talks only to `:3000` |
| Seed | `cd backend && yarn seed` — **blocked on Supabase/non-local** unless `ALLOW_PROD_SEED=1` | Wipe destroys live Meta routing; demo seed is for local Postgres only |
| Platform Meta phone id | `WHATSAPP_PHONE_NUMBER_ID` pinned on boot to `GLUCOGUIDE_OTP_PHONE` (default `9990052082`) only | Seed must never put that Meta id on the clinic MOCK Tel (`9876543210`) |

## Explicit non-goals (current pass)

- Video consult, e-Rx, clinical LLM diagnosis, insurance
- Instant unlimited WhatsApp number minting (Meta requires real numbers + WABA ceilings)
- Interactive WhatsApp list/button messages (text menus first)
- Replacing admin Expo (ops stay on web `/admin`)
- Full schedule editor in provider Expo (use web `/doctor/practice`)
- A second public website or second API (`apps/api` / `apps/web` are gone)
- Replacing a medical center HIS (GlucoGuide is the online booking / WhatsApp layer only)

## WhatsApp-native booking — decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Product brand | **GlucoGuide** everywhere user-facing | DocLine was a working title / parallel scaffold; retired |
| WABA model | **Meta Cloud API + Embedded Signup** (one WABA per clinic at scale; pool for pilot ≤20) | DIY Meta only — no BSP (AiSensy/Gupshup/etc.); route by Phone Number ID |
| Provisioning | **MOCK** (local) or **META_CLOUD_API** via Embedded Signup | Self-serve Connect with Meta; templates auto-submitted; 24–72h Meta approval |
| Number pool | `whatsapp_numbers` table + `/api/v1/procto/admin/*` | Ops assigns AVAILABLE → LIVE; syncs **both** `practice.whatsappBusinessNumber` and `practice.phone` (Settings Tel = public WhatsApp bot number). Profile Tel is locked while a line is connected. |
| Registration Tel → bot | Platform WABA add + **in-app Meta OTP** (`request_code` / `verify_code` / `register`) | Clinic + solo doctor Tel required; VERIFYING until OTP; no WhatsApp Manager for go-live |
| Subscriptions | `docline_plans` table (legacy DB name) + `practice_subscriptions` + Razorpay + Billing tab | Keep table name for migrations; UI says GlucoGuide plans |
| WhatsApp booking persist | `createBooking` writes `practice_bookings` **before** AI visit brief; confirm only after row verified | LLM / network must not block or fake a confirmation |
| Directory visibility | `practice.isDirectoryListed` | Suspended / unpaid practices hidden from public find-care |
| Reviews | `practice_reviews` after completed visit; shown on profile + find-clinic | Starter+ plans (`features.reviews`); require published + entitlement |
| Conversation takeover | `whatsapp_conversations.status` + doctor Practice → WhatsApp inbox | Bot silences on `handed_off` |
| Care chat ↔ WhatsApp | Outbound: `chat.whatsappFanout.ts`; inbound replies: `chat.whatsappInbound.ts` into `Message` + `_CHAT` sockets | Patient can answer clinic care texts on WhatsApp; `BOOK`/`BOT` still reach the bot |
| UTILITY template copy | Single catalog `whatsapp.metaTemplates.ts`; free-form fallbacks render from it | Stop drifted duplicate bodies in `whatsapp.templates.ts` |
| WA session vs template | Bot short ack + `skipPatientNotification` for confirm/cancel/reschedule; clinic still gets `CLINIC_*` | Avoid double patient messages in one turn |
| Typed *Member* / *Members* / *Patients* | Intent `members`: count + list of every profile on the number (Self first, then family with relationship) + Book / Add family / Main Menu — no appointments | Patients asked "who is registered on my number", not "what is booked" |
| Arrival time | Nullable `practice_bookings.arrived_at`, set server-side from status moves (first *In waiting* / *Started* / *Finished*), cleared on revert to pre-arrival or *No-show*; no backfill | Single source for "when did the patient get here" without a status-history table; old visits stay blank rather than guessed |
| Stale dashboard tabs reload after a deploy | Build id (`VERCEL_GIT_COMMIT_SHA`) baked into the client and served live by `GET /api/app-version`; `NewVersionWatcher` in `DashboardShell` compares every 60 s and on focus, shows *Reload*, and reloads automatically when the user returns to a stale tab | Open tabs keep the JavaScript they loaded, so shipped fixes (e.g. care chat) never reached users who hadn't hard-refreshed |
| Sending documents from care chat | Paperclip in the chat modal / visit chat: browser uploads to Cloudinary, then `POST /procto/bookings/:id/share-document` appends the file to that appointment's `documents`, posts a `📎 name + link` chat message (no text fan-out) and sends the file itself on the patient's WhatsApp; outside the 24 h window the approved `CLINIC_CARE_MESSAGE` template says a document is waiting in the app. Typed text goes with the file as its caption. Shown only where the chat is tied to an appointment | One action puts the file in all three places the patient looks (WhatsApp, chat, appointment page) without a second template or upload path |
| Every booking needs a Patient ID | `BookingService.createBooking` refuses a booking without an existing `patientId`; `POST /procto/bookings` needs a session — staff via `createDeskBooking` (patient picked or registered at the desk, phone must match the record), patients booked under their own id only; the public web page asks guests to sign in with the WhatsApp OTP (which creates the MRN) instead of taking a typed name + phone | One MRN per person is what ties visits, prescriptions, payments and follow-ups together; name + phone bookings created unlinked visits ("MRN Not set") and duplicate people, and a client-supplied `patientId` allowed booking as someone else |
| Emergency walk-in | Dedicated `POST /procto/bookings/walk-in` (not the public `POST /procto/bookings`): starts now in `WAITING`, tagged `consultationType = EMERGENCY_WALK_IN`, skips the slot engine and patient template | Desk emergencies must never be blocked by a full schedule, while the normal booking path keeps its capacity rules; the tag keeps walk-ins visible and auditable |
| Attach → choose first | *Menu → Attach* and post-booking *Yes* ask **Select Appointment \| General Document** *before* asking for the file; the upload prompt then names the visit or the patient's record, and the file lands exactly there (a General choice never links to a visit, even with `lastBookingId`). A file dropped with no prior choice still gets the same buttons after upload | Patient decides where the file goes up front; no surprise auto-attach to the just-booked visit |
| Attach → *General Document* | 1 linked profile → save directly; >1 → ask *Which patient?* (Self + family) before saving; pick is re-validated against the number's linked profiles | Never guess whose medical record a file belongs to on a shared number |
| Book → *Family member* | Re-read profiles on the number; 0 family → register; ≥1 → picker of existing family + *Add family member* (never auto-pick, never jump to registration) | Shared-number households book for existing dependents; adding a new one stays one tap |

Ops APIs (admin JWT `users:write`):
- `GET/POST /procto/admin/numbers`
- `POST /procto/admin/numbers/assign` `{ practiceId, phoneNumber?, mockGoLive? }` → go-live wa.me note
- `PATCH /procto/admin/numbers/:id/status`
- `POST /procto/admin/numbers/suspend`
- `POST /procto/admin/numbers/:practiceId/go-live`
- `GET /procto/admin/plans`
- `GET/POST /procto/admin/subscriptions`
- `POST /procto/admin/billing/webhook` | `POST /procto/admin/billing/simulate`
- Practice self-serve: `GET /procto/practices/plans`, `GET /procto/practices/:id/billing`, `POST /procto/practices/:id/billing/subscribe` (`trial` | `activate` | `change`)
- Plans: **Starter** ₹1499 · **Growth** ₹2999 · **Clinic** ₹4999 (ensured by `ensureDefaultPlans`)
- `GET /procto/admin/escalations`
- `GET/POST /procto/admin/templates`

## Pilot readiness

| Open question | Decision |
|---------------|----------|
| BSP vs Meta Cloud | **MOCK** for local; evaluate Gupshup/Interakt before production |
| Hindi bot | Deferred |
| Fee collection on WhatsApp | **Shipped (optional prepay)** — after a WA booking the patient is asked *pay before the appointment?* Yes → Razorpay **Payment Link** on the platform account (amount = `Practice.consultationFee`), No → pay at clinic. Payment Links (not Orders/Checkout) because the patient is in WhatsApp with no web session; hosted page handles UPI/cards. Truth is recorded only from a signature-verified callback redirect or `payment_link.*` webhook (or a server-side re-fetch on *Refresh*) — never from the client. Status on `PracticeBooking.payment*`; no per-clinic payouts / Route yet (settlement to clinics is manual). |
| Payment ledger + custom requests | **`payment_requests` table is the single ledger** for every Razorpay Payment Link (kind ADVANCE / CONSULTATION / CUSTOM; channel WHATSAPP_BOT / WEB_PORTAL / PROVIDER_APP; amount in paise; `link_id` unique). WA prepay offers the clinic's optional **advance booking amount** (`Practice.advanceBookingAmount`), falling back to the full fee. Staff send **custom amounts** from any portal; the link goes out as the UTILITY template `docline_payment_request` (receipt `docline_payment_received`) — transactional, patient-specific, so UTILITY not MARKETING. Booking `payment*` fields mirror only prepay links whose `paymentLinkId` matches; custom links never touch the booking. Existing booking links were backfilled into the ledger. |
| Payment confirmation on WhatsApp | **One confirmation per paid link**, claimed atomically (`payment_requests.receipt_delivery` null → SENDING → SENT / FAILED / SIMULATED) so callback, webhook, refresh and poller can't double-send. Prepay for an upcoming visit uses a dedicated UTILITY template `docline_payment_booking_confirmed` (appointment + amount due at clinic) instead of overloading `docline_payment_received`. An in-process **poller** (2 min, 100 newest pending links) is the safety net for missed redirects / webhooks — chosen over relying on webhook configuration per Razorpay account (clinics may skip it). Poller is opt-in under `yarn dev` because local shares the production DB. |
| Clinic-owned Razorpay keys | **Per-practice Razorpay API keys (optional), platform account as fallback.** Chosen over Razorpay Route / partner OAuth because it needs no platform KYC-partner onboarding and settles straight to the clinic. Keys verified live before save; secrets AES-256-GCM (`core/security`) in `practices.razorpay_key_secret_enc` / `razorpay_webhook_secret_enc`, removed from all default reads via Prisma global `omit` (explicit `select` only in `paymentAccount.service`). Each `payment_requests` row records `razorpay_key_id` so the right secret verifies its callback. Per-clinic webhook path `/procto/payments/razorpay/webhook/:practiceId`. Subscriptions stay on the platform key. |
| Patient WA → visit documents | **Shipped** — image/PDF on clinic line attaches to open `PracticeBooking.documents` (Cloudinary + care-chat ping); *REPORT* / *MY DOCS*; ID OCR still for *REGISTER* |
| Expo doctor app | **Shipped** as `apps/provider`: Queue · Calendar · Patients · **Plans (practice billing)** · Visit · More; schedule editor / analytics remain on web. Patient Expo has **no** subscription tab. |
| Multi-doctor clinic | Supported via `PracticeMember` (ahead of strict solo V1) |
| Clinic portal Settings layout | **Account** = clinic details (name, reg no, specialty), location & contact (street address, explicit *City / area*, Tel locked to the WhatsApp line once assigned, email) and fees & booking rules, plus a read-only doctors summary. **Roster** (add / deactivate doctors) lives only in Practice → Doctors (`/clinic/doctors` links there) — one place to manage members. Weekly hours and leave / blocks share Practice → *Hours & blocks* with panes *Weekly hours* / *Leave & blocks* (`?pane=blocks` deep link). Licence number optional in the hours form (server treats it as optional). |
| Patients across clinics | **One patient identity + MRN on GlucoGuide; a per-clinic patient list** (`practice_patients`). Registering someone already on GlucoGuide at another clinic (same name on the number, matching date of birth) adds them to that clinic instead of refusing or creating a duplicate MRN. Chosen over per-clinic patient records so history, family links and WhatsApp identity stay single; the Patients tab = list rows + bookings + MRN prefix + WhatsApp line chats. |
| Lifting leave / blocks | Staff can remove upcoming leave, day / time blocks and token limits (`DELETE …/overrides/:id`, same endpoint as extra slots). Past days can't be changed; audit `OVERRIDE_REMOVED`; patients are not messaged (reopening availability affects nobody booked). |
| Pilot size | 3–5 doctors; provision via admin assign + mock go-live |

Deferred Phase 2+: interactive WA buttons, hard review gate on completed visits, GST invoices.

## Related docs

- [ISO-9000.md](./ISO-9000.md) — Quality Management System (ISO 9000/9001-aligned)
- [qms/README.md](./qms/README.md) — QMS forms & records
- [WhatsApp-How-It-Works.md](./WhatsApp-How-It-Works.md) — WhatsApp bot, QR, number provisioning (plain language)
- [Whatsapp-Meta-Rules.md](./Whatsapp-Meta-Rules.md) — Meta WhatsApp compliance
- [flow.md](./flow.md) — user and system flows
- [login.md](./login.md) — demo credentials
- [playwright-e2e-report.md](./playwright-e2e-report.md) — Playwright E2E (OTP, book→queue, Expo API)
- [frontend/DESIGN.md](../frontend/DESIGN.md) — public visual system
