-- Assign a responsible manager to a lead (CRM core, step 2.1).
-- Nullable: existing leads and unassigned intake stay valid.

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "assignedManagerId" UUID;

-- CreateIndex
CREATE INDEX "Lead_storeId_assignedManagerId_status_idx" ON "Lead"("storeId", "assignedManagerId", "status");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedManagerId_fkey" FOREIGN KEY ("assignedManagerId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
