-- CreateEnum
CREATE TYPE "MeasurementStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('CONFIRMED', 'IN_PROGRESS', 'READY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InstallationStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'ISSUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CustomerActivityType" AS ENUM ('NOTE', 'CALL', 'SMS', 'EMAIL', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AdminRole" ADD VALUE 'MEASURER';
ALTER TYPE "AdminRole" ADD VALUE 'INSTALLER';

-- CreateTable
CREATE TABLE "Measurement" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "assignedMeasurerId" UUID,
    "createdById" UUID NOT NULL,
    "scheduledAt" TIMESTAMPTZ(3) NOT NULL,
    "address" VARCHAR(300) NOT NULL,
    "status" "MeasurementStatus" NOT NULL DEFAULT 'SCHEDULED',
    "results" JSONB,
    "comments" VARCHAR(2000),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Measurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "managerId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'CONFIRMED',
    "customerName" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(24) NOT NULL,
    "address" VARCHAR(300),
    "currency" CHAR(3) NOT NULL DEFAULT 'RUB',
    "configurationSnapshot" JSONB NOT NULL,
    "sourceQuoteSnapshot" JSONB NOT NULL,
    "subtotalMinor" BIGINT NOT NULL,
    "discountMinor" BIGINT NOT NULL DEFAULT 0,
    "totalMinor" BIGINT NOT NULL,
    "costMinor" BIGINT,
    "prepaymentMinor" BIGINT NOT NULL DEFAULT 0,
    "balanceMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Installation" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "assignedInstallerId" UUID,
    "createdById" UUID NOT NULL,
    "scheduledAt" TIMESTAMPTZ(3) NOT NULL,
    "address" VARCHAR(300) NOT NULL,
    "status" "InstallationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "result" VARCHAR(2000),
    "comments" VARCHAR(2000),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Installation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerActivity" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "type" "CustomerActivityType" NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationAudit" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "entityType" VARCHAR(32) NOT NULL,
    "entityId" UUID NOT NULL,
    "action" VARCHAR(48) NOT NULL,
    "changes" JSONB NOT NULL,
    "actorId" UUID,
    "actorEmail" VARCHAR(254) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Measurement_storeId_status_scheduledAt_idx" ON "Measurement"("storeId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Measurement_assignedMeasurerId_status_scheduledAt_idx" ON "Measurement"("assignedMeasurerId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Measurement_leadId_scheduledAt_idx" ON "Measurement"("leadId", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_leadId_key" ON "Order"("leadId");

-- CreateIndex
CREATE INDEX "Order_storeId_status_createdAt_idx" ON "Order"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_managerId_status_createdAt_idx" ON "Order"("managerId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Installation_orderId_key" ON "Installation"("orderId");

-- CreateIndex
CREATE INDEX "Installation_storeId_status_scheduledAt_idx" ON "Installation"("storeId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Installation_assignedInstallerId_status_scheduledAt_idx" ON "Installation"("assignedInstallerId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "CustomerActivity_storeId_leadId_createdAt_idx" ON "CustomerActivity"("storeId", "leadId", "createdAt");

-- CreateIndex
CREATE INDEX "OperationAudit_storeId_entityType_entityId_createdAt_idx" ON "OperationAudit"("storeId", "entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "OperationAudit_storeId_createdAt_idx" ON "OperationAudit"("storeId", "createdAt");

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_assignedMeasurerId_fkey" FOREIGN KEY ("assignedMeasurerId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_assignedInstallerId_fkey" FOREIGN KEY ("assignedInstallerId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerActivity" ADD CONSTRAINT "CustomerActivity_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerActivity" ADD CONSTRAINT "CustomerActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerActivity" ADD CONSTRAINT "CustomerActivity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationAudit" ADD CONSTRAINT "OperationAudit_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationAudit" ADD CONSTRAINT "OperationAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
