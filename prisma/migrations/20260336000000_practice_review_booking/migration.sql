-- Link reviews to completed visits (one review per booking).
ALTER TABLE "practice_reviews"
  ADD COLUMN "booking_id" UUID,
  ADD COLUMN "patient_id" UUID;

CREATE UNIQUE INDEX "practice_reviews_booking_id_key" ON "practice_reviews"("booking_id");

ALTER TABLE "practice_reviews"
  ADD CONSTRAINT "practice_reviews_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "practice_bookings"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
