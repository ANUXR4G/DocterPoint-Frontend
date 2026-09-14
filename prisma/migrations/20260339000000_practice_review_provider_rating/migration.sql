-- AlterTable
ALTER TABLE "practice_reviews" ADD COLUMN IF NOT EXISTS "provider_id" UUID;
ALTER TABLE "practice_reviews" ADD COLUMN IF NOT EXISTS "provider_rating" INTEGER;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "practice_reviews_provider_id_is_published_idx" ON "practice_reviews"("provider_id", "is_published");
