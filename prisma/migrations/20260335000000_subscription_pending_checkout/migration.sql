-- Defer plan changes until Razorpay checkout completes.
ALTER TABLE "practice_subscriptions"
  ADD COLUMN IF NOT EXISTS "pending_plan_id" UUID,
  ADD COLUMN IF NOT EXISTS "pending_razorpay_subscription_id" TEXT;

DO $$ BEGIN
  ALTER TABLE "practice_subscriptions"
    ADD CONSTRAINT "practice_subscriptions_pending_plan_id_fkey"
    FOREIGN KEY ("pending_plan_id") REFERENCES "docline_plans"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "practice_subscriptions_pending_razorpay_subscription_id_key"
  ON "practice_subscriptions"("pending_razorpay_subscription_id");
