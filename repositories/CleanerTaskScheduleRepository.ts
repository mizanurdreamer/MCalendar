import { Prisma, type CleanerTaskSchedule } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Data-access for cleaner task schedules (client-cleaner with date range).
 * Prisma queries only, no business logic.
 */
export class CleanerTaskScheduleRepository {
  findById(id: string) {
    return prisma.cleanerTaskSchedule.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, email: true } },
        cleaner: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
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
        orderBy: { startDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          client: { select: { id: true, firstName: true, lastName: true, email: true } },
          cleaner: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
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
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
      include: {
        cleaner: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
      },
      orderBy: { startDate: "desc" },
    });
  }

  findActiveForCleaner(cleanerId: string, date?: Date) {
    const now = date ?? new Date();
    return prisma.cleanerTaskSchedule.findMany({
      where: {
        cleanerId,
        isActive: true,
        deletedAt: null,
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
      include: {
        client: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
      },
      orderBy: { startDate: "desc" },
    });
  }

  create(data: Prisma.CleanerTaskScheduleCreateInput) {
    return prisma.cleanerTaskSchedule.create({
      data,
      include: {
        client: { select: { id: true, firstName: true, lastName: true, email: true } },
        cleaner: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  update(id: string, data: Prisma.CleanerTaskScheduleUpdateInput) {
    return prisma.cleanerTaskSchedule.update({
      where: { id },
      data,
      include: {
        client: { select: { id: true, firstName: true, lastName: true, email: true } },
        cleaner: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
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
