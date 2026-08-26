CREATE TABLE IF NOT EXISTS "products" (
  "id" serial PRIMARY KEY,
  "databaseId" integer NOT NULL,
  "name" varchar(255) NOT NULL,
  "category" varchar(120),
  "sku" varchar(80),
  "purchasePrice" numeric(15,2) DEFAULT '0.00' NOT NULL,
  "salePrice" numeric(15,2) NOT NULL,
  "status" varchar(64) DEFAULT 'disponivel' NOT NULL,
  "description" text,
  "createdBy" integer NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "vehicleFinancings" ALTER COLUMN "vehicleId" DROP NOT NULL;
ALTER TABLE "vehicleFinancings" ADD COLUMN IF NOT EXISTS "assetType" varchar(20) DEFAULT 'vehicle' NOT NULL;
ALTER TABLE "vehicleFinancings" ADD COLUMN IF NOT EXISTS "productId" integer;
