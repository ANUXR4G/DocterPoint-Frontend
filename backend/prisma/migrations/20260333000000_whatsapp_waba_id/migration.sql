-- Persist Meta WABA ID per clinic line (Embedded Signup)
ALTER TABLE "whatsapp_numbers" ADD COLUMN IF NOT EXISTS "waba_id" TEXT;

CREATE INDEX IF NOT EXISTS "whatsapp_numbers_waba_id_idx" ON "whatsapp_numbers"("waba_id");
