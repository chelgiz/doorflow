-- Fixed refusal reasons for CRM leads (step 2.4).
-- A rejected lead must always carry a reason: enforced by a CHECK constraint
-- in addition to the API validation, so direct SQL cannot create the state.

-- CreateEnum
CREATE TYPE "RejectionReason" AS ENUM ('PRICE', 'SPECIFICATIONS', 'LEAD_TIME', 'COMPETITOR', 'NO_NEED');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "rejectionReason" "RejectionReason";

-- CreateIndex
CREATE INDEX "Lead_storeId_rejectionReason_idx" ON "Lead"("storeId", "rejectionReason");

-- Integrity: REJECTED without a reason is impossible
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_rejection_reason_check"
  CHECK (("status" <> 'REJECTED') OR ("rejectionReason" IS NOT NULL));
