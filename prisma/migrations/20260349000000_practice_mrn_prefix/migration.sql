-- Clinic/doctor initials prefix for patient MRNs (e.g. Priya Clinic → PC → PCMR00000001).
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "mrn_prefix" VARCHAR(6);

CREATE UNIQUE INDEX IF NOT EXISTS "practices_mrn_prefix_key"
  ON "practices"("mrn_prefix")
  WHERE "mrn_prefix" IS NOT NULL;
