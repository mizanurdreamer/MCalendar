-- AlterTable
ALTER TABLE "roomAttendantTaskNotificationHistory" ALTER COLUMN "emailSentStatus" DROP NOT NULL,
ALTER COLUMN "emailSentStatus" DROP DEFAULT,
ALTER COLUMN "smsSentStatus" DROP NOT NULL,
ALTER COLUMN "smsSentStatus" DROP DEFAULT;
