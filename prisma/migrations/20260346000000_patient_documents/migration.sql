-- Branch F: general patient documents (not tied to a visit)
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "documents" JSONB;
