-- Master specialty catalog, doctor links, and the Nurse clinic role.
-- NURSE is added but not used in this migration (Postgres cannot use a new
-- enum value in the same transaction that adds it).

CREATE TABLE "specialties" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "specialties_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "specialties_name_key" ON "specialties"("name");
CREATE UNIQUE INDEX "specialties_slug_key" ON "specialties"("slug");

CREATE TABLE "doctor_specialties" (
  "doctor_id" UUID NOT NULL,
  "specialty_id" UUID NOT NULL,
  CONSTRAINT "doctor_specialties_pkey" PRIMARY KEY ("doctor_id", "specialty_id")
);

ALTER TABLE "doctor_specialties"
  ADD CONSTRAINT "doctor_specialties_doctor_id_fkey"
  FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "doctor_specialties"
  ADD CONSTRAINT "doctor_specialties_specialty_id_fkey"
  FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "specialties" ("id", "name", "slug", "is_active", "created_at")
VALUES
  (gen_random_uuid(), 'Dermatologist', 'dermatologist', true, NOW()),
  (gen_random_uuid(), 'Gynecologist', 'gynecologist', true, NOW()),
  (gen_random_uuid(), 'Orthopedist', 'orthopedist', true, NOW()),
  (gen_random_uuid(), 'General Physician', 'general-physician', true, NOW()),
  (gen_random_uuid(), 'Pediatrician', 'pediatrician', true, NOW()),
  (gen_random_uuid(), 'Dentist', 'dentist', true, NOW()),
  (gen_random_uuid(), 'Cardiologist', 'cardiologist', true, NOW()),
  (gen_random_uuid(), 'ENT', 'ent', true, NOW()),
  (gen_random_uuid(), 'Multi-specialty', 'multi-specialty', true, NOW()),
  (gen_random_uuid(), 'Endocrinology', 'endocrinology', true, NOW())
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "specialties" ("id", "name", "slug", "is_active", "created_at")
SELECT gen_random_uuid(), src.name, src.slug, true, NOW()
FROM (
  SELECT DISTINCT ON (slug) name, slug
  FROM (
    SELECT btrim(specialty) AS name,
      btrim(regexp_replace(lower(btrim(specialty)), '[^a-z0-9]+', '-', 'g'), '-') AS slug
    FROM "practices"
    WHERE specialty IS NOT NULL AND length(btrim(specialty)) > 1
    UNION ALL
    SELECT btrim(split_part(description, ' — ', 1)) AS name,
      btrim(regexp_replace(lower(btrim(split_part(description, ' — ', 1))), '[^a-z0-9]+', '-', 'g'), '-') AS slug
    FROM "doctors"
    WHERE description LIKE '% — %'
      AND btrim(split_part(description, ' — ', 1)) NOT IN (
        'Clinic owner',
        'Newly registered doctor',
        'Clinic staff doctor'
      )
  ) raw
  WHERE length(slug) > 1 AND length(name) > 1
  ORDER BY slug, length(name)
) src
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "doctor_specialties" ("doctor_id", "specialty_id")
SELECT d.id, s.id
FROM "doctors" d
JOIN "specialties" s
  ON s.slug = btrim(regexp_replace(lower(btrim(split_part(d.description, ' — ', 1))), '[^a-z0-9]+', '-', 'g'), '-')
WHERE d.description LIKE '% — %'
  AND btrim(split_part(d.description, ' — ', 1)) NOT IN (
    'Clinic owner',
    'Newly registered doctor',
    'Clinic staff doctor'
  )
ON CONFLICT DO NOTHING;

INSERT INTO "doctor_specialties" ("doctor_id", "specialty_id")
SELECT pm.user_id, s.id
FROM "practice_members" pm
JOIN "practices" p ON p.id = pm.practice_id
JOIN "doctors" d ON d.id = pm.user_id
JOIN "specialties" s
  ON s.slug = btrim(regexp_replace(lower(btrim(p.specialty)), '[^a-z0-9]+', '-', 'g'), '-')
WHERE pm.is_active = true
  AND pm.role = 'PRACTICE_OWNER'
  AND p.specialty IS NOT NULL
  AND length(btrim(p.specialty)) > 1
  AND NOT EXISTS (
    SELECT 1 FROM "doctor_specialties" ds WHERE ds.doctor_id = pm.user_id
  )
ON CONFLICT DO NOTHING;

ALTER TYPE "PracticeMemberRole" ADD VALUE IF NOT EXISTS 'NURSE';
