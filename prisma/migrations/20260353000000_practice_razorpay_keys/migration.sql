-- Clinic-owned Razorpay credentials (secrets encrypted by the API) + key used per payment link. Additive only.
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "razorpay_key_id" VARCHAR(64);
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "razorpay_key_secret_enc" TEXT;
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "razorpay_webhook_secret_enc" TEXT;
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "razorpay_verified_at" TIMESTAMPTZ(6);
ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "razorpay_key_id" VARCHAR(64);
