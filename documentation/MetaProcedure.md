# MetaProcedure — GlucoGuide WhatsApp / Meta Cloud API

**Product:** GlucoGuide  
**Audience:** Ops, engineering, product  
**Purpose:** Complete process to start Meta and go live with clinic WhatsApp booking  
**Related docs:** WhatsApp-How-It-Works.md · Whatsapp-Meta-Rules.md · WhatsApp-Complete-Guide.md

---

## 1. Mental model

```
Patient → Clinic WhatsApp # → Meta Cloud API → GlucoGuide webhook → Bot → Reply
```

GlucoGuide is the **Tech Provider**:

| Piece | Model |
|-------|--------|
| Meta Developer App | **One** for the platform |
| Webhook | **One** URL for all clinics |
| WABA at scale | **One WABA per clinic** (Embedded Signup) |
| Routing | By `phone_number_id` |

The doctor does **not** turn on the bot by scanning a QR. Patients message a **connected LIVE** clinic number; Meta forwards messages to your server.

---

## 2. Choose onboarding path

| Path | When | How |
|------|------|-----|
| **A. Pool (pilot ≤ ~20)** | First 3–5 clinics | Platform-owned numbers on a WABA; admin assigns |
| **B. Embedded Signup (scale)** | N clinics (DoubleTick-style) | Clinic taps **Connect with Meta** → own WABA + Phone Number ID |
| **C. Registration Tel (platform WABA)** | Clinic / solo doctor signup | Tel POSTed to platform `WHATSAPP_WABA_ID` → VERIFYING → in-app Meta OTP (`request_code` / `verify_code` / `register`) → LIVE |

### Path C — in-app OTP (no WhatsApp Manager)

1. Signup collects a **required** 10-digit mobile (clinic Tel / doctor mobile).
2. Backend `ensurePhoneListedAtRegistration` adds the number to the platform WABA and stores `WhatsAppNumber` as **VERIFYING** (with a 6-digit two-step PIN).
3. Backend auto-calls Meta `POST /{phone-number-id}/request_code` (SMS).
4. Owner opens **Subscription → WhatsApp booking line**, enters the code.
5. Backend `verify_code` → `register` → status **LIVE**; bot replies on that number.

Env: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_WABA_ID`, optional `WHATSAPP_TWO_STEP_PIN`.

APIs: `POST /procto/practices/:id/whatsapp/verify/request`, `.../verify/confirm`.

---

## 3. Phase 1 — Meta Business (one-time)

1. Create or use a **Meta Business** account → [business.facebook.com](https://business.facebook.com)
2. Complete **Business Verification**
3. Open [developers.facebook.com](https://developers.facebook.com) → **Create App** → type **Business**
4. Add product: **WhatsApp**
5. Record **App ID** and **App Secret**
6. Create a **System User** (Business Settings → Users → System users)
7. Assign WhatsApp assets; generate a **permanent token** with:
   - `whatsapp_business_management`
   - `whatsapp_business_messaging`
8. *(Optional for pool)* Create a platform **WABA** and register numbers; note each **Phone Number ID**

---

## 4. Phase 2 — Embedded Signup (N clinics)

1. In the Meta app, configure **Embedded Signup**
2. Create a signup configuration → copy **Configuration ID**
3. For WhatsApp Business app **coexistence** (doctor keeps Business app + bot), set feature:
   - `whatsapp_business_app_onboarding`
4. Store values in GlucoGuide `.env` (Phase 3)

**GlucoGuide UI**

- Clinic: Practice → Billing → **Connect with Meta**
- Ops: `/admin/whatsapp/signup`

---

## 5. Phase 3 — GlucoGuide environment

Set in root / `backend` `.env` (see `.env.example`):

```env
# Meta Cloud API
WHATSAPP_ACCESS_TOKEN=<system user permanent token>
WHATSAPP_VERIFY_TOKEN=<any secret string you invent>
WHATSAPP_APP_SECRET=<Meta App Secret>
WHATSAPP_API_VERSION=v21.0

# Optional defaults for pool
WHATSAPP_PHONE_NUMBER_ID=<pool phone number id if any>
WHATSAPP_WABA_ID=<platform waba id if any>

# Embedded Signup (Connect with Meta)
META_APP_ID=<app id>
META_APP_SECRET=<app secret>
META_EMBEDDED_SIGNUP_CONFIG_ID=<embedded signup config id>
META_EMBEDDED_SIGNUP_FEATURE=whatsapp_business_app_onboarding

# OCR / voice (optional)
OPENAI_API_KEY=
# or HF_TOKEN=
```

Restart **backend on port 3001**.

Check readiness: **Admin → WhatsApp signup** (`/admin/whatsapp/signup`) — config checklist should be green.

---

## 6. Phase 4 — Webhook (one URL for all clinics)

Public HTTPS must reach the GlucoGuide API (e.g. `https://api.yourdomain.com`).

| Field | Value |
|-------|--------|
| **Callback URL** | `https://<API_HOST>/api/v1/procto/whatsapp/webhook` |
| **Verify token** | Same as `WHATSAPP_VERIFY_TOKEN` |
| **Subscribe** | `messages`, `message_template_status_update` (+ ideally `account_update`, `phone_number_quality_update`) |

Path in Meta: App → WhatsApp → Configuration → Webhook → Verify & Save.

**Local:** tunnel `:3001` with ngrok (or similar), use that HTTPS URL as callback.

**Signature:** Meta sends `X-Hub-Signature-256`; GlucoGuide verifies with `WHATSAPP_APP_SECRET`.

**Routing:** One webhook for all clinics. GlucoGuide routes by `metadata.phone_number_id`.

---

## 7. Phase 5 — Templates (UTILITY only)

GlucoGuide submits **10 UTILITY** templates after connect (catalog: `whatsapp.metaTemplates.ts`).

| Situation | Allowed |
|-----------|---------|
| Patient messaged within **24 hours** | Free-form session bot replies |
| Outside 24h / first outbound reminder | **APPROVED** template only |

**Ban risks (absolute):**

1. Never send free-form proactive alerts outside the 24h window — use templates
2. Never miscategorize MARKETING as UTILITY
3. Honour **STOP** / **START**
4. No medical advice on the bot
5. Disclose AI on first reply
6. Never send passwords or card data on WhatsApp

Meta may take **1–3 business days** for display name + template approval. GlucoGuide marks the line LIVE immediately for session bot; proactive reminders need Meta approval.

Full policy: **Whatsapp-Meta-Rules.md**

---

## 8. Phase 6 — First clinic go-live

1. Clinic on **Starter+** (or admin **Start trial** under Clinics)
2. Connect the number:
   - **Signup:** Practice → Billing → Connect with Meta  
     *(or Admin `/admin/whatsapp/signup`)*
   - **Pool:** Admin → WhatsApp → assign pool number → LIVE
3. GlucoGuide stores **WABA ID + Phone Number ID** and marks the line **LIVE**
4. Share with patients: `https://wa.me/91XXXXXXXXXX`

---

## 9. Phase 7 — Smoke tests

Use a **patient** phone (not doctor / staff):

| Test | Expect |
|------|--------|
| `HELP` | Menu / welcome |
| `BOOK` / `REGISTER` | Booking / signup flow |
| Voice note | STT → same as text (if keys set) |
| ID photo | OCR → confirm registration |
| `STOP` | Opt out of proactive alerts |

---

## 10. Recommended work order

```
1. Meta Business + App + System User token
2. Fill WHATSAPP_* + META_* in .env → restart API
3. Expose API → set webhook → Verify
4. Embedded Signup config ID → Connect with Meta works in UI
5. Trial/subscribe one clinic → Connect → HELP test
6. Wait Meta template/display-name approval for reminders
7. Onboard more clinics via /admin/whatsapp/signup
```

---

## 11. Local dry run (no Meta)

Leave Meta vars blank → MOCK / `POST /api/v1/procto/whatsapp/webhook/test` still exercises the bot. Real patient WhatsApp requires Phases 1–4.

---

## 12. Admin surfaces

| Surface | Path |
|---------|------|
| Partner dashboard (N-number signup) | `/admin/whatsapp/signup` |
| Pool ops (pilot) | `/admin/whatsapp` |
| Clinic self-serve | Practice → Billing → Connect with Meta |
| Trial accounts | Admin → Clinics → Start trial account |

---

## 13. Platform go-live checklist

- [ ] Meta Business verified
- [ ] App + System User permanent token
- [ ] Embedded Signup config (+ coexistence if needed)
- [ ] `WHATSAPP_*` / `META_*` set; API restarted on `:3001`
- [ ] Webhook verified on production URL
- [ ] Admin WhatsApp signup checklist green

### Per clinic

- [ ] Starter+ or trial active
- [ ] Connect with Meta completed (or pool assigned)
- [ ] Phone Number ID stored; status LIVE
- [ ] Display name approved in WhatsApp Manager
- [ ] Templates APPROVED for proactive alerts (Meta)
- [ ] HELP / BOOK / STOP tests passed
- [ ] wa.me link shared

---

## 14. Common questions

**Do patients need QR?**  
No. They can save the clinic number and message normally. QR only opens chat faster.

**Will scanning QR turn on the bot for the doctor?**  
No.

**Can the bot run on personal WhatsApp without Meta?**  
No. The number must be on Meta’s Business platform.

**One number per doctor or per clinic?**  
**One number per clinic (practice).** All doctors in that clinic share it.

**One webhook for all clinics?**  
Yes. Route by Phone Number ID.

---

*GlucoGuide · MetaProcedure · September 2026*
