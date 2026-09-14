-- AlterTable
ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "appointment_validity_days" INTEGER NOT NULL DEFAULT 7;

-- AlterTable
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "registration_no" TEXT;
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "phone" VARCHAR(20);
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "email" VARCHAR(256);
