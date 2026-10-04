# GlucoGuide Patient (Expo)

Patient app for GlucoGuide — find clinics, book visits, and see WhatsApp/web bookings.

Talks to the canonical API at `backend/` (`:3001` locally). Shipped builds use `https://docterpoint-backend-production.up.railway.app` (`app.json` → `extra.apiUrl`; override with `EXPO_PUBLIC_API_URL` in `.env` for local dev).

## Auth

Patient **login and signup** use **mobile number + WhatsApp OTP** only
(from GlucoGuide `+91 99900 52082`). No email/password on these screens.

Demo phone: `9999973601` (see [login.md](../../documentation/login.md)).
