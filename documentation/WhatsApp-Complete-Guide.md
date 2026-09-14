# GlucoGuide WhatsApp — Complete Integration Guide

**Product:** GlucoGuide — Healthcare clinic appointment booking over WhatsApp  
**Version:** 1.0 · August 2026  
**Audience:** WhatsApp BSP / Meta API provider, GlucoGuide ops, clinic onboarding, engineering  
**Related docs:** `WhatsApp-How-It-Works.md`, `Whatsapp-Meta-Rules.md`, `decisions.md`

---

## Document control

| Field | Value |
|-------|-------|
| Purpose | End-to-end WhatsApp setup: pool numbers, clinic-owned numbers, provider workflow, scaling, compliance |
| Integration | Meta WhatsApp Cloud API (direct or via BSP) |
| Webhook | Single URL for all clinics: `/api/v1/procto/whatsapp/webhook` |
| Template category | UTILITY only |
| Meta approval SLA | Typically 24–72 hours (display name + templates) |

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [How GlucoGuide WhatsApp works](#2-how-docline-whatsapp-works)
3. [Three ways to set up a clinic number](#3-three-ways-to-set-up-a-clinic-number)
4. [Scaling beyond 20 numbers](#4-scaling-beyond-20-numbers)
5. [Managing N WABA IDs](#5-managing-n-waba-ids)
6. [Meta Business account and payment](#6-meta-business-account-and-payment)
7. [Clinic-owned number workflow](#7-clinic-owned-number-workflow)
8. [Restrictions when linking to your Meta app](#8-restrictions-when-linking-to-your-meta-app)
9. [Approval timelines](#9-approval-timelines)
10. [Provider setup workflow](#10-provider-setup-workflow)
11. [Webhook configuration](#11-webhook-configuration)
12. [Message templates (all 10)](#12-message-templates-all-10)
13. [Meta compliance rules](#13-meta-compliance-rules)
14. [Environment variables and credentials](#14-environment-variables-and-credentials)
15. [Go-live checklists](#15-go-live-checklists)
16. [Testing checklist](#16-testing-checklist)
17. [Architecture and code reference](#17-architecture-and-code-reference)
18. [FAQ](#18-faq)
19. [Provider deliverables sign-off](#19-provider-deliverables-sign-off)

---

## 1. Executive summary

GlucoGuide connects clinic WhatsApp numbers to an automated booking bot on our server. **The bot does not run inside the doctor's WhatsApp app.**

```
Patient → Clinic WhatsApp number → Meta Cloud API → GlucoGuide server → Bot reply
                                                      ↘ also care chat (when patient has a booking + doctor thread)
```

**Care chat:** Clinic texts from the GlucoGuide portal/app also send on WhatsApp. Patient replies to those texts are stored in care chat so doctors see them in the portal and apps (booking commands like BOOK still use the bot).

**Key facts:**

- One WhatsApp number = **one clinic (practice)** — all doctors in that clinic share it
- Doctors do **not** scan a QR to activate the bot
- QR codes (`wa.me/91XXXXXXXXXX`) are for **patients** to open chat faster
- Proactive messages (confirmations, reminders) require **approved UTILITY templates**
- Session replies (when patient messages first) work free-form within Meta's 24-hour window

**Provider responsibilities:** Meta app, WABA, webhook, tokens, templates, number registration  
**GlucoGuide responsibilities:** Bot logic, routing, admin assign, clinic Billing UI  
**Clinic responsibilities:** Subscribe to plan, connect own number (or use assigned pool number)

**Typical full go-live:** Connect can be same-day; Meta display name + template approval usually **1–3 business days**.

---

## 2. How GlucoGuide WhatsApp works

### 2.1 The one thing to remember

The bot lives on **our server**. When a patient sends a message, Meta forwards it to us, and we reply automatically. Once the clinic number is **connected and live**, the bot answers patients automatically. No doctor scan needed.

### 2.2 What you wanted vs what actually works

| Idea | Works? | Why |
|------|--------|-----|
| Patients message clinic number → bot books for them | **Yes** | This is what we built |
| Doctor scans QR to "turn on" the bot | **No** | Meta does not work that way |
| QR on clinic poster so patients open chat | **Yes** | Optional marketing only |

**QR is for patients to open chat faster. It does not connect or activate the bot.**

### 2.3 When the bot is active

All of the following must be true:

1. Clinic has **Starter+ plan** (WhatsApp feature enabled)
2. A **clinic WhatsApp number** is linked to the practice
3. Meta has **approved** the clinic name and message templates (for full proactive alerts)
4. Our **webhook** is connected to Meta

### 2.4 Inbound message flow

```
Patient → Clinic WA # → Meta Cloud API → GlucoGuide webhook → Bot orchestrator → Reply
```

GlucoGuide routes inbound messages by **Phone Number ID** (globally unique), not by WABA ID.

### 2.5 Outbound message flow

```
GlucoGuide booking event → Notification worker → Meta template API → Patient WhatsApp
```

Outside the 24-hour customer service window, **only approved templates** may be sent.

### 2.6 What the bot does for patients

When the line is live, patients can message and get:

- Register
- Book appointment
- Check status
- Cancel / reschedule
- Voice notes (speech-to-text)
- Reminders (via approved templates)
- **STOP** to opt out of alerts

**Doctors do not use the bot chat.** If a doctor messages the clinic line, they get a message to use the web portal (`/doctor/queue`, `/doctor/practice`).

### 2.7 Customer service window vs templates

| Situation | Allowed |
|-----------|---------|
| User messaged the business line within **24 hours** | Free-form session replies (booking bot) |
| Outside 24h, or first outbound reminder | **Template** only |
| User replies after a template | New 24h window opens |

---

## 3. Three ways to set up a clinic number

### Option 1 — Pool number (easiest for pilot)

**We give the clinic a number from our pool.**

- Doctor shares that number with patients (card, poster, profile)
- Doctor keeps their personal WhatsApp separate
- Ops assigns the number in admin
- **Best for:** First 3–5 doctor pilot
- **Counts against 20-number Meta cap:** Yes

```
Subscribe → Ops assigns number → Go live → Patients message that number → Bot works
```

### Option 2 — Clinic's own number (recommended for scale)

**Same number — bot plus doctor can both use WhatsApp (coexistence).**

Doctor must use the **WhatsApp Business app** (not personal WhatsApp).

Flow (self-serve in Billing):

1. Doctor subscribes to **Starter+** under Practice → **Billing**
2. Enters **clinic WhatsApp number**
3. Clicks **Connect with Meta** (Embedded Signup) or enters **Meta Phone Number ID**
4. Meta webhook must point to GlucoGuide server
5. UTILITY templates must be **APPROVED** on that clinic's WABA (24–72h)

**Doctor can still reply manually** in the WhatsApp Business app. **Bot handles** booking, status, cancel, reminders.

Meta calls this **Coexistence**.  
Official doc: https://developers.facebook.com/docs/whatsapp/embedded-signup/custom-flows/onboarding-business-app-users/

**Does not count against pool cap** when properly onboarded per clinic WABA.

### Option 3 — Personal WhatsApp on clinic number (hard — avoid)

- Doctor must **delete** personal WhatsApp on that number
- Number is moved to Meta Business API
- Personal WhatsApp cannot stay on the same number
- Old chat history is not kept on the bot side

**Better path:** Move to WhatsApp Business app first, then use Option 2.

### Quick decision guide

**Ask the doctor:** *Is your clinic number on personal WhatsApp or WhatsApp Business app?*

| Answer | Recommendation |
|--------|----------------|
| Personal WhatsApp | Pool number (Option 1) OR migrate to Business app first |
| WhatsApp Business app | Option 2 — Connect with Meta |
| Fastest pilot | Option 1 — pool number |

---

## 4. Scaling beyond 20 numbers

Meta limits registered phone numbers per business portfolio:

| Stage | Typical cap |
|-------|-------------|
| New / unverified | **2 numbers** |
| Business verified | **20 numbers** |
| Beyond 20 | Request increase via Meta Business Support |

**Scaling strategy:**

1. **Pilot:** Pool numbers (Option 1) — up to ~20 clinics on one verified portfolio
2. **Growth:** Clinic-owned numbers (Option 2) — each clinic brings their own number
3. **If more central numbers needed:** Multiple WABAs + Meta support ticket for limit increase
4. **Stay on Meta Cloud API** — GlucoGuide does not use BSPs (AiSensy, Gupshup, etc.)

**Do not scale by:** stuffing unlimited clinics into one Meta account's 20-number pool.

One number can handle high message volume via Meta **messaging tiers** (daily conversation limits). The 20 cap is about **distinct clinic lines**, not messages per line.

---

## 5. Managing N WABA IDs

When using clinic-owned numbers at scale, expect **one WABA per clinic** (not one WABA for all clinics).

```
Clinic A → WABA_A → Phone Number ID_A
Clinic B → WABA_B → Phone Number ID_B
Clinic C → WABA_C → Phone Number ID_C
```

### What works today without code changes

| Concern | Status |
|---------|--------|
| Inbound routing | **Works** — by Phone Number ID from webhook |
| Outbound sends | **Works** — platform token + per-clinic Phone Number ID |
| One webhook for all | **Works** |
| WABA ID stored in DB | **Gap** — use spreadsheet; add `wabaId` column later |
| Templates per WABA | **Main ops work** — 10 templates must be approved on each WABA |

### Three-layer management model

**Layer 1 — Provider (Meta/BSP):**

- One Meta App + one webhook URL
- One system/partner token with access to all onboarded WABAs
- Onboards each clinic → creates WABA + Phone Number ID
- Auto-syncs 10 UTILITY templates on each new WABA (ask provider to confirm)

**Layer 2 — GlucoGuide registry (ops):**

| practice_name | clinic_phone | waba_id | phone_number_id | display_name_status | templates_status | go_live |
|---------------|--------------|---------|-----------------|---------------------|------------------|---------|

**Layer 3 — GlucoGuide runtime:**

- Webhook routes by `phone_number_id`
- Send uses token + clinic's `phone_number_id`
- Same bot logic for all clinics

### Questions to ask your provider

1. Does **one access token** work for all clinic WABAs?
2. Is **one webhook** sufficient for all WABAs?
3. Do you **auto-submit 10 UTILITY templates** on each new clinic WABA?
4. Does Embedded Signup return `waba_id` + `phone_number_id`?
5. Is **coexistence** enabled for WhatsApp Business app users?

**Avoid:** per-clinic separate API tokens (not supported in GlucoGuide today).

---

## 6. Meta Business account and payment

When **you** create Meta Business and add payment:

```
YOUR Meta Business Portfolio (verified, payment added)
    │
    ├── Your Meta Developer App (WhatsApp product)
    │       └── Webhook → GlucoGuide server
    │       └── System user token → GlucoGuide backend
    │
    └── Clinic onboarding (Embedded Signup / provider)
            ├── Clinic A → WABA_A → Phone + Phone Number ID_A
            ├── Clinic B → WABA_B → Phone + Phone Number ID_B
            └── Clinic C → WABA_C → Phone + Phone Number ID_C
```

**You pay Meta** for WhatsApp conversation charges. **Clinics pay GlucoGuide** subscription (Starter ₹1499+, Growth ₹2999, Clinic ₹4999).

Clinics do **not** need to:

- Create their own Meta Business account
- Add their own card to Meta
- Manage WhatsApp API billing

### Who manages what

| Task | You / provider | Clinic |
|------|----------------|--------|
| Meta Business account & payment | Yes | No |
| Meta App, webhook, token | Yes | No |
| Connect their WhatsApp number | Assist | Clicks "Connect with Meta" |
| Share number with patients | — | Cards, poster, profile |
| Reply manually to patients | — | WhatsApp Business app |
| Booking bot, reminders | GlucoGuide | Automatic |
| Display name + templates | Provider submits | Provides clinic name |

---

## 7. Clinic-owned number workflow

### Provider one-time setup

- Meta Business verified
- Payment method added
- Meta App + WhatsApp API enabled
- Webhook → GlucoGuide production URL
- Embedded Signup with `whatsapp_business_app_onboarding` (coexistence)
- 10 UTILITY templates ready for sync to each new WABA

### Per-clinic connect (doctor steps)

1. Subscribe to GlucoGuide **Starter+**
2. Ensure clinic number is on **WhatsApp Business app**
3. Open **Practice → Billing → WhatsApp booking line**
4. Enter 10-digit clinic mobile
5. Click **Connect with Meta**
6. Complete Meta popup (Facebook login + authorize)
7. Status shows **Live** — copy `wa.me` link for patients

### After connect

- **Patients** message clinic number → GlucoGuide bot replies
- **Doctor** can use WhatsApp Business app on same number (coexistence)
- **Provider** ensures templates approved on that clinic's WABA
- **Ops** updates registry when Meta approvals complete

---

## 8. Restrictions when linking to your Meta app

### Number eligibility

| Restriction | Detail |
|-------------|--------|
| Personal WhatsApp | Cannot use coexistence — need Business app |
| Number on another API/BSP | Must migrate/unlink first |
| One API per number | Cannot be on two providers simultaneously |
| Must own number | Real SIM; SMS/voice OTP capable |
| Business app version | 2.24.17+ for coexistence |

### Partner / lock-in

- Number/WABA is tied to **your Meta app + provider**
- Switching BSP later requires Meta number migration
- Clinic authorizes via Facebook login during Embedded Signup

### Coexistence limitations (Business app + API)

| Feature | After linking |
|---------|---------------|
| Throughput | ~20 messages/second cap when app + API share number |
| Template messages | Sent **only via API** (GlucoGuide) |
| Broadcast lists in app | Become read-only |
| Disappearing / view-once messages | Disabled in 1:1 chats |
| Live location | Disabled in 1:1 chats |
| Edit / delete messages | Disabled in 1:1 threads |
| Linked devices | Unlinked during onboarding; re-link up to 4 (Windows/WearOS limited) |
| App must stay active | Open Business app every ~13–14 days |

### Messaging policy

- 24-hour window for free-form replies
- UTILITY templates only for appointment alerts (no MARKETING miscategorization)
- Opt-in before first proactive template
- STOP must work
- No medical advice on bot
- Display name must match real clinic
- Quality rating — Low quality can pause the number

### GlucoGuide platform limits

- One number per clinic (practice)
- Changing number requires support
- Starter+ subscription required

---

## 9. Approval timelines

| Step | Who | Typical time |
|------|-----|--------------|
| Connect with Meta in GlucoGuide | Automatic | **Minutes** |
| Phone OTP verification | Meta | **Minutes** |
| GlucoGuide shows **Live** | GlucoGuide (on connect) | **Instant** |
| **Display name** approval | Meta review | **24–72 hours** |
| **Template** approval (per WABA) | Meta review | **24–72 hours** |

### What works before full Meta approval

| Feature | Day 0 (connect) | After templates approved |
|---------|-----------------|--------------------------|
| Patient sends HELP/BOOK | Yes | Yes |
| Session bot (24h window) | Yes | Yes |
| Web booking → WhatsApp template confirm | Maybe fallback | Yes |
| Automated reminders outside 24h | No / fallback | Yes |

### Messaging for clinics

**After connect:**  
*"Your number is connected. Patients can message and the booking bot will reply. Meta is reviewing your clinic name and message templates — usually 1–3 business days."*

**After full approval:**  
*"WhatsApp booking is fully live — bot + confirmations + reminders."*

**Never promise:** instant full go-live including all automated reminders.

---

## 10. Provider setup workflow

### Phase 1 — Meta platform setup

1. Complete **Business Verification** in Meta Business Suite
2. Create Meta Developer App (Business type) + add WhatsApp product
3. Create WABA; record WABA ID
4. Create System User; generate permanent token with `whatsapp_business_management` + `whatsapp_business_messaging`
5. Configure Embedded Signup with `whatsapp_business_app_onboarding`

### Phase 2 — Phone numbers

**Pool (Model A):** Register numbers on platform WABA; record Phone Number ID per number.

**Clinic-owned (Model B):** Clinic connects via Embedded Signup; provider verifies number appears in WhatsApp Manager.

### Phase 3 — Webhook

See Section 11.

### Phase 4 — Templates

See Section 12. Submit all 10 on each clinic WABA.

### Phase 5 — Credentials handoff

See Section 14.

---

## 11. Webhook configuration

| Field | Value |
|-------|-------|
| Callback URL | `{API_BASE}/api/v1/procto/whatsapp/webhook` |
| Verify token | Agreed string — GlucoGuide sets `WHATSAPP_VERIFY_TOKEN` |
| Signature | `X-Hub-Signature-256` validated with `WHATSAPP_APP_SECRET` |

**Subscribe to:** `messages`, `message_template_status_update`, `account_update`, `phone_number_quality_update`

**One webhook for all clinics.** GlucoGuide routes by `metadata.phone_number_id` in payload.

**Test:** Patient sends HELP → bot reply within 30 seconds.

---

## 12. Message templates (all 10)

All **UTILITY**, language `en`, **named parameters**. Must be approved on **each clinic WABA**.

**Canonical bodies (do not duplicate elsewhere):**  
`backend/src/services/procto/whatsapp.metaTemplates.ts` → `META_UTILITY_TEMPLATES`  
Free-form notification fallbacks render from that same catalog via `renderUtilityTemplateBody`.

| Internal key | Meta name | Purpose |
|--------------|-----------|---------|
| BOOKING_CONFIRMATION | docline_booking_confirm | After book (web/app; skipped if WA bot already acked) |
| REMINDER | docline_appointment_reminder | Before slot |
| CANCELLATION | docline_booking_cancelled | Cancel (web/app; skipped if WA bot already acked) |
| RESCHEDULE | docline_booking_rescheduled | Time change (web/app; skipped if WA bot already acked) |
| OVERRIDE_IMPACT | docline_schedule_change | Schedule block impact |
| QUEUE_ALERT | docline_queue_ready | You're up next |
| CLINIC_NEW_BOOKING | docline_clinic_new_booking | Staff alert |
| CLINIC_CANCEL | docline_clinic_booking_cancelled | Staff alert |
| CLINIC_RESCHEDULE | docline_clinic_booking_rescheduled | Staff alert |
| CLINIC_QUEUE_ALERT | docline_clinic_queue_alert | Staff alert |

### Template rules

- Category: UTILITY only — never MARKETING
- Include STOP opt-out on patient templates (in catalog bodies)
- No promos, discounts, upsells
- Do **not** rename LIVE `docline_*` Meta names without Meta re-approval
- Prefer confirm + one reminder; avoid double patient messages on WhatsApp session path

---

## 13. Meta compliance rules

### Absolute rules (ban risks)

1. Never send free-form proactive text outside 24h window — use approved templates
2. Never miscategorize MARKETING as UTILITY
3. Opt-in before first proactive template
4. Honour STOP (sets `waOptOut`; blocks proactive alerts)
5. No medical advice on bot — escalate to HUMAN
6. Disclose AI on first message
7. Never send passwords, OTPs, or payment card data on WhatsApp
8. One quality WABA per brand — don't spam same user from multiple numbers
9. Display name must match real clinic
10. No cold outreach to non-opted-in contacts

### Bot session behaviour

| Do | Don't |
|----|-------|
| AI disclosure on first message | Pretend to be a human doctor |
| FAQ from clinic faqKb only | Invent clinical advice |
| HUMAN handoff | Diagnose / prescribe |
| HELP menu for bookings | Blast marketing |
| STOP / START | Ignore opt-out |

### Incident response

1. Stop proactive sends for affected WABA
2. Read Meta `account_update` webhook / email
3. Pause offending templates; fix copy; resubmit
4. Audit opt-out misses
5. Resume only after quality recovers

---

## 14. Environment variables and credentials

```env
WHATSAPP_ACCESS_TOKEN=<permanent system user token>
WHATSAPP_WABA_ID=<platform waba id — for pool lookup>
WHATSAPP_PHONE_NUMBER_ID=<default pool number id, if any>
WHATSAPP_VERIFY_TOKEN=<agreed verify string>
WHATSAPP_APP_SECRET=<app secret>
WHATSAPP_API_VERSION=v21.0

META_APP_ID=<app id>
META_APP_SECRET=<app secret>
META_EMBEDDED_SIGNUP_CONFIG_ID=<config id>
META_EMBEDDED_SIGNUP_FEATURE=whatsapp_business_app_onboarding
```

Send credentials via secure channel only.

---

## 15. Go-live checklists

### Platform (provider — one time)

- [ ] Meta Business verified
- [ ] App + WABA + System User token
- [ ] Embedded Signup with coexistence
- [ ] Webhook verified on production
- [ ] Credentials sent to GlucoGuide

### Per clinic

- [ ] Starter+ subscription active
- [ ] Phone registered on Meta WABA
- [ ] Connect with Meta completed (or pool number assigned)
- [ ] Phone Number ID stored in GlucoGuide
- [ ] Display name APPROVED in WhatsApp Manager
- [ ] 10/10 templates APPROVED on clinic WABA
- [ ] Test: HELP → bot reply
- [ ] Test: BOOK → booking flow
- [ ] Test: web book → template confirmation (after templates approved)
- [ ] Test: STOP opts out
- [ ] wa.me link shared with clinic

---

## 16. Testing checklist

| # | Test | Pass criteria |
|---|------|---------------|
| 1 | Webhook GET verify | Meta shows verified |
| 2 | Inbound HELP | Bot reply < 30s |
| 3 | Inbound BOOK | Booking flow starts |
| 4 | Voice note | Transcribed + processed |
| 5 | Template confirm send | Patient receives formatted message |
| 6 | STOP | No further proactive alerts |
| 7 | Multi-clinic routing | Each Phone Number ID routes to correct practice |
| 8 | Invalid webhook signature | 401 rejected |

---

## 17. Architecture and code reference

### Architecture decisions

| Decision | Choice |
|----------|--------|
| WABA model (pilot) | One platform WABA, one phone per practice |
| WABA model (scale) | N WABAs — one per clinic via Embedded Signup |
| Provisioning SLA | 24–72h (Meta-controlled) |
| Routing key | Phone Number ID (not WABA ID) |
| Webhook | Single URL for all clinics |

### Code files

| What | File |
|------|------|
| Assign numbers | `backend/src/services/procto/numberPool.service.ts` |
| Connect own number | `numberPool.service.ts` → `connectOwnNumber` |
| Embedded Signup | `backend/src/services/procto/metaWhatsApp.service.ts` |
| Incoming messages | `backend/src/services/procto/whatsapp.service.ts` |
| Booking conversation | `backend/src/services/procto/whatsapp.orchestrator.ts` |
| Template catalog | `backend/src/services/procto/whatsapp.metaTemplates.ts` |
| Send API | `backend/src/services/procto/whatsapp.client.ts` |
| Webhook routes | `backend/src/routes/procto/whatsapp.ts` |
| Billing / connect UI | `frontend/components/ui/procto/PracticeWhatsAppConnect.tsx` |

### API endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/procto/whatsapp/webhook` | GET/POST | Meta webhook |
| `/api/v1/procto/practices/:id/whatsapp/connect` | POST | Clinic connects own number |
| `/api/v1/procto/practices/:id/whatsapp/resolve` | POST | Auto-resolve Phone Number ID |
| `/api/v1/procto/admin/numbers` | GET/POST | Pool management |
| `/api/v1/procto/admin/numbers/assign` | POST | Assign pool number |
| `/api/v1/procto/admin/templates/sync-meta` | POST | Sync template catalog |

### Plans

- **Starter** ₹1499/mo — WhatsApp line, directory, 150 bookings/mo
- **Growth** ₹2999/mo — + reminders, reviews, multi-doctor
- **Clinic** ₹4999/mo — + queue analytics, dedicated support

---

## 18. FAQ

**Does the doctor scan a QR to turn on the bot?**  
No. QR is for patients only.

**One number per doctor or per clinic?**  
One number per **clinic (practice)**.

**Can personal WhatsApp be used?**  
No for coexistence. Use Business app or pool number.

**One webhook for all clinics?**  
Yes. GlucoGuide routes by Phone Number ID.

**How do reminders work?**  
GlucoGuide calls `POST /v21.0/{phone_number_id}/messages` with approved templates.

**What if we hit 20 pool numbers?**  
Use clinic own number (Option 2), request Meta limit increase, or add WABAs.

**Who pays Meta?**  
Platform (GlucoGuide). Clinics pay GlucoGuide subscription.

**Is there an approval wait?**  
Connect is minutes. Display name + templates: typically 1–3 days.

**N WABA IDs — is that normal?**  
Yes at scale. One WABA per clinic. Route by Phone Number ID.

---

## 19. Provider deliverables sign-off

| # | Deliverable | Provider | GlucoGuide | Date |
|---|-------------|----------|---------|------|
| 1 | WABA ID(s) | ☐ | ☐ | |
| 2 | App ID + App Secret | ☐ | ☐ | |
| 3 | Permanent access token | ☐ | ☐ | |
| 4 | Embedded Signup config ID | ☐ | ☐ | |
| 5 | Webhook verified | ☐ | ☐ | |
| 6 | Phone Number IDs + mobiles registry | ☐ | ☐ | |
| 7 | Display names approved | ☐ | ☐ | |
| 8 | All 10 templates APPROVED per WABA | ☐ | ☐ | |
| 9 | HELP test passed | ☐ | ☐ | |
| 10 | Coexistence enabled | ☐ | ☐ | |

**Provider signature:** _________________________ **Date:** __________  
**GlucoGuide signature:** _________________________ **Date:** __________  

---

## What the provider must NOT do

| Do not | Reason |
|--------|--------|
| MARKETING templates as UTILITY | Ban / recategorization risk |
| Cold outreach | Policy violation |
| Passwords/OTP on WhatsApp | GlucoGuide forbidden |
| Separate webhook per clinic | Single webhook architecture |
| Promise instant full go-live | Meta approval 1–3 days |
| Personal WhatsApp coexistence | Requires Business app |

---

**End of document**

GlucoGuide · WhatsApp Complete Integration Guide v1.0 · August 2026

*Sources: WhatsApp-How-It-Works.md, Whatsapp-Meta-Rules.md, decisions.md, and GlucoGuide backend implementation.*
