# decisions.md — GlucoGuide

Architecture and product decisions that the codebase currently follows. Prefer updating this file when a decision changes.

## Product surface

| Decision | Choice | Why |
|----------|--------|-----|
| Canonical product | **GlucoGuide only** (`frontend/` + `backend/` on `:3000` / `:3001`) | Single product for patients, clinics, and doctors |
| Parallel DocLine monorepo (`apps/api`, `apps/web`) | **Removed** | Was a mistaken dual stack from an old build prompt; do not revive |
| Patient mobile | Expo `apps/mobile` → `:3001` | Patient book + visits |
| Doctor mobile | Expo `apps/provider` → `:3001` (branded GlucoGuide Doctor) | Queue, calendar, patients, visit notes/CareChat, **practice subscription/billing**; analytics stay on web |

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
| Tenant isolation | Practice membership + auth scopes | Doctors only manage their practice data |
| `/practices/mine` shape | Top-level `id` = **practice UUID**; `membershipId` = membership PK | Prevents booking/billing 403 when clients use `row.id` as practiceId |

## Booking & realtime

| Decision | Choice | Why |
|----------|--------|-----|
| Slot engine | Server-side availability from `ProviderSchedule` + overrides | Single source of truth for open slots/tokens |
| Booking identity | `patientPhone` required; optional `patientId` when logged in | Guest book + logged-in book both work |
| Patient problem at book | Required `disease` text; AI visit brief → `notes` + seeds `doctorRemarks` | Doctor sees problem + AI explanation in Remarks; not a diagnosis |
| Accept before visit | After `SCHEDULED`/`REQUESTED`, doctor/clinic sets **`ACCEPTED`**, then Waiting → Started → Finished | Request must be accepted from web dashboard or doctor mobile |
| Doctor analytics | Live Procto booking series only — no sample/demo chart fallbacks | Empty period shows “No data”; Clinic plan required for charts |
| Live queue | Native `ws` `/api/v1/ws/procto/:practiceId` (JWT + practice membership) | Doctor/clinic queue + calendar without polling |
| Patient visits live | Native `ws` `/api/v1/ws/patient` (JWT) | Patient web + Expo visit status |
| Admin ops live | Native `ws` `/api/v1/ws/admin/ops` (platform admin JWT) | Replaces 20–30s support polling |
| Mira AI | **HTTP only** (`POST /assistant/chat`) | No WebSocket for Mira FAB/chat/LLM |
| Post-visit ratings | Clinic + doctor stars after `COMPLETED` | Zomato-style; one review per booking |
| Notifications | Redis BullMQ + WhatsApp (Meta when env set, else simulate); **notification worker runs in-process with API** (`NOTIFICATION_WORKER_INLINE=0` to disable) | Booking HTTP must not fail if notify fails; PENDING rows were stuck when only `yarn dev` ran without `worker:notifications` |
| WhatsApp booking bot | DeepSeek NLU + regex fallback; multi-step orchestrator in `backend/`; **patients only** | Patient register/book/status/cancel/reschedule via chat; doctors/clinics use web portal; clinic alerts on confirm/cancel/reschedule/queue |
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
| Seed | `cd backend && yarn seed` | Demo doctor, patient, admin, and clinic plans |

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
| Subscriptions | `docline_plans` table (legacy DB name) + `practice_subscriptions` + Razorpay + Billing tab | Keep table name for migrations; UI says GlucoGuide plans |
| Bot policy | AI disclosure, FAQ from `faq_kb`, clinical guardrails, *HUMAN* handoff | Meta policy |
| Directory visibility | `practice.isDirectoryListed` | Suspended / unpaid practices hidden from public find-care |
| Reviews | `practice_reviews` after completed visit; shown on profile + find-clinic | Starter+ plans (`features.reviews`); require published + entitlement |
| Conversation takeover | `whatsapp_conversations.status` + doctor Practice → WhatsApp inbox | Bot silences on `handed_off` |
| Care chat ↔ WhatsApp | Outbound: `chat.whatsappFanout.ts`; inbound replies: `chat.whatsappInbound.ts` into `Message` + `_CHAT` sockets | Patient can answer clinic care texts on WhatsApp; `BOOK`/`BOT` still reach the bot |
| UTILITY template copy | Single catalog `whatsapp.metaTemplates.ts`; free-form fallbacks render from it | Stop drifted duplicate bodies in `whatsapp.templates.ts` |
| WA session vs template | Bot short ack + `skipPatientNotification` for confirm/cancel/reschedule; clinic still gets `CLINIC_*` | Avoid double patient messages in one turn |

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
| Fee collection on WhatsApp | Deferred (V1 appointment-only) |
| Patient WA → visit documents | **Shipped** — image/PDF on clinic line attaches to open `PracticeBooking.documents` (Cloudinary + care-chat ping); *REPORT* / *MY DOCS*; ID OCR still for *REGISTER* |
| Expo doctor app | **Shipped** as `apps/provider`: Queue · Calendar · Patients · **Plans (practice billing)** · Visit · More; schedule editor / analytics remain on web. Patient Expo has **no** subscription tab. |
| Multi-doctor clinic | Supported via `PracticeMember` (ahead of strict solo V1) |
| Pilot size | 3–5 doctors; provision via admin assign + mock go-live |

Deferred Phase 2+: interactive WA buttons, hard review gate on completed visits, GST invoices.

## Related docs

- [ISO-9000.md](./ISO-9000.md) — Quality Management System (ISO 9000/9001-aligned)
- [qms/README.md](./qms/README.md) — QMS forms & records
- [WhatsApp-How-It-Works.md](./WhatsApp-How-It-Works.md) — WhatsApp bot, QR, number provisioning (plain language)
- [Whatsapp-Meta-Rules.md](./Whatsapp-Meta-Rules.md) — Meta WhatsApp compliance
- [flow.md](./flow.md) — user and system flows
- [login.md](./login.md) — demo credentials
- [frontend/DESIGN.md](../frontend/DESIGN.md) — public visual system
