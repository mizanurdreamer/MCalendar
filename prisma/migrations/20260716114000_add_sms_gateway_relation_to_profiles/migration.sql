-- AlterTable
ALTER TABLE "clientProfile" ADD COLUMN "smsGatewayId" UUID;

-- AlterTable
ALTER TABLE "roomAttendantProfile" ADD COLUMN "smsGatewayId" UUID;

-- CreateIndex
CREATE INDEX "clientProfile_smsGatewayId_idx" ON "clientProfile"("smsGatewayId");

-- CreateIndex
CREATE INDEX "roomAttendantProfile_smsGatewayId_idx" ON "roomAttendantProfile"("smsGatewayId");

-- AddForeignKey
ALTER TABLE "clientProfile" ADD CONSTRAINT "clientProfile_smsGatewayId_fkey" FOREIGN KEY ("smsGatewayId") REFERENCES "smsGateway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roomAttendantProfile" ADD CONSTRAINT "roomAttendantProfile_smsGatewayId_fkey" FOREIGN KEY ("smsGatewayId") REFERENCES "smsGateway"("id") ON DELETE SET NULL ON UPDATE CASCADE;
