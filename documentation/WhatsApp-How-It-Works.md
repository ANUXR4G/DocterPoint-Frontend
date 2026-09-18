# WhatsApp for GlucoGuide — How It Works

**Who this is for:** Product, doctors, ops, engineering  
**Last updated:** Aug 2026  
**Also read:** [Whatsapp-Meta-Rules.md](./Whatsapp-Meta-Rules.md) (Meta safety and go-live rules)

---

## The one thing to remember

**The bot does not live inside the doctor’s WhatsApp app.**

It lives on **our server**. When a patient sends a message, Meta forwards it to us, and we reply automatically.

```
Patient → Clinic WhatsApp number → Meta → Our server (bot) → Reply to patient
```

The doctor does **not** need to scan a QR for the bot to work.  
Once the clinic number is **connected and live**, the bot answers patients automatically.

**Clinic Settings Tel = WhatsApp bot number.**  
When a line is assigned or connected, we write the same digits to profile **Tel** and `whatsappBusinessNumber`. Patients and the directory see that Tel; they message that number on WhatsApp. While a line is live, Settings Tel is locked — change the number only under Billing → WhatsApp or via admin pool reassignment.

---

## What you wanted vs what actually works

### What you wanted

> Doctor scans a QR → bot turns on on their WhatsApp number → bot talks to patients and does booking.

### What works

| Idea | Works? | Why |
|------|--------|-----|
| Patients message clinic number → bot books for them | **Yes** | This is what we built |
| Doctor scans QR to “turn on” the bot | **No** | Meta does not work that way |
| QR on clinic poster so patients open chat | **Yes** | Optional marketing only |

**QR is for patients to open chat faster.**  
**It does not connect or activate the bot.**

---

## How the bot gets “on”

The bot is active when **all** of these are true:

1. Clinic has **Starter+ plan** (WhatsApp feature enabled)
2. A **clinic WhatsApp number** is linked to the practice
3. Meta has **approved** the clinic name and message templates
4. Our **webhook** is connected to Meta

Then **every patient message** to that number runs the bot. No doctor scan needed.

**Typical setup time:** Instant after Connect with Meta (GlucoGuide auto-approves templates locally). Meta may still review templates in the background for Cloud API sends.

---

## Three ways to set up the clinic number

### Option 1 — Easiest (use today for pilot)

**We give the clinic a number from our pool.**

- Doctor shares that number with patients (card, poster, profile)
- Doctor keeps their personal WhatsApp separate
- Ops assigns the number in admin
- **Best for:** First 3–5 doctor pilot

```
Subscribe → Ops assigns number → Go live → Patients message that number → Bot works
```

---

### Option 2 — Best if doctor already uses WhatsApp Business app

**Same number — bot plus doctor can both use WhatsApp.**

Doctor must use the **WhatsApp Business app** (not normal personal WhatsApp).

Flow (self-serve in Billing):

1. Doctor subscribes to **Starter+** under Practice → **Billing**
2. Enters **clinic WhatsApp number** + **Meta Phone Number ID**
3. Clicks **Connect WhatsApp & activate bot**
4. Meta webhook must point to your server (see env `WHATSAPP_*`)
5. UTILITY templates are **auto-approved in GlucoGuide** on connect (line goes **LIVE** immediately; no manual Meta wait gate)

**Doctor can still reply manually** in the WhatsApp Business app (coexistence on Meta side).  
**Bot handles** booking, status, cancel, reminders.

Meta calls this **Coexistence**.  
Official doc: [Onboard WhatsApp Business app users](https://developers.facebook.com/docs/whatsapp/embedded-signup/custom-flows/onboarding-business-app-users/)

---

### Option 3 — Doctor uses personal WhatsApp on that number (hard)

**Possible, but painful.**

- Doctor must **delete** personal WhatsApp on that number
- Number is moved to Meta Business API
- **Personal WhatsApp cannot stay** on the same number
- Old chat history is **not** kept on the bot side
- Doctor uses our **web portal** for clinic work, not WhatsApp chat

**Only use this if the doctor insists on that exact number and accepts losing personal WhatsApp on it.**

**Better path:** Move to WhatsApp Business app first, then use Option 2.

---

## Quick decision guide

**Ask the doctor one question:**  
*Is your clinic number on personal WhatsApp or WhatsApp Business app?*

```
Personal WhatsApp
  → Hard migration (delete account) OR use a new clinic SIM
  → Recommend: use pool number (Option 1) instead

WhatsApp Business app
  → Coexistence / Connect WhatsApp (Option 2) when we build it

Want fastest pilot
  → Pool number (Option 1) — works now
```

---

## What the bot does for patients (already built)

When the line is live, patients can message and get:

- Register (type name **or send Aadhaar/PAN/ID photo or PDF** → OCR autofills → optional email Yes/No)
- Book appointment
- Check status
- Cancel / reschedule
- Voice notes (speech-to-text)
- ID photo/PDF OCR (same vision stack as web `/auth/id-scan` — PDF page 1 rasterized; needs `OPENAI_API_KEY` or `HF_TOKEN`)
- Reminders (via UTILITY templates)
- **STOP** to opt out of alerts

**Doctors do not use the bot chat.**  
If a doctor messages the clinic line, they get a message to use the web portal (`/doctor/queue`, `/doctor/practice`).

---

## What QR is actually for

**Patient QR** = link like `https://wa.me/91XXXXXXXXXX`

- Patient scans → WhatsApp opens → they can type BOOK or HELP
- Same as saving the number manually
- **Does not** activate anything for the doctor

**Planned later:** “Download QR poster” on the doctor Billing page.

---

## Scaling to N clinic numbers (DoubleTick-style)

GlucoGuide uses **one Meta Developer App + one webhook + Embedded Signup** — same model as DoubleTick / Tech Providers:

| Surface | Path |
|---------|------|
| **Partner dashboard** | `/admin/whatsapp/signup` — registry of all lines, pending clinics, Connect with Meta for any clinic |
| **Pool ops (pilot ≤20)** | `/admin/whatsapp` — assign platform pool numbers |
| **Clinic self-serve** | Practice → Billing → **Connect with Meta** |

Each clinic gets its own **WABA + Phone Number ID**. The booking bot is shared; routing uses `phone_number_id`.

See [WhatsApp-Complete-Guide.md](./WhatsApp-Complete-Guide.md) §4–5 for Meta onboarding limits (10→200 new clinics/week after verification).

---

## What we have today vs what’s next

### Today

- **Connect with Meta (Embedded Signup)** in Practice → Billing — one-click Facebook login returns WABA + Phone Number ID
- Auto-subscribe WABA webhooks + submit 10 UTILITY templates via Graph API
- Provisioning status UI (auto-approved templates + LIVE)
- Number pool + admin assign (pilot / pool numbers)
- Bot + booking over WhatsApp (routes by Phone Number ID)
- `wa.me` link on practice profile
- MOCK go-live for local testing (no Meta credentials)
- **Meta Cloud API only** — no BSP (AiSensy / Gupshup / etc.)

### Not built yet

- **Download QR** poster from Billing
- Meta Business Partner onboarding rate increases (ops / Meta, not code)

---

## Go-live checklist (ops)

Before telling a clinic “your WhatsApp booking is live”:

- [ ] Starter+ subscription active
- [ ] Doctor completed **Connect with Meta** (or pool number assigned)
- [ ] Number status **LIVE** (templates auto-approved on connect)
- [ ] Clinic display name approved by Meta
- [ ] Booking/reminder UTILITY templates **approved** (for proactive alerts)
- [ ] Webhook working on production (`/api/v1/procto/whatsapp/webhook`)
- [ ] Test: patient sends **HELP** → bot replies
- [ ] Test: patient sends **ID photo** → bot reads name/gender and asks YES to register

Full compliance rules: [Whatsapp-Meta-Rules.md](./Whatsapp-Meta-Rules.md)

---

## Common questions

**Do patients need QR?**  
No. They can save the clinic number and message normally.

**Will scanning QR turn on the bot for the doctor?**  
No.

**Can the bot run on the doctor’s personal WhatsApp without Meta setup?**  
No. The number must be on Meta’s Business platform.

**One number per doctor or per clinic?**  
**One number per clinic (practice).** All doctors in that clinic share it.

**Can patients send lab reports on WhatsApp?**  
Yes. With an open appointment, send a *photo* or *PDF* on the clinic line — it attaches to the visit for the doctor (GlucoGuide portal + provider app). Reply *REPORT* for steps; *MY DOCS* to list files. ID photos/**PDFs** during *REGISTER* still autofill signup (OCR), not visit docs.

**How fast can we go live?**  
Pool assign can be same day. Meta approval usually **1–3 days**.

---

## Where in the code

| What | File |
|------|------|
| Assign numbers | `backend/src/services/procto/numberPool.service.ts` |
| Incoming messages | `backend/src/services/procto/whatsapp.service.ts` |
| Visit docs from WA | `backend/src/services/procto/whatsapp.visitDocs.ts` |
| Booking conversation | `backend/src/services/procto/whatsapp.orchestrator.ts` |
| Architecture decisions | `documentation/decisions.md` |

---

## Summary

**Patients message the clinic’s WhatsApp number → our server bot handles booking. Doctors connect that number through Meta (pool today, self-serve later), not by scanning a QR.**
