-- AlterTable
ALTER TABLE "clientProfile" ADD COLUMN "smsGatewayId" UUID;

-- AlterTable
ALTER TABLE "cleanerProfile" ADD COLUMN "smsGatewayId" UUID;

-- CreateIndex
CREATE INDEX "clientProfile_smsGatewayId_idx" ON "clientProfile"("smsGatewayId");

-- CreateIndex
CREATE INDEX "cleanerProfile_smsGatewayId_idx" ON "cleanerProfile"("smsGatewayId");

-- AddForeignKey
ALTER TABLE "clientProfile" ADD CONSTRAINT "clientProfile_smsGatewayId_fkey" FOREIGN KEY ("smsGatewayId") REFERENCES "smsGateway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cleanerProfile" ADD CONSTRAINT "cleanerProfile_smsGatewayId_fkey" FOREIGN KEY ("smsGatewayId") REFERENCES "smsGateway"("id") ON DELETE SET NULL ON UPDATE CASCADE;
