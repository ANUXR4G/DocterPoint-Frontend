-- Family / dependent profile fields for WhatsApp Branch C
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "relationship" VARCHAR(64);

-- Widen national ID column (Aadhaar 12 / Emirates ID up to 15+ formatting)
ALTER TABLE "patients" ALTER COLUMN "aadhar_number" TYPE VARCHAR(32);
