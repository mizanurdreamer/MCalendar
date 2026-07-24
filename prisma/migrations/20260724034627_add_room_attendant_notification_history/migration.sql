/*
  Warnings:

  - You are about to drop the column `isSentSms` on the `roomAttendantTaskSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `smsSentDate` on the `roomAttendantTaskSchedule` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "roomAttendantTaskSchedule_isSentSms_idx";

-- AlterTable
ALTER TABLE "roomAttendantTaskSchedule" DROP COLUMN "isSentSms",
DROP COLUMN "smsSentDate";

-- CreateTable
CREATE TABLE "roomAttendantTaskNotificationHistory" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "roomAttendantId" UUID NOT NULL,
    "taskScheduleId" UUID NOT NULL,
    "Email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "smsGatewayId" UUID,
    "phoneNo" TEXT NOT NULL,
    "notificationType" INTEGER NOT NULL DEFAULT 0,
    "notificationDate" TIMESTAMP(3),
    "emailSentStatus" INTEGER NOT NULL DEFAULT 0,
    "emailFailedCount" INTEGER NOT NULL DEFAULT 0,
    "emailFailedResult" TEXT NOT NULL,
    "smsSentStatus" INTEGER NOT NULL DEFAULT 0,
    "smsFailedCount" INTEGER NOT NULL DEFAULT 0,
    "smsFailedResult" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "roomAttendantTaskNotificationHistory_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "roomAttendantTaskNotificationHistory" ADD CONSTRAINT "roomAttendantTaskNotificationHistory_taskScheduleId_fkey" FOREIGN KEY ("taskScheduleId") REFERENCES "roomAttendantTaskSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
