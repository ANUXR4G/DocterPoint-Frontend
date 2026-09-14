-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "text_size" VARCHAR(16) DEFAULT 'medium';
