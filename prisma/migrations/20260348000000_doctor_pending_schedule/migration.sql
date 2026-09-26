-- Deferred Time slots ↔ Token queue switch (applies from the next local day).
ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "pending_schedule" JSONB;
ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "pending_schedule_effective" DATE;
