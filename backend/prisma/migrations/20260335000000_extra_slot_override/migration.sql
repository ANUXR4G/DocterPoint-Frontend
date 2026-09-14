-- Allow clinic admins to add extra bookable slots on specific dates.
ALTER TYPE "OverrideType" ADD VALUE IF NOT EXISTS 'EXTRA_SLOT';
