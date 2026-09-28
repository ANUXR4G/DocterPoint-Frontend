-- Conflict resolution for schedule changes: keep a booking as an "Override slot", record why a visit was cancelled.
ALTER TABLE "practice_bookings" ADD COLUMN IF NOT EXISTS "override_slot" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "practice_bookings" ADD COLUMN IF NOT EXISTS "override_note" VARCHAR(250);
ALTER TABLE "practice_bookings" ADD COLUMN IF NOT EXISTS "cancel_reason" VARCHAR(250);
