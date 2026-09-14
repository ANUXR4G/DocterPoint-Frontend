-- DocLine Phase 0: WhatsApp number pool, plans, subscriptions, FAQ/directory flags

-- CreateEnum
CREATE TYPE "WhatsAppNumberStatus" AS ENUM (
  'AVAILABLE',
  'ASSIGNED',
  'VERIFYING',
  'DISPLAY_NAME_PENDING',
  'TEMPLATES_PENDING',
  'LIVE',
  'SUSPENDED',
  'RELEASED'
);

CREATE TYPE "ProvisioningProvider" AS ENUM (
  'MOCK',
  'META_CLOUD_API',
  'BSP_GUPSHUP',
  'BSP_INTERAKT',
  'BSP_WATI',
  'BSP_AISENSY'
);

CREATE TYPE "PracticeSubscriptionStatus" AS ENUM (
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'GRACE',
  'SUSPENDED',
  'CANCELLED'
);

CREATE TYPE "MessageTemplateStatus" AS ENUM (
  'DRAFT',
  'PENDING',
  'APPROVED',
  'REJECTED'
);

-- AlterTable practices
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "faq_kb" JSONB;
ALTER TABLE "practices" ADD COLUMN IF NOT EXISTS "is_directory_listed" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable whatsapp_conversations
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'bot_active';

-- CreateTable whatsapp_numbers
CREATE TABLE IF NOT EXISTS "whatsapp_numbers" (
  "id" UUID NOT NULL,
  "phone_number" VARCHAR(20) NOT NULL,
  "waba_phone_number_id" TEXT,
  "display_name" TEXT,
  "status" "WhatsAppNumberStatus" NOT NULL DEFAULT 'AVAILABLE',
  "provider" "ProvisioningProvider" NOT NULL DEFAULT 'MOCK',
  "practice_id" UUID,
  "verification_status" TEXT,
  "display_name_status" TEXT,
  "templates_status" TEXT,
  "activated_at" TIMESTAMPTZ(6),
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_numbers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_numbers_phone_number_key" ON "whatsapp_numbers"("phone_number");
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_numbers_practice_id_key" ON "whatsapp_numbers"("practice_id");
CREATE INDEX IF NOT EXISTS "whatsapp_numbers_status_idx" ON "whatsapp_numbers"("status");

-- CreateTable docline_plans
CREATE TABLE IF NOT EXISTS "docline_plans" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "price_monthly_inr" INTEGER NOT NULL,
  "price_yearly_inr" INTEGER,
  "max_bookings_per_month" INTEGER,
  "features" JSONB NOT NULL DEFAULT '{}',
  "razorpay_plan_id" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "docline_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable practice_subscriptions
CREATE TABLE IF NOT EXISTS "practice_subscriptions" (
  "id" UUID NOT NULL,
  "practice_id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "status" "PracticeSubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
  "razorpay_subscription_id" TEXT,
  "razorpay_customer_id" TEXT,
  "current_period_start" TIMESTAMPTZ(6),
  "current_period_end" TIMESTAMPTZ(6),
  "grace_period_end" TIMESTAMPTZ(6),
  "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
  "cancelled_at" TIMESTAMPTZ(6),
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "practice_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "practice_subscriptions_practice_id_key" ON "practice_subscriptions"("practice_id");
CREATE UNIQUE INDEX IF NOT EXISTS "practice_subscriptions_razorpay_subscription_id_key" ON "practice_subscriptions"("razorpay_subscription_id");
CREATE INDEX IF NOT EXISTS "practice_subscriptions_status_idx" ON "practice_subscriptions"("status");

-- CreateTable message_templates
CREATE TABLE IF NOT EXISTS "message_templates" (
  "id" UUID NOT NULL,
  "practice_id" UUID,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'en',
  "status" "MessageTemplateStatus" NOT NULL DEFAULT 'DRAFT',
  "body" TEXT NOT NULL,
  "meta_name" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "message_templates_practice_id_status_idx" ON "message_templates"("practice_id", "status");

-- FKs
DO $$ BEGIN
  ALTER TABLE "whatsapp_numbers"
    ADD CONSTRAINT "whatsapp_numbers_practice_id_fkey"
    FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "practice_subscriptions"
    ADD CONSTRAINT "practice_subscriptions_practice_id_fkey"
    FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "practice_subscriptions"
    ADD CONSTRAINT "practice_subscriptions_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "docline_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "message_templates"
    ADD CONSTRAINT "message_templates_practice_id_fkey"
    FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
