-- Meta Cloud API only: drop unused BSP provider enum values.
-- Remap any legacy BSP rows, then recreate the enum with MOCK | META_CLOUD_API.

UPDATE "whatsapp_numbers"
SET "provider" = 'META_CLOUD_API'
WHERE "provider"::text LIKE 'BSP_%';

ALTER TABLE "whatsapp_numbers" ALTER COLUMN "provider" DROP DEFAULT;

ALTER TYPE "ProvisioningProvider" RENAME TO "ProvisioningProvider_old";

CREATE TYPE "ProvisioningProvider" AS ENUM ('MOCK', 'META_CLOUD_API');

ALTER TABLE "whatsapp_numbers"
  ALTER COLUMN "provider" TYPE "ProvisioningProvider"
  USING (
    CASE
      WHEN "provider"::text = 'MOCK' THEN 'MOCK'::"ProvisioningProvider"
      ELSE 'META_CLOUD_API'::"ProvisioningProvider"
    END
  );

ALTER TABLE "whatsapp_numbers"
  ALTER COLUMN "provider" SET DEFAULT 'MOCK'::"ProvisioningProvider";

DROP TYPE "ProvisioningProvider_old";
