-- CreateTable
CREATE TABLE "role" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "roleId" UUID NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "Email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "smsGatewayId" UUID,
    "phoneNo" TEXT NOT NULL,
    "companyName" TEXT,
    "portfolioSize" INTEGER,
    "timezone" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "clientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roomAttendantProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "clientId" UUID,
    "Email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "smsGatewayId" UUID,
    "phoneNo" TEXT NOT NULL,
    "serviceArea" TEXT,
    "hourlyRate" INTEGER,
    "rating" DECIMAL(4,2),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "roomAttendantProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refreshToken" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientBookingProvider" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "clientBookingProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookingFetchData" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "rawData" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookingFetchData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guestBookingInfo" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "fetchDataId" UUID NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "summary" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guestBookingInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roomAttendantTaskSchedule" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "roomAttendantId" UUID NOT NULL,
    "assignedDate" TIMESTAMP(3) NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 0,
    "isSentSms" BOOLEAN NOT NULL DEFAULT false,
    "smsSentDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "roomAttendantTaskSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roomAttendantAvailability" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
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
CREATE UNIQUE INDEX "role_name_key" ON "role"("name");

-- CreateIndex
CREATE INDEX "user_roleId_idx" ON "user"("roleId");

-- CreateIndex
CREATE INDEX "user_deletedAt_idx" ON "user"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "clientProfile_userId_key" ON "clientProfile"("userId");

-- CreateIndex
CREATE INDEX "clientProfile_smsGatewayId_idx" ON "clientProfile"("smsGatewayId");

-- CreateIndex
CREATE INDEX "clientProfile_deletedAt_idx" ON "clientProfile"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "roomAttendantProfile_userId_key" ON "roomAttendantProfile"("userId");

-- CreateIndex
CREATE INDEX "roomAttendantProfile_clientId_idx" ON "roomAttendantProfile"("clientId");

-- CreateIndex
CREATE INDEX "roomAttendantProfile_smsGatewayId_idx" ON "roomAttendantProfile"("smsGatewayId");

-- CreateIndex
CREATE INDEX "roomAttendantProfile_deletedAt_idx" ON "roomAttendantProfile"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "refreshToken_tokenHash_key" ON "refreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "refreshToken_userId_idx" ON "refreshToken"("userId");

-- CreateIndex
CREATE INDEX "clientBookingProvider_clientId_idx" ON "clientBookingProvider"("clientId");

-- CreateIndex
CREATE INDEX "clientBookingProvider_deletedAt_idx" ON "clientBookingProvider"("deletedAt");

-- CreateIndex
CREATE INDEX "bookingFetchData_providerId_idx" ON "bookingFetchData"("providerId");

-- CreateIndex
CREATE INDEX "bookingFetchData_clientId_idx" ON "bookingFetchData"("clientId");

-- CreateIndex
CREATE INDEX "bookingFetchData_fetchedAt_idx" ON "bookingFetchData"("fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "bookingFetchData_providerId_payloadHash_key" ON "bookingFetchData"("providerId", "payloadHash");

-- CreateIndex
CREATE UNIQUE INDEX "guestBookingInfo_dedupeKey_key" ON "guestBookingInfo"("dedupeKey");

-- CreateIndex
CREATE INDEX "guestBookingInfo_providerId_idx" ON "guestBookingInfo"("providerId");

-- CreateIndex
CREATE INDEX "guestBookingInfo_clientId_idx" ON "guestBookingInfo"("clientId");

-- CreateIndex
CREATE INDEX "guestBookingInfo_fetchDataId_idx" ON "guestBookingInfo"("fetchDataId");

-- CreateIndex
CREATE INDEX "roomAttendantTaskSchedule_clientId_idx" ON "roomAttendantTaskSchedule"("clientId");

-- CreateIndex
CREATE INDEX "roomAttendantTaskSchedule_roomAttendantId_idx" ON "roomAttendantTaskSchedule"("roomAttendantId");

-- CreateIndex
CREATE INDEX "roomAttendantTaskSchedule_status_idx" ON "roomAttendantTaskSchedule"("status");

-- CreateIndex
CREATE INDEX "roomAttendantTaskSchedule_assignedDate_idx" ON "roomAttendantTaskSchedule"("assignedDate");

-- CreateIndex
CREATE INDEX "roomAttendantTaskSchedule_isSentSms_idx" ON "roomAttendantTaskSchedule"("isSentSms");

-- CreateIndex
CREATE INDEX "roomAttendantTaskSchedule_deletedAt_idx" ON "roomAttendantTaskSchedule"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "taskSchedule_clientId_roomAttendantId_assignedDate_key" ON "roomAttendantTaskSchedule"("clientId", "roomAttendantId", "assignedDate");

-- CreateIndex
CREATE INDEX "roomAttendantAvailability_clientId_idx" ON "roomAttendantAvailability"("clientId");

-- CreateIndex
CREATE INDEX "roomAttendantAvailability_roomAttendantId_idx" ON "roomAttendantAvailability"("roomAttendantId");

-- CreateIndex
CREATE INDEX "roomAttendantAvailability_fromDate_idx" ON "roomAttendantAvailability"("fromDate");

-- CreateIndex
CREATE INDEX "roomAttendantAvailability_deletedAt_idx" ON "roomAttendantAvailability"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "smsGateway_name_key" ON "smsGateway"("name");

-- CreateIndex
CREATE UNIQUE INDEX "smsGateway_domain_key" ON "smsGateway"("domain");

-- CreateIndex
CREATE INDEX "smsGateway_deletedAt_idx" ON "smsGateway"("deletedAt");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientProfile" ADD CONSTRAINT "clientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientProfile" ADD CONSTRAINT "clientProfile_smsGatewayId_fkey" FOREIGN KEY ("smsGatewayId") REFERENCES "smsGateway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roomAttendantProfile" ADD CONSTRAINT "roomAttendantProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roomAttendantProfile" ADD CONSTRAINT "roomAttendantProfile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clientProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roomAttendantProfile" ADD CONSTRAINT "roomAttendantProfile_smsGatewayId_fkey" FOREIGN KEY ("smsGatewayId") REFERENCES "smsGateway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refreshToken" ADD CONSTRAINT "refreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientBookingProvider" ADD CONSTRAINT "clientBookingProvider_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookingFetchData" ADD CONSTRAINT "bookingFetchData_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "clientBookingProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookingFetchData" ADD CONSTRAINT "bookingFetchData_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guestBookingInfo" ADD CONSTRAINT "guestBookingInfo_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "clientBookingProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guestBookingInfo" ADD CONSTRAINT "guestBookingInfo_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guestBookingInfo" ADD CONSTRAINT "guestBookingInfo_fetchDataId_fkey" FOREIGN KEY ("fetchDataId") REFERENCES "bookingFetchData"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roomAttendantTaskSchedule" ADD CONSTRAINT "roomAttendantTaskSchedule_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roomAttendantTaskSchedule" ADD CONSTRAINT "roomAttendantTaskSchedule_roomAttendantId_fkey" FOREIGN KEY ("roomAttendantId") REFERENCES "roomAttendantProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roomAttendantAvailability" ADD CONSTRAINT "roomAttendantAvailability_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roomAttendantAvailability" ADD CONSTRAINT "roomAttendantAvailability_roomAttendantId_fkey" FOREIGN KEY ("roomAttendantId") REFERENCES "roomAttendantProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
