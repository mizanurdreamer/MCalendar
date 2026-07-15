import { Prisma, type CleanerAvailability } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Data-access for cleaner availability slots. Prisma queries only.
 */
const availabilityInclude = {
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
} satisfies Prisma.CleanerAvailabilityInclude;

export class CleanerAvailabilityRepository {
  findById(id: string) {
    return prisma.cleanerAvailability.findUnique({
      where: { id },
      include: availabilityInclude,
    });
  }

  async list(params: {
    page: number;
    pageSize: number;
    cleanerId?: string;
    fromDate?: Date;
    toDate?: Date;
    activeOnly?: boolean;
  }) {
    const { page, pageSize, cleanerId, fromDate, toDate, activeOnly } = params;
    const where: Prisma.CleanerAvailabilityWhereInput = {
      deletedAt: null,
      ...(cleanerId ? { cleanerId } : {}),
      ...(activeOnly ? { isActive: true } : {}),
      ...(fromDate || toDate
        ? {
            fromDate: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.cleanerAvailability.findMany({
        where,
        orderBy: [{ fromDate: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: availabilityInclude,
      }),
      prisma.cleanerAvailability.count({ where }),
    ]);

    return { items, total };
  }

  create(data: Prisma.CleanerAvailabilityCreateInput) {
    return prisma.cleanerAvailability.create({
      data,
      include: availabilityInclude,
    });
  }

  update(id: string, data: Prisma.CleanerAvailabilityUpdateInput) {
    return prisma.cleanerAvailability.update({
      where: { id },
      data,
      include: availabilityInclude,
    });
  }

  softDelete(id: string, deletedBy?: string) {
    return prisma.cleanerAvailability.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, updatedBy: deletedBy },
    });
  }
}

export const cleanerAvailabilityRepository = new CleanerAvailabilityRepository();
export type { CleanerAvailability };
