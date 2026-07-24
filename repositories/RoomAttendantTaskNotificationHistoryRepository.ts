import { Prisma } from "@prisma/client";
import { prisma } from "@/util/prisma";

export class RoomAttendantTaskNotificationHistoryRepository {
  create(data: Prisma.RoomAttendantTaskNotificationHistoryCreateInput) {
    return prisma.roomAttendantTaskNotificationHistory.create({ data });
  }

  update(id: string, data: Prisma.RoomAttendantTaskNotificationHistoryUpdateInput) {
    return prisma.roomAttendantTaskNotificationHistory.update({
      where: { id },
      data,
    });
  }

  findByTaskScheduleId(taskScheduleId: string) {
    return prisma.roomAttendantTaskNotificationHistory.findMany({
      where: { taskScheduleId, isDeleted: false },
    });
  }

  findByTaskScheduleIdAndType(taskScheduleId: string, notificationType: number) {
    return prisma.roomAttendantTaskNotificationHistory.findFirst({
      where: { taskScheduleId, notificationType, isDeleted: false },
    });
  }

  findForSchedules(scheduleIds: string[]) {
    return prisma.roomAttendantTaskNotificationHistory.findMany({
      where: { taskScheduleId: { in: scheduleIds }, isDeleted: false },
    });
  }
}

export const notificationHistoryRepository = new RoomAttendantTaskNotificationHistoryRepository();
