import { Prisma, type BookingFetchData, type GuestBookingInfo } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Data-access for client booking data (cron job responses).
 * Prisma queries only — no business logic.
 */
export class GuestBookingInfoRepository {
  findById(id: string) {
    return prisma.guestBookingInfo.findUnique({
      where: { id },
      include: {
        endpoint: { select: { name: true } },
        fetchData: { select: { rawData: true, fetchedAt: true } },
      },
    });
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
    const where: Prisma.GuestBookingInfoWhereInput = {
      ...(clientId ? { clientId } : {}),
      ...(endpointId ? { endpointId } : {}),
      ...(from || to
        ? {
            fetchData: {
              fetchedAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.guestBookingInfo.findMany({
        where,
        orderBy: [{ fetchData: { fetchedAt: "desc" } }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          endpoint: { select: { name: true } },
          fetchData: { select: { rawData: true, fetchedAt: true } },
        },
      }),
      prisma.guestBookingInfo.count({ where }),
    ]);

    return { items, total };
  }

  create(data: Prisma.GuestBookingInfoCreateInput) {
    return prisma.guestBookingInfo.create({ data });
  }

  createMany(data: Prisma.GuestBookingInfoCreateManyInput[]) {
    return prisma.guestBookingInfo.createMany({ data, skipDuplicates: true });
  }

  upsertFetchData(params: {
    endpointId: string;
    clientId: string;
    payloadHash: string;
    rawData: Prisma.InputJsonValue;
    fetchedAt: Date;
  }): Promise<BookingFetchData> {
    return prisma.bookingFetchData.upsert({
      where: {
        endpointId_payloadHash: {
          endpointId: params.endpointId,
          payloadHash: params.payloadHash,
        },
      },
      update: {
        fetchedAt: params.fetchedAt,
      },
      create: {
        endpointId: params.endpointId,
        clientId: params.clientId,
        payloadHash: params.payloadHash,
        rawData: params.rawData,
        fetchedAt: params.fetchedAt,
      },
    });
  }

  listForCleanerClientsCalendar(params: {
    clientIds: string[];
    from: Date;
    to: Date;
  }) {
    if (!params.clientIds.length) return Promise.resolve([]);
    return prisma.guestBookingInfo.findMany({
      where: {
        clientId: { in: params.clientIds },
        // Scope by fetch time (like the client calendar) so bookings with null
        // startDate/endDate are not dropped — they simply render on their own dates.
        fetchData: {
          fetchedAt: { gte: params.from, lte: params.to },
        },
      },
      include: {
        endpoint: { select: { id: true, name: true } },
        client: { select: { firstName: true, lastName: true } },
        fetchData: { select: { fetchedAt: true } },
      },
      orderBy: [{ fetchData: { fetchedAt: "desc" } }, { createdAt: "desc" }],
      take: 2000,
    });
  }

  listForClientCalendar(params: {
    clientId: string;
    from: Date;
    to: Date;
  }) {
    return prisma.guestBookingInfo.findMany({
      where: {
        clientId: params.clientId,
        OR: [
          {
            startDate: { gte: params.from, lte: params.to },
          },
          {
            endDate: { gte: params.from, lte: params.to },
          },
          {
            startDate: { lte: params.from },
            endDate: { gte: params.to },
          },
        ],
      },
      include: {
        endpoint: {
          select: { id: true, name: true },
        },
        fetchData: {
          select: { fetchedAt: true },
        },
      },
      orderBy: [{ fetchData: { fetchedAt: "desc" } }, { createdAt: "desc" }],
      take: 2000,
    });
  }

  deleteByEndpointId(endpointId: string) {
    return prisma.guestBookingInfo.deleteMany({ where: { endpointId } });
  }
}

export const guestBookingInfoRepository = new GuestBookingInfoRepository();
export type { GuestBookingInfo };
