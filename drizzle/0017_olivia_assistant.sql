ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "oliviaEnabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "oliviaPlan" varchar(32) DEFAULT 'basic' NOT NULL;

CREATE TABLE IF NOT EXISTS "olivia_settings" (
  "id" serial PRIMARY KEY,
  "enabled" boolean DEFAULT true NOT NULL,
  "allowClientQueries" boolean DEFAULT true NOT NULL,
  "allowContractQueries" boolean DEFAULT true NOT NULL,
  "allowPaymentQueries" boolean DEFAULT true NOT NULL,
  "allowDueDateQueries" boolean DEFAULT true NOT NULL,
  "allowSummaries" boolean DEFAULT true NOT NULL,
  "allowChanges" boolean DEFAULT false NOT NULL,
  "requireConfirmation" boolean DEFAULT true NOT NULL,
  "updatedBy" integer,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
