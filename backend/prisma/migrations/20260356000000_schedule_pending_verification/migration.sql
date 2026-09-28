-- Schedule versions that clash with booked visits are saved as PENDING_VERIFICATION
-- and ignored by the slot engine until a clinic user activates them.
DO $$ BEGIN
  CREATE TYPE "ScheduleVersionStatus" AS ENUM ('ACTIVE', 'PENDING_VERIFICATION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "provider_schedules"
  ADD COLUMN IF NOT EXISTS "status" "ScheduleVersionStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "submitted_by_id" UUID;

DROP INDEX IF EXISTS "provider_schedules_version_day_key";
CREATE UNIQUE INDEX IF NOT EXISTS "provider_schedules_version_day_key"
  ON "provider_schedules" ("practice_id", "provider_id", "location_id", "day_of_week", "effective_from", "status");

CREATE INDEX IF NOT EXISTS "provider_schedules_provider_id_status_idx"
  ON "provider_schedules" ("provider_id", "status");
