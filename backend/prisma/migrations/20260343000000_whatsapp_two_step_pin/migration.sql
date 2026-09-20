-- AlterTable
ALTER TABLE "whatsapp_numbers" ADD COLUMN IF NOT EXISTS "two_step_pin" VARCHAR(6);
