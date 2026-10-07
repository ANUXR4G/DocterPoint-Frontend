-- Clinical masters (practice) + visit clinical assessment (booking)
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "clinical_masters" JSONB;
ALTER TABLE "practice_bookings" ADD COLUMN IF NOT EXISTS "clinical_assessment" JSONB;
