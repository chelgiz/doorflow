-- CreateEnum
CREATE TYPE "OptionSelectionMode" AS ENUM ('SINGLE', 'MULTIPLE');

-- CreateEnum
CREATE TYPE "OptionPricingUnit" AS ENUM ('PER_DOOR', 'PER_ORDER');

-- CreateEnum
CREATE TYPE "PricingMethod" AS ENUM ('FIXED', 'PER_DOOR', 'PER_UNIT', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "LeadType" AS ENUM ('ORDER', 'MEASUREMENT');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'CONTACTED', 'MEASUREMENT_SCHEDULED', 'MEASURED', 'PROPOSAL_PREPARED', 'AWAITING_DECISION', 'SALE', 'REJECTED', 'COMPLETED');

-- CreateTable
CREATE TABLE "Store" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Manufacturer" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "series" VARCHAR(160),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Manufacturer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "manufacturerId" UUID,
    "slug" VARCHAR(100) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "category" VARCHAR(80) NOT NULL,
    "basePriceMinor" BIGINT NOT NULL,
    "costMinor" BIGINT,
    "currency" CHAR(3) NOT NULL DEFAULT 'RUB',
    "specifications" JSONB NOT NULL DEFAULT '{}',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOptionGroup" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "selectionMode" "OptionSelectionMode" NOT NULL DEFAULT 'SINGLE',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "minSelections" INTEGER NOT NULL DEFAULT 0,
    "maxSelections" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProductOptionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOption" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "priceMinor" BIGINT NOT NULL DEFAULT 0,
    "pricingUnit" "OptionPricingUnit" NOT NULL DEFAULT 'PER_DOOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "method" "PricingMethod" NOT NULL,
    "priceMinor" BIGINT NOT NULL DEFAULT 0,
    "basisPoints" INTEGER,
    "maxQuantity" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "productId" UUID,
    "type" "LeadType" NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "customerName" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(24) NOT NULL,
    "address" VARCHAR(300),
    "comment" VARCHAR(1200),
    "source" VARCHAR(120),
    "utmSource" VARCHAR(120),
    "utmMedium" VARCHAR(120),
    "utmCampaign" VARCHAR(160),
    "utmContent" VARCHAR(160),
    "utmTerm" VARCHAR(160),
    "selectedConfiguration" JSONB,
    "quoteSnapshot" JSONB,
    "personalDataConsentAt" TIMESTAMPTZ(3) NOT NULL,
    "consentNoticeVersion" VARCHAR(40) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadStatusHistory" (
    "id" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "from" "LeadStatus",
    "to" "LeadStatus" NOT NULL,
    "note" VARCHAR(500),
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Store_slug_key" ON "Store"("slug");

-- CreateIndex
CREATE INDEX "Manufacturer_storeId_idx" ON "Manufacturer"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Manufacturer_storeId_name_key" ON "Manufacturer"("storeId", "name");

-- CreateIndex
CREATE INDEX "Product_storeId_isActive_category_idx" ON "Product"("storeId", "isActive", "category");

-- CreateIndex
CREATE INDEX "Product_manufacturerId_idx" ON "Product"("manufacturerId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_storeId_slug_key" ON "Product"("storeId", "slug");

-- CreateIndex
CREATE INDEX "ProductOptionGroup_productId_isActive_sortOrder_idx" ON "ProductOptionGroup"("productId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOptionGroup_productId_key_key" ON "ProductOptionGroup"("productId", "key");

-- CreateIndex
CREATE INDEX "ProductOption_groupId_isActive_sortOrder_idx" ON "ProductOption"("groupId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOption_groupId_key_key" ON "ProductOption"("groupId", "key");

-- CreateIndex
CREATE INDEX "PricingRule_storeId_isActive_idx" ON "PricingRule"("storeId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PricingRule_storeId_key_key" ON "PricingRule"("storeId", "key");

-- CreateIndex
CREATE INDEX "Lead_storeId_status_createdAt_idx" ON "Lead"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_storeId_phone_idx" ON "Lead"("storeId", "phone");

-- CreateIndex
CREATE INDEX "Lead_productId_idx" ON "Lead"("productId");

-- CreateIndex
CREATE INDEX "LeadStatusHistory_leadId_changedAt_idx" ON "LeadStatusHistory"("leadId", "changedAt");

-- AddForeignKey
ALTER TABLE "Manufacturer" ADD CONSTRAINT "Manufacturer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOptionGroup" ADD CONSTRAINT "ProductOptionGroup_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOption" ADD CONSTRAINT "ProductOption_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ProductOptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadStatusHistory" ADD CONSTRAINT "LeadStatusHistory_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
