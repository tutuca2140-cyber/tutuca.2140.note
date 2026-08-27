ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "canUseOlivia" boolean DEFAULT false NOT NULL;

UPDATE "users"
SET "canUseOlivia" = true
WHERE "role" = 'super_admin';
