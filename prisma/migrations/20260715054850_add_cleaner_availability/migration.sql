-- CreateTable
CREATE TABLE "cleanerAvailability" (
    "id" UUID NOT NULL,
    "cleanerId" UUID NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3),
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "cleanerAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cleanerAvailability_cleanerId_idx" ON "cleanerAvailability"("cleanerId");

-- CreateIndex
CREATE INDEX "cleanerAvailability_fromDate_idx" ON "cleanerAvailability"("fromDate");

-- CreateIndex
CREATE INDEX "cleanerAvailability_deletedAt_idx" ON "cleanerAvailability"("deletedAt");

-- AddForeignKey
ALTER TABLE "cleanerAvailability" ADD CONSTRAINT "cleanerAvailability_cleanerId_fkey" FOREIGN KEY ("cleanerId") REFERENCES "cleanerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
