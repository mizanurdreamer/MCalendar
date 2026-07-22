import { Prisma, type CleanerTaskSchedule } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Data-access for cleaner task schedules (client-cleaner with date range).
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
  cleaner: {
    select: {
      id: true,
      userId: true,
      firstName: true,
      lastName: true,
      Email: true,
      phoneNo: true,
    },
  },
} satisfies Prisma.CleanerTaskScheduleInclude;

export class CleanerTaskScheduleRepository {
  findById(id: string) {
    return prisma.cleanerTaskSchedule.findUnique({
      where: { id },
      include: taskScheduleInclude,
    });
  }

  async list(params: {
    page: number;
    pageSize: number;
    clientId?: string;
    cleanerId?: string;
    activeOnly?: boolean;
  }) {
    const { page, pageSize, clientId, cleanerId, activeOnly } = params;
    const where: Prisma.CleanerTaskScheduleWhereInput = {
      deletedAt: null,
      ...(clientId ? { clientId } : {}),
      ...(cleanerId ? { cleanerId } : {}),
      ...(activeOnly ? { isActive: true } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.cleanerTaskSchedule.findMany({
        where,
        orderBy: { assignedDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: taskScheduleInclude,
      }),
      prisma.cleanerTaskSchedule.count({ where }),
    ]);

    return { items, total };
  }

  findActiveForClient(clientId: string, date?: Date) {
    const now = date ?? new Date();
    return prisma.cleanerTaskSchedule.findMany({
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

  findActiveForCleaner(cleanerId: string, date?: Date) {
    const now = date ?? new Date();
    return prisma.cleanerTaskSchedule.findMany({
      where: {
        cleanerId,
        isActive: true,
        deletedAt: null,
        assignedDate: { lte: now },
      },
      include: taskScheduleInclude,
      orderBy: { assignedDate: "desc" },
    });
  }

  /**
   * Every non-deleted assignment for a cleaner (no "active now" restriction),
   * used by the cleaner calendar so a cleaner sees cleaning days for any client
   * they are assigned to, scoped to that assignment's own date range.
   */
  findAllForCleaner(cleanerId: string) {
    return prisma.cleanerTaskSchedule.findMany({
      where: {
        cleanerId,
        deletedAt: null,
      },
      include: taskScheduleInclude,
      orderBy: { assignedDate: "desc" },
    });
  }

  create(data: Prisma.CleanerTaskScheduleCreateInput) {
    return prisma.cleanerTaskSchedule.create({
      data,
      include: taskScheduleInclude,
    });
  }

  update(id: string, data: Prisma.CleanerTaskScheduleUpdateInput) {
    return prisma.cleanerTaskSchedule.update({
      where: { id },
      data,
      include: taskScheduleInclude,
    });
  }

  softDelete(id: string, deletedBy?: string) {
    return prisma.cleanerTaskSchedule.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, updatedBy: deletedBy },
    });
  }
}

export const cleanerTaskScheduleRepository = new CleanerTaskScheduleRepository();
export type { CleanerTaskSchedule };
