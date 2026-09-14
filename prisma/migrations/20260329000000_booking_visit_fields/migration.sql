-- AlterTable
ALTER TABLE "practice_bookings" ADD COLUMN IF NOT EXISTS "doctor_remarks" TEXT;
ALTER TABLE "practice_bookings" ADD COLUMN IF NOT EXISTS "medicines" JSONB;
ALTER TABLE "practice_bookings" ADD COLUMN IF NOT EXISTS "documents" JSONB;
