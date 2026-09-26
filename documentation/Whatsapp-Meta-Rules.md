# WhatsApp Meta Rules — GlucoGuide

This document is the **account-safety playbook** for clinic WhatsApp lines on Meta Cloud API (or a BSP that submits to Meta). Follow it so WABAs are not restricted, paused, or banned.

For **how the bot works, QR, and doctor number setup** (plain language), see [WhatsApp-How-It-Works.md](./WhatsApp-How-It-Works.md).

Official references (read alongside this doc):

- [Template fundamentals](https://developers.facebook.com/docs/whatsapp/message-templates/guidelines)
- [Template categorization](https://developers.facebook.com/docs/whatsapp/updates-to-pricing/new-template-guidelines/)
- [Commerce / Business Policy violations](https://developers.facebook.com/docs/whatsapp/overview/policy-enforcement/violations/)
- [WhatsApp Business Messaging Policy](https://www.whatsapp.com/legal/business-policy)

Code sources of truth:

| File | Role |
|------|------|
| `backend/src/services/procto/whatsapp.metaTemplates.ts` | Meta UTILITY catalog (`metaName`, body, named params) |
| `backend/src/services/procto/whatsapp.templates.ts` | Session bot copy + free-form fallbacks |
| `backend/src/services/procto/whatsapp.client.ts` | `sendWhatsAppTemplate` / `sendNotificationWhatsApp` |
| `backend/src/services/procto/whatsapp.policy.ts` | AI disclosure, clinical guardrails, STOP/START |
| `Whatsapp-Meta-Rules.md` (this file) | Policy + ops checklist |

---

## 1. Absolute rules (ban risks)

1. **Never send free-form text outside an open customer service window** for proactive alerts (reminders, confirmations after the window closed). Use an **APPROVED** template message.
2. **Never miscategorize MARKETING as UTILITY.** Appointment confirm / remind / cancel / reschedule / queue-ready = **UTILITY** only. No promos, discounts, “book more packages”, upsells, or newsletters on clinic lines.
3. **Opt-in before first proactive template.** User must clearly agree to receive WhatsApp appointment messages (web booking checkbox, registration flow, or inbound message that starts the chat). Document the channel and timestamp.
4. **Honour STOP.** Every patient utility template includes opt-out language. Reply `STOP` sets `waOptOut` and blocks further proactive sends. Reply `START` restores alerts.
5. **No medical advice on the bot.** Diagnose / prescribe / dosage / symptom advice is forbidden — escalate to HUMAN / clinic.
6. **Disclose AI.** First reply states the assistant is AI, not a doctor, and offers HUMAN handoff.
7. **Never send passwords, OTPs for other products, or payment card data** on WhatsApp. (GlucoGuide no longer sends temp passwords in chat.)
8. **One quality WABA per brand.** Do not spam the same user from multiple clinic numbers for the same visit. Keep quality rating High / Medium.
9. **Display name & business verification** must match the clinic (no misleading hospital names).
10. **Do not scrape or message contacts who never opted in** (cold outreach = high ban risk).

---

## 2. Customer service window vs templates

| Situation | Allowed |
|-----------|---------|
| User messaged the business line within **24 hours** | Free-form session replies (booking bot) |
| Outside 24h, or first outbound reminder | **Template** only (`type: template`) |
| User replies after a template | New 24h window opens |

**One Meta Phone Number ID per clinic.** Never stamp `WHATSAPP_PHONE_NUMBER_ID` onto every LIVE pool row — inbound routing must resolve by the clinic’s own display phone / unique Meta id. Shared Meta ids collapse traffic onto one practice.

**GlucoGuide platform OTP line:** `+91 99900 52082` / Meta id `1378039178715653` (`GLUCOGUIDE_OTP_PHONE` / `GLUCOGUIDE_OTP_PHONE_NUMBER_ID`). Patient login OTPs are sent **only** from this number (`glucoguide_login_otp` AUTHENTICATION template, text fallback). Never send login OTPs from clinic pool lines.

GlucoGuide notification worker prefers Meta templates via `sendNotificationWhatsApp`. Session bot replies stay free-form (user-initiated). Doctor → patient care-chat (`ChatService.sendDirectMessage`) mirrors to WhatsApp: session text inside the 24h window, otherwise `CLINIC_CARE_MESSAGE` UTILITY template.

---

## 3. Template catalog (submit these to Meta)

All are **UTILITY**, language `en`, named parameters. Create in WhatsApp Manager or Business Management API, then set `MessageTemplate.status = APPROVED` and keep `metaName` in sync.

| Internal key | Meta name (`metaName`) | Purpose |
|--------------|------------------------|---------|
| `BOOKING_CONFIRMATION` | `docline_booking_confirm` | After book |
| `REMINDER` | `docline_appointment_reminder` | ~24h before slot (day-before for tokens) and ~30 min before / morning-of token |
| `CANCELLATION` | `docline_booking_cancelled` | Cancel |
| `RESCHEDULE` | `docline_booking_rescheduled` | Time change |
| `OVERRIDE_IMPACT` | `docline_schedule_change` | Clinic leave / block impact |
| `QUEUE_ALERT` | `docline_queue_ready` | You’re up next |
| `CLINIC_NEW_BOOKING` | `docline_clinic_new_booking` | Staff alert |
| `CLINIC_CANCEL` | `docline_clinic_booking_cancelled` | Staff alert |
| `CLINIC_RESCHEDULE` | `docline_clinic_booking_rescheduled` | Staff alert |
| `CLINIC_QUEUE_ALERT` | `docline_clinic_queue_alert` | Staff alert |
| `CLINIC_CARE_MESSAGE` | `docline_clinic_care_message` | Doctor/clinic care-chat → patient (outside 24h window) |
| `VISIT_SUMMARY` | `docline_visit_summary` | After visit complete: remarks, medicines, document count → patient WhatsApp |
| `PRESCRIPTION_UPDATE` | `docline_prescription` | When doctor saves/updates medicines mid-visit → patient WhatsApp |

Bodies live in `whatsapp.metaTemplates.ts`. Sync into DB:

```bash
# Via seed
cd backend && yarn seed

# Or ops API (admin auth)
POST /api/v1/procto/admin/templates/sync-meta
```

### Example Meta create payload (named params)

```json
{
  "name": "docline_booking_confirm",
  "language": "en",
  "category": "UTILITY",
  "parameter_format": "named",
  "components": [
    {
      "type": "BODY",
      "text": "Your appointment at {{practice_name}} is confirmed.\nWhen: {{when_label}}\nDoctor: {{provider_name}}\nLocation: {{location}}\nReply CANCEL to cancel, RESCHEDULE to change, or STATUS to view.\nReply STOP to opt out of appointment alerts.",
      "example": {
        "body_text_named_params": [
          { "param_name": "practice_name", "example": "City Care Clinic" },
          { "param_name": "when_label", "example": "26 Aug 2026, 10:30 AM" },
          { "param_name": "provider_name", "example": "Dr Anjali Mehta" },
          { "param_name": "location", "example": "Road 11, Gulshan-2, Gulshan" }
        ]
      }
    }
  ]
}
```

---

## 4. What must NOT appear in UTILITY templates

Meta will recategorize or reject (and repeated abuse can suspend utility creation):

- “Special offer”, “discount”, “package deal”, “refer a friend for credits”
- Upsell to other clinics / products / GlucoGuide marketing
- Urgency hacks unrelated to the visit (“Last chance!”)
- Content that looks like ads or engagement bait
- Variable abuse (putting long marketing copy inside `{{1}}`)

Keep variables short and factual: clinic name, datetime, doctor, location, token #.

---

## 5. Opt-in checklist (per patient / clinic)

Before sending the first proactive template to a number:

- [ ] User booked on web/app with WhatsApp notify consent, **or**
- [ ] User messaged the clinic WA line first (session), **or**
- [ ] Explicit verbal/written consent recorded by clinic staff
- [ ] Number is the patient’s own phone (E.164)
- [ ] Clinic line is LIVE / display name approved

Store consent with booking (`channel`, timestamp). STOP must always win.

---

## 6. Quality & throughput (avoid Low Quality → pause)

- Prefer **fewer, higher-value** templates (confirm + one reminder). Do not stack 5 reminders.
- Send reminders in local clinic timezone; avoid night hours when possible.
- Monitor template quality in WhatsApp Manager (High / Medium / Low).
- Fix Low Quality immediately (copy clarity, wrong times, spam complaints).
- Respect Meta messaging limits as the WABA tier grows; do not burst thousands of cold templates.
- On `account_update` / template quality webhooks: alert ops, pause the template in GlucoGuide (`MessageTemplate.status`).

---

## 7. Bot session behaviour (safe)

| Do | Don’t |
|----|-------|
| AI disclosure on first message | Pretend to be a human doctor |
| FAQ from clinic `faqKb` only | Invent clinical advice |
| HUMAN handoff | Diagnose / prescribe |
| HELP menu for bookings | Blast marketing from the bot |
| STOP / START | Ignore opt-out |
| Short in-session confirm/cancel/reschedule ack | Send the same patient UTILITY template again in the same turn |

When the WhatsApp bot already acknowledged book / cancel / reschedule in-session, GlucoGuide sets `skipPatientNotification` so only the **clinic** `CLINIC_*` template is enqueued. Web/app bookings still get the full patient UTILITY template.

---

## 8. Provisioning & go-live gate

Do not mark a pool number **LIVE** until:

1. Business / display name approved  
2. Phone verified  
3. **All required UTILITY templates APPROVED** for that WABA  
4. Webhook signature verification enabled (`WHATSAPP_APP_SECRET`)  
5. Ops can sync templates (`POST .../templates/sync-meta`) and see APPROVED in admin  

SLA remains Meta-controlled (often 24–72h). Never promise “instant WhatsApp live” in sales copy.

---

## 9. Incident response (quality drop / restriction)

1. Stop proactive sends for that WABA (feature flag / pause LIVE numbers).  
2. Read Meta email / `account_update` webhook reason.  
3. Pause offending templates; fix copy; resubmit if needed.  
4. Audit recent sends for opt-out misses or miscategorization.  
5. Resume only after quality recovers and Meta clears the restriction.

---

## 10. GlucoGuide engineering guarantees

Implemented to reduce ban risk:

- UTILITY-only catalog; admin API rejects `MARKETING` category creates  
- **Single body source:** `backend/src/services/procto/whatsapp.metaTemplates.ts` — free-form notification fallbacks render from the same catalog (no drifted copy)  
- Notification path sends **templates first**, free-form fallback only if Meta rejects / sim mode  
- WhatsApp bot path: short session ack + **no duplicate** patient UTILITY for confirm/cancel/reschedule (`skipPatientNotification`)  
- Patient STOP → `waOptOut` → worker skips proactive alerts  
- Opt-out line already included in patient Meta bodies (fallback uses catalog as-is)  
- No passwords in WhatsApp registration replies  
- Clinical outbound guard + AI disclosure + HUMAN handoff  

---

## 11. Quick ops commands

```bash
# Sync catalog into message_templates
curl -X POST "$API/api/v1/procto/admin/templates/sync-meta" -H "Cookie: …"

# List templates
curl "$API/api/v1/procto/admin/templates" -H "Cookie: …"
```

After Meta approves each template in Manager, update GlucoGuide row `status` to `APPROVED` (admin UI or DB). Only then rely on production template sends without fallback risk.

---

*Last aligned with Meta template categorization enforcement (2025+) and GlucoGuide WhatsApp implementation. Re-check Meta docs before each major go-live.*
