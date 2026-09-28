-- Schedule versioning: existing rows become the baseline version (2000-01-01).
ALTER TABLE "provider_schedules" ADD COLUMN IF NOT EXISTS "effective_from" DATE NOT NULL DEFAULT DATE '2000-01-01';

CREATE UNIQUE INDEX IF NOT EXISTS "provider_schedules_version_day_key"
  ON "provider_schedules" ("practice_id", "provider_id", "location_id", "day_of_week", "effective_from");

DROP INDEX IF EXISTS "provider_schedules_practice_id_provider_id_location_id_day__key";

CREATE INDEX IF NOT EXISTS "provider_schedules_provider_id_effective_from_idx"
  ON "provider_schedules" ("provider_id", "effective_from");
