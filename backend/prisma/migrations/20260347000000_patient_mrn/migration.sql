-- Unique Medical Record Number (MRN) for every patient.
CREATE SEQUENCE IF NOT EXISTS patient_mrn_seq START WITH 1 INCREMENT BY 1;

ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "mrn" VARCHAR(32);

-- Backfill existing rows from the sequence (zero-padded).
UPDATE "patients"
SET "mrn" = 'MR' || lpad(nextval('patient_mrn_seq')::text, 8, '0')
WHERE "mrn" IS NULL OR btrim("mrn") = '';

-- Advance sequence past any existing numeric MRNs (safe if already ahead).
SELECT setval(
  'patient_mrn_seq',
  GREATEST(
    (SELECT COALESCE(MAX(NULLIF(regexp_replace("mrn", '[^0-9]', '', 'g'), '')::bigint), 0) FROM "patients"),
    (SELECT last_value FROM patient_mrn_seq)
  )
);

ALTER TABLE "patients" ALTER COLUMN "mrn" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "patients_mrn_key" ON "patients"("mrn");
