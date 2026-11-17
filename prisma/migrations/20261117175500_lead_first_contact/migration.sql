-- First contact timestamp for the CRM SLA (step 2.2).
-- Nullable: existing leads have no recorded contact yet.

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "firstContactAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "Lead_storeId_firstContactAt_idx" ON "Lead"("storeId", "firstContactAt");
