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
    "Email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
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
CREATE TABLE "clientBookingEndpoint" (
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

    CONSTRAINT "clientBookingEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookingFetchData" (
    "id" UUID NOT NULL,
    "endpointId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "rawData" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookingFetchData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guestBookingInfo" (
    "id" UUID NOT NULL,
    "endpointId" UUID NOT NULL,
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
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "roomAttendantTaskSchedule_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "clientProfile_deletedAt_idx" ON "clientProfile"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "roomAttendantProfile_userId_key" ON "roomAttendantProfile"("userId");

-- CreateIndex
CREATE INDEX "roomAttendantProfile_deletedAt_idx" ON "roomAttendantProfile"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "refreshToken_tokenHash_key" ON "refreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "refreshToken_userId_idx" ON "refreshToken"("userId");

-- CreateIndex
CREATE INDEX "clientBookingEndpoint_clientId_idx" ON "clientBookingEndpoint"("clientId");

-- CreateIndex
CREATE INDEX "clientBookingEndpoint_deletedAt_idx" ON "clientBookingEndpoint"("deletedAt");

-- CreateIndex
CREATE INDEX "bookingFetchData_endpointId_idx" ON "bookingFetchData"("endpointId");

-- CreateIndex
CREATE INDEX "bookingFetchData_clientId_idx" ON "bookingFetchData"("clientId");

-- CreateIndex
CREATE INDEX "bookingFetchData_fetchedAt_idx" ON "bookingFetchData"("fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "bookingFetchData_endpointId_payloadHash_key" ON "bookingFetchData"("endpointId", "payloadHash");

-- CreateIndex
CREATE UNIQUE INDEX "guestBookingInfo_dedupeKey_key" ON "guestBookingInfo"("dedupeKey");

-- CreateIndex
CREATE INDEX "guestBookingInfo_endpointId_idx" ON "guestBookingInfo"("endpointId");

-- CreateIndex
CREATE INDEX "guestBookingInfo_clientId_idx" ON "guestBookingInfo"("clientId");

-- CreateIndex
CREATE INDEX "guestBookingInfo_fetchDataId_idx" ON "guestBookingInfo"("fetchDataId");

-- CreateIndex
CREATE INDEX "roomAttendantTaskSchedule_clientId_idx" ON "roomAttendantTaskSchedule"("clientId");

-- CreateIndex
CREATE INDEX "roomAttendantTaskSchedule_roomAttendantId_idx" ON "roomAttendantTaskSchedule"("roomAttendantId");

-- CreateIndex
CREATE INDEX "roomAttendantTaskSchedules_startDate_endDate_idx" ON "roomAttendantTaskSchedule"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "roomAttendantTaskSchedule_deletedAt_idx" ON "roomAttendantTaskSchedule"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "roomAttendantTaskSchedule_clientId_roomAttendantId_startDate_key" ON "roomAttendantTaskSchedule"("clientId", "roomAttendantId", "startDate");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientProfile" ADD CONSTRAINT "clientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roomAttendantProfile" ADD CONSTRAINT "roomAttendantProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refreshToken" ADD CONSTRAINT "refreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientBookingEndpoint" ADD CONSTRAINT "clientBookingEndpoint_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookingFetchData" ADD CONSTRAINT "bookingFetchData_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "clientBookingEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookingFetchData" ADD CONSTRAINT "bookingFetchData_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guestBookingInfo" ADD CONSTRAINT "guestBookingInfo_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "clientBookingEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guestBookingInfo" ADD CONSTRAINT "guestBookingInfo_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guestBookingInfo" ADD CONSTRAINT "guestBookingInfo_fetchDataId_fkey" FOREIGN KEY ("fetchDataId") REFERENCES "bookingFetchData"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roomAttendantTaskSchedule" ADD CONSTRAINT "roomAttendantTaskSchedule_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roomAttendantTaskSchedule" ADD CONSTRAINT "roomAttendantTaskSchedule_roomAttendantId_fkey" FOREIGN KEY ("roomAttendantId") REFERENCES "roomAttendantProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
