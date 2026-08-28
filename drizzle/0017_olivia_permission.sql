ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "canUseOlivia" boolean DEFAULT false NOT NULL;

UPDATE "users"
SET "canUseOlivia" = true
WHERE lower(coalesce("role", '')) = 'super_admin';
