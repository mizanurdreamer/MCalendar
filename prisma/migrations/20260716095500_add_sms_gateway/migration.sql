-- CreateTable
CREATE TABLE "smsGateway" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "smsGateway_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "smsGateway_name_key" ON "smsGateway"("name");

-- CreateIndex
CREATE UNIQUE INDEX "smsGateway_domain_key" ON "smsGateway"("domain");

-- CreateIndex
CREATE INDEX "smsGateway_deletedAt_idx" ON "smsGateway"("deletedAt");
