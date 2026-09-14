-- Patient identity documents (optional at registration)
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "aadhar_number" VARCHAR(12);
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "pan_number" VARCHAR(10);
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "aadhar_card_src" TEXT;
