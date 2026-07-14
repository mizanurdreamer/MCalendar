import { Prisma, type ClientBookingData } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Data-access for client booking data (cron job responses).
 * Prisma queries only — no business logic.
 */
export class ClientBookingDataRepository {
  findById(id: string) {
    return prisma.clientBookingData.findUnique({ where: { id } });
  }

  async list(params: {
    page: number;
    pageSize: number;
    clientId?: string;
    endpointId?: string;
    from?: Date;
    to?: Date;
  }) {
    const { page, pageSize, clientId, endpointId, from, to } = params;
    const where: Prisma.ClientBookingDataWhereInput = {
      ...(clientId ? { clientId } : {}),
      ...(endpointId ? { endpointId } : {}),
      ...(from || to
        ? {
            fetchedAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.clientBookingData.findMany({
        where,
        orderBy: { fetchedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { endpoint: { select: { name: true } } },
      }),
      prisma.clientBookingData.count({ where }),
    ]);

    return { items, total };
  }

  create(data: Prisma.ClientBookingDataCreateInput) {
    return prisma.clientBookingData.create({ data });
  }

  createMany(data: Prisma.ClientBookingDataCreateManyInput[]) {
    return prisma.clientBookingData.createMany({ data });
  }

  deleteByEndpointId(endpointId: string) {
    return prisma.clientBookingData.deleteMany({ where: { endpointId } });
  }
}

export const clientBookingDataRepository = new ClientBookingDataRepository();
