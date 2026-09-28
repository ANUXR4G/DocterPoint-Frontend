-- Who added a schedule override (calendar quick-add / settings).
ALTER TABLE "schedule_overrides" ADD COLUMN IF NOT EXISTS "created_by" UUID;

-- Append-only staff action log for administrative reporting.
CREATE TABLE IF NOT EXISTS "practice_audit_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "practice_id" UUID NOT NULL,
  "actor_user_id" UUID,
  "actor_name" VARCHAR(160),
  "actor_role" VARCHAR(32),
  "action" VARCHAR(48) NOT NULL,
  "entity_type" VARCHAR(32),
  "entity_id" UUID,
  "provider_id" UUID,
  "summary" TEXT NOT NULL,
  "meta" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "practice_audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "practice_audit_events_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "practice_audit_events_practice_id_created_at_idx" ON "practice_audit_events"("practice_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "practice_audit_events_practice_id_action_created_at_idx" ON "practice_audit_events"("practice_id", "action", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "practice_audit_events_practice_id_provider_id_created_at_idx" ON "practice_audit_events"("practice_id", "provider_id", "created_at" DESC);
