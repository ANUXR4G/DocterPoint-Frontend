-- AlterTable
ALTER TABLE "doctors" ADD COLUMN IF NOT EXISTS "license_no" TEXT;

-- AlterTable
ALTER TABLE "provider_schedules" ADD COLUMN IF NOT EXISTS "break_start_time" TEXT;
ALTER TABLE "provider_schedules" ADD COLUMN IF NOT EXISTS "break_end_time" TEXT;
