ALTER TABLE "Lead"
ADD COLUMN "idempotencyKey" VARCHAR(64),
ADD COLUMN "idempotencyHash" CHAR(64);

CREATE UNIQUE INDEX "Lead_storeId_idempotencyKey_key"
ON "Lead"("storeId", "idempotencyKey");

ALTER TABLE "OrderPayment"
ADD COLUMN "idempotencyKey" VARCHAR(64),
ADD COLUMN "idempotencyHash" CHAR(64);

CREATE UNIQUE INDEX "OrderPayment_idempotencyKey_key"
ON "OrderPayment"("idempotencyKey");

CREATE TABLE "PublicSubmissionLimit" (
  "id" UUID NOT NULL,
  "storeId" UUID NOT NULL,
  "fingerprintHash" CHAR(64) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" TIMESTAMPTZ(3) NOT NULL,
  "blockedUntil" TIMESTAMPTZ(3),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PublicSubmissionLimit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PublicSubmissionLimit_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PublicSubmissionLimit_storeId_fingerprintHash_key"
ON "PublicSubmissionLimit"("storeId", "fingerprintHash");

CREATE INDEX "PublicSubmissionLimit_windowStartedAt_idx"
ON "PublicSubmissionLimit"("windowStartedAt");
