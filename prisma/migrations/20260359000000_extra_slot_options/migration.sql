-- Quick-add popover: per-window slot length, patients per slot, and repeat series.
ALTER TABLE "schedule_overrides" ADD COLUMN IF NOT EXISTS "slot_interval_min" INTEGER;
ALTER TABLE "schedule_overrides" ADD COLUMN IF NOT EXISTS "capacity" INTEGER;
ALTER TABLE "schedule_overrides" ADD COLUMN IF NOT EXISTS "series_id" UUID;

CREATE INDEX IF NOT EXISTS "schedule_overrides_series_id_idx" ON "schedule_overrides"("series_id");
