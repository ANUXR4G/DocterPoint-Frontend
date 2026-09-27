-- Clinic advance amount for WhatsApp prepay (null = full consultation fee).
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "advance_booking_amount" DOUBLE PRECISION;

-- Every Razorpay Payment Link sent to a patient (WhatsApp prepay + staff custom requests).
CREATE TABLE IF NOT EXISTS "payment_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "practice_id" UUID NOT NULL,
  "provider_id" UUID,
  "booking_id" UUID,
  "patient_id" UUID,
  "patient_name" TEXT,
  "patient_phone" VARCHAR(20) NOT NULL,
  "kind" VARCHAR(16) NOT NULL,
  "purpose" VARCHAR(250),
  "amount" INTEGER NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  "link_id" TEXT,
  "link_url" TEXT,
  "payment_id" TEXT,
  "paid_at" TIMESTAMPTZ(6),
  "expires_at" TIMESTAMPTZ(6),
  "channel" VARCHAR(16) NOT NULL,
  "requested_by_id" UUID,
  "wa_delivery" VARCHAR(16),
  "wa_error" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_requests_link_id_key" ON "payment_requests"("link_id");
CREATE INDEX IF NOT EXISTS "payment_requests_practice_id_created_at_idx" ON "payment_requests"("practice_id", "created_at");
CREATE INDEX IF NOT EXISTS "payment_requests_practice_id_provider_id_status_idx" ON "payment_requests"("practice_id", "provider_id", "status");
CREATE INDEX IF NOT EXISTS "payment_requests_booking_id_idx" ON "payment_requests"("booking_id");

DO $$ BEGIN
  ALTER TABLE "payment_requests"
    ADD CONSTRAINT "payment_requests_practice_id_fkey"
    FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "payment_requests"
    ADD CONSTRAINT "payment_requests_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "practice_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill links created by the booking prepay flow before this table existed.
INSERT INTO "payment_requests" (
  "practice_id", "provider_id", "booking_id", "patient_id", "patient_name", "patient_phone",
  "kind", "purpose", "amount", "status", "link_id", "link_url", "payment_id", "paid_at",
  "channel", "created_at"
)
SELECT
  b."practice_id", b."provider_id", b."id", b."patient_id", b."patient_name", LEFT(b."patient_phone", 20),
  'CONSULTATION', 'Consultation fee', COALESCE(b."payment_amount", 0),
  CASE WHEN b."payment_status" IN ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED') THEN b."payment_status" ELSE 'PENDING' END,
  b."payment_link_id", b."payment_link_url", b."payment_id", b."paid_at",
  'WHATSAPP_BOT', b."updated_at"
FROM "practice_bookings" b
WHERE b."payment_link_id" IS NOT NULL
ON CONFLICT ("link_id") DO NOTHING;
