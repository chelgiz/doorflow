-- Next action reminder for a lead (CRM step 2.3).
-- Nullable: leads without a planned follow-up are not overdue by action.

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "nextActionAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "Lead_storeId_nextActionAt_idx" ON "Lead"("storeId", "nextActionAt");
