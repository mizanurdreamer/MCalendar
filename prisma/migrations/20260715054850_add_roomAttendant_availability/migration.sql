-- CreateTable
CREATE TABLE "roomAttendantAvailability" (
    "id" UUID NOT NULL,
    "roomAttendantId" UUID NOT NULL,
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

    CONSTRAINT "roomAttendantAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "roomAttendantAvailability_roomAttendantId_idx" ON "roomAttendantAvailability"("roomAttendantId");

-- CreateIndex
CREATE INDEX "roomAttendantAvailability_fromDate_idx" ON "roomAttendantAvailability"("fromDate");

-- CreateIndex
CREATE INDEX "roomAttendantAvailability_deletedAt_idx" ON "roomAttendantAvailability"("deletedAt");

-- AddForeignKey
ALTER TABLE "roomAttendantAvailability" ADD CONSTRAINT "roomAttendantAvailability_roomAttendantId_fkey" FOREIGN KEY ("roomAttendantId") REFERENCES "roomAttendantProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
