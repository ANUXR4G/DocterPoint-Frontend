-- Clinic owners are not bookable doctors until they open a schedule.
-- Doctor rows stay (legacy appointments reference them). Bookings are unchanged.
UPDATE practice_members
SET doctor_id = NULL
WHERE role = 'PRACTICE_OWNER';
