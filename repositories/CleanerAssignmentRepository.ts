import { Prisma, type CleanerAssignment } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Data-access for cleaner assignments (client ↔ cleaner with date range).
 * Prisma queries only — no business logic.
 */
export class CleanerAssignmentRepository {
  findById(id: string) {
    return prisma.cleanerAssignment.findUnique({
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
    const where: Prisma.CleanerAssignmentWhereInput = {
      deletedAt: null,
      ...(clientId ? { clientId } : {}),
      ...(cleanerId ? { cleanerId } : {}),
      ...(activeOnly ? { isActive: true } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.cleanerAssignment.findMany({
        where,
        orderBy: { startDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          client: { select: { id: true, firstName: true, lastName: true, email: true } },
          cleaner: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      prisma.cleanerAssignment.count({ where }),
    ]);

    return { items, total };
  }

  findActiveForClient(clientId: string, date?: Date) {
    const now = date ?? new Date();
    return prisma.cleanerAssignment.findMany({
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
    return prisma.cleanerAssignment.findMany({
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

  create(data: Prisma.CleanerAssignmentCreateInput) {
    return prisma.cleanerAssignment.create({
      data,
      include: {
        client: { select: { id: true, firstName: true, lastName: true, email: true } },
        cleaner: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  update(id: string, data: Prisma.CleanerAssignmentUpdateInput) {
    return prisma.cleanerAssignment.update({
      where: { id },
      data,
      include: {
        client: { select: { id: true, firstName: true, lastName: true, email: true } },
        cleaner: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  softDelete(id: string, deletedBy?: string) {
    return prisma.cleanerAssignment.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, updatedBy: deletedBy },
    });
  }
}

export const cleanerAssignmentRepository = new CleanerAssignmentRepository();
