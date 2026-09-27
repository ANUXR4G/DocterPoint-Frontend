-- When the patient reached the clinic (set on first move to WAITING / IN_PROGRESS / COMPLETED).
ALTER TABLE "practice_bookings" ADD COLUMN IF NOT EXISTS "arrived_at" TIMESTAMPTZ(6);
