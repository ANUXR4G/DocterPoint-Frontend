-- Pre-visit payment via Razorpay Payment Link (WhatsApp "pay before appointment").
ALTER TABLE "practice_bookings" ADD COLUMN IF NOT EXISTS "payment_status" VARCHAR(16);
ALTER TABLE "practice_bookings" ADD COLUMN IF NOT EXISTS "payment_amount" INTEGER;
ALTER TABLE "practice_bookings" ADD COLUMN IF NOT EXISTS "payment_link_id" TEXT;
ALTER TABLE "practice_bookings" ADD COLUMN IF NOT EXISTS "payment_link_url" TEXT;
ALTER TABLE "practice_bookings" ADD COLUMN IF NOT EXISTS "payment_id" TEXT;
ALTER TABLE "practice_bookings" ADD COLUMN IF NOT EXISTS "paid_at" TIMESTAMPTZ(6);
CREATE INDEX IF NOT EXISTS "practice_bookings_payment_link_id_idx" ON "practice_bookings"("payment_link_id");
