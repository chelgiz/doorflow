-- CreateTable
CREATE TABLE "AdminLoginAttempt" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "subjectHash" CHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMPTZ(3) NOT NULL,
    "blockedUntil" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AdminLoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminLoginAttempt_blockedUntil_idx" ON "AdminLoginAttempt"("blockedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "AdminLoginAttempt_storeId_subjectHash_key" ON "AdminLoginAttempt"("storeId", "subjectHash");

-- AddForeignKey
ALTER TABLE "AdminLoginAttempt" ADD CONSTRAINT "AdminLoginAttempt_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
