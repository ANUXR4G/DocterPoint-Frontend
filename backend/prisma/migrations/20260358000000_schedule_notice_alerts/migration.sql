ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "schedule_notice_hours" INTEGER NOT NULL DEFAULT 48;

CREATE TABLE IF NOT EXISTS "schedule_change_alerts" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'HELD',
    "notify_whatsapp" BOOLEAN NOT NULL,
    "notify_email" BOOLEAN NOT NULL,
    "old_when" VARCHAR(160) NOT NULL,
    "reason" VARCHAR(250),
    "outcome" JSONB,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    CONSTRAINT "schedule_change_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "schedule_change_alerts_practice_id_provider_id_status_idx"
    ON "schedule_change_alerts"("practice_id", "provider_id", "status");
CREATE INDEX IF NOT EXISTS "schedule_change_alerts_status_created_at_idx"
    ON "schedule_change_alerts"("status", "created_at");

DO $$ BEGIN
    ALTER TABLE "schedule_change_alerts" ADD CONSTRAINT "schedule_change_alerts_booking_id_fkey"
        FOREIGN KEY ("booking_id") REFERENCES "practice_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
