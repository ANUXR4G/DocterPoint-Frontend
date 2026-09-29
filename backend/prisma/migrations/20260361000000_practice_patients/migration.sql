-- A clinic's own patient list (patients keep one GlucoGuide identity + MRN across clinics).
CREATE TABLE IF NOT EXISTS "practice_patients" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "practice_id" UUID NOT NULL,
  "patient_user_id" UUID NOT NULL,
  "source" VARCHAR(24) NOT NULL,
  "added_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "practice_patients_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "practice_patients_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "practice_patients_patient_user_id_fkey" FOREIGN KEY ("patient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "practice_patients_practice_id_patient_user_id_key" ON "practice_patients"("practice_id", "patient_user_id");
CREATE INDEX IF NOT EXISTS "practice_patients_patient_user_id_idx" ON "practice_patients"("patient_user_id");

-- Earlier desk registrations (from the audit trail).
INSERT INTO "practice_patients" ("practice_id", "patient_user_id", "source", "added_by", "created_at")
SELECT e."practice_id", e."entity_id", 'desk_register', e."actor_user_id", e."created_at"
FROM "practice_audit_events" e
JOIN "users" u ON u."id" = e."entity_id"
WHERE e."action" = 'PATIENT_REGISTERED' AND e."entity_id" IS NOT NULL
ON CONFLICT ("practice_id", "patient_user_id") DO NOTHING;
