-- AlterTable
ALTER TABLE "notification_events" ADD COLUMN IF NOT EXISTS "dismissed_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notification_events_practice_id_dismissed_at_created_at_idx"
  ON "notification_events"("practice_id", "dismissed_at", "created_at");
