import { Prisma, type RoomAttendantTaskSchedule } from "@prisma/client";
import { prisma } from "@/util/prisma";

/**
 * Data-access for roomAttendant task schedules (client-roomAttendant with date range).
 * Prisma queries only, no business logic.
 */
const taskScheduleInclude = {
  client: {
    select: {
      id: true,
      userId: true,
      firstName: true,
      lastName: true,
      Email: true,
      phoneNo: true,
    },
  },
  roomAttendant: {
    select: {
      id: true,
      userId: true,
      firstName: true,
      lastName: true,
      Email: true,
      phoneNo: true,
    },
  },
} satisfies Prisma.RoomAttendantTaskScheduleInclude;

export class RoomAttendantTaskScheduleRepository {
  findById(id: string) {
    return prisma.roomAttendantTaskSchedule.findUnique({
      where: { id },
      include: taskScheduleInclude,
    });
  }

  async list(params: {
    page: number;
    pageSize: number;
    clientId?: string;
    roomAttendantId?: string;
    activeOnly?: boolean;
  }) {
    const { page, pageSize, clientId, roomAttendantId, activeOnly } = params;
    const where: Prisma.RoomAttendantTaskScheduleWhereInput = {
      deletedAt: null,
      ...(clientId ? { clientId } : {}),
      ...(roomAttendantId ? { roomAttendantId } : {}),
      ...(activeOnly ? { isActive: true } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.roomAttendantTaskSchedule.findMany({
        where,
        orderBy: { assignedDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: taskScheduleInclude,
      }),
      prisma.roomAttendantTaskSchedule.count({ where }),
    ]);

    return { items, total };
  }

  findActiveForClient(clientId: string, date?: Date) {
    const now = date ?? new Date();
    return prisma.roomAttendantTaskSchedule.findMany({
      where: {
        clientId,
        isActive: true,
        deletedAt: null,
        assignedDate: { gte: now },
      },
      include: taskScheduleInclude,
      orderBy: { assignedDate: "desc" },
    });
  }

  findActiveForRoomAttendant(roomAttendantId: string, date?: Date) {
    const now = date ?? new Date();
    return prisma.roomAttendantTaskSchedule.findMany({
      where: {
        roomAttendantId,
        isActive: true,
        deletedAt: null,
        assignedDate: { lte: now },
      },
      include: taskScheduleInclude,
      orderBy: { assignedDate: "desc" },
    });
  }

  /**
   * Every non-deleted assignment for a roomAttendant (no "active now" restriction),
   * used by the roomAttendant calendar so a roomAttendant sees cleaning days for any client
   * they are assigned to, scoped to that assignment's own date range.
   */
  findAllForRoomAttendant(roomAttendantId: string) {
    return prisma.roomAttendantTaskSchedule.findMany({
      where: {
        roomAttendantId,
        deletedAt: null,
      },
      include: taskScheduleInclude,
      orderBy: { assignedDate: "desc" },
    });
  }

  create(data: Prisma.RoomAttendantTaskScheduleCreateInput) {
    return prisma.roomAttendantTaskSchedule.create({
      data,
      include: taskScheduleInclude,
    });
  }

  update(id: string, data: Prisma.RoomAttendantTaskScheduleUpdateInput) {
    return prisma.roomAttendantTaskSchedule.update({
      where: { id },
      data,
      include: taskScheduleInclude,
    });
  }

  softDelete(id: string, deletedBy?: string) {
    return prisma.roomAttendantTaskSchedule.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, updatedBy: deletedBy },
    });
  }
}

export const roomAttendantTaskScheduleRepository = new RoomAttendantTaskScheduleRepository();
export type { RoomAttendantTaskSchedule };
