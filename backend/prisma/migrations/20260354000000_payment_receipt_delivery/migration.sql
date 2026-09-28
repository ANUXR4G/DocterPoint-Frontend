ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "receipt_delivery" VARCHAR(16);
ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "receipt_error" TEXT;
