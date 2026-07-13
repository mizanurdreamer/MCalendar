-- CreateTable
CREATE TABLE "ClientBookingEndpoints" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ClientBookingEndpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientBookingEndpoints_clientId_idx" ON "ClientBookingEndpoints"("clientId");

-- CreateIndex
CREATE INDEX "ClientBookingEndpoints_deletedAt_idx" ON "ClientBookingEndpoints"("deletedAt");

-- AddForeignKey
ALTER TABLE "ClientBookingEndpoints" ADD CONSTRAINT "ClientBookingEndpoints_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
