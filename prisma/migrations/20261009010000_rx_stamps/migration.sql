-- Clinic and doctor seal images for the prescription preview.
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "stamp_src" TEXT;
ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "stamp_src" TEXT;
