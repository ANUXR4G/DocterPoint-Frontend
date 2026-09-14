-- DocLine practice reviews (soft verification)
CREATE TABLE IF NOT EXISTS "practice_reviews" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "author_name" TEXT NOT NULL,
    "author_phone" VARCHAR(20),
    "rating" INTEGER NOT NULL,
    "body" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "practice_reviews_practice_id_is_published_idx"
  ON "practice_reviews"("practice_id", "is_published");

DO $$ BEGIN
  ALTER TABLE "practice_reviews"
    ADD CONSTRAINT "practice_reviews_practice_id_fkey"
    FOREIGN KEY ("practice_id") REFERENCES "practices"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
