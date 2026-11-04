CREATE TYPE "StoreAssetType" AS ENUM ('PRODUCT_IMAGE', 'STORE_LOGO');

CREATE TABLE "StoreAsset" (
  "id" UUID NOT NULL,
  "storeId" UUID NOT NULL,
  "productId" UUID,
  "type" "StoreAssetType" NOT NULL,
  "contentType" VARCHAR(32) NOT NULL DEFAULT 'image/webp',
  "byteSize" INTEGER NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  "data" BYTEA NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreAsset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StoreAsset_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StoreAsset_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StoreAsset_product_link_check" CHECK (
    ("type" = 'PRODUCT_IMAGE' AND "productId" IS NOT NULL)
    OR ("type" = 'STORE_LOGO' AND "productId" IS NULL)
  ),
  CONSTRAINT "StoreAsset_size_check" CHECK ("byteSize" > 0 AND "byteSize" <= 1048576)
);

CREATE INDEX "StoreAsset_storeId_type_createdAt_idx"
ON "StoreAsset"("storeId", "type", "createdAt");

CREATE INDEX "StoreAsset_productId_sortOrder_createdAt_idx"
ON "StoreAsset"("productId", "sortOrder", "createdAt");

CREATE UNIQUE INDEX "StoreAsset_one_logo_per_store_key"
ON "StoreAsset"("storeId")
WHERE "type" = 'STORE_LOGO';
