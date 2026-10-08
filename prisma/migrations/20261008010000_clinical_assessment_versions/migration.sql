-- Append-only log of visit vitals / pain / allergy saves.
CREATE TABLE IF NOT EXISTS "clinical_assessment_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "booking_id" UUID NOT NULL,
  "actor_user_id" UUID,
  "actor_name" VARCHAR(160),
  "snapshot" JSONB NOT NULL,
  "saved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinical_assessment_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinical_assessment_versions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "practice_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "clinical_assessment_versions_booking_id_saved_at_idx"
  ON "clinical_assessment_versions"("booking_id", "saved_at" DESC);
