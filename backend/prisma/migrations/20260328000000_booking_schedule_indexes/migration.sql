-- Deduplicate schedules before unique constraint (keep newest row per day)
DELETE FROM provider_schedules a
USING provider_schedules b
WHERE a.practice_id = b.practice_id
  AND a.provider_id = b.provider_id
  AND a.location_id = b.location_id
  AND a.day_of_week = b.day_of_week
  AND a.created_at < b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS "provider_schedules_practice_id_provider_id_location_id_day_of_week_key"
  ON "provider_schedules"("practice_id", "provider_id", "location_id", "day_of_week");

CREATE INDEX IF NOT EXISTS "provider_schedules_practice_id_provider_id_location_id_day_of_week_is_active_idx"
  ON "provider_schedules"("practice_id", "provider_id", "location_id", "day_of_week", "is_active");

CREATE INDEX IF NOT EXISTS "provider_schedules_provider_id_day_of_week_is_active_idx"
  ON "provider_schedules"("provider_id", "day_of_week", "is_active");

CREATE INDEX IF NOT EXISTS "schedule_overrides_practice_id_provider_id_date_idx"
  ON "schedule_overrides"("practice_id", "provider_id", "date");

CREATE INDEX IF NOT EXISTS "practice_bookings_practice_id_provider_id_status_slot_start_idx"
  ON "practice_bookings"("practice_id", "provider_id", "status", "slot_start");

CREATE INDEX IF NOT EXISTS "practice_bookings_practice_id_provider_id_session_date_status_idx"
  ON "practice_bookings"("practice_id", "provider_id", "session_date", "status");

CREATE INDEX IF NOT EXISTS "practice_bookings_patient_phone_idx"
  ON "practice_bookings"("patient_phone");

CREATE INDEX IF NOT EXISTS "practice_bookings_patient_id_idx"
  ON "practice_bookings"("patient_id");
