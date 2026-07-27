import { Prisma, type RoomAttendantAvailability } from "@prisma/client";
import { prisma } from "@/util/prisma";

/**
 * Data-access for roomAttendant availability slots. Prisma queries only.
 */
const availabilityInclude = {
  client: {
    select: {
      id: true,
      userId: true,
      firstName: true,
      lastName: true,
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
} satisfies Prisma.RoomAttendantAvailabilityInclude;

export class RoomAttendantAvailabilityRepository {
  findById(id: string) {
    return prisma.roomAttendantAvailability.findUnique({
      where: { id },
      include: availabilityInclude,
    });
  }

  async list(params: {
    page: number;
    pageSize: number;
    clientId?: string;
    roomAttendantId?: string;
    fromDate?: Date;
    toDate?: Date;
    activeOnly?: boolean;
  }) {
    const { page, pageSize, clientId, roomAttendantId, fromDate, toDate, activeOnly } = params;
    const where: Prisma.RoomAttendantAvailabilityWhereInput = {
      deletedAt: null,
      ...(clientId ? { clientId } : {}),
      ...(roomAttendantId ? { roomAttendantId } : {}),
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
      prisma.roomAttendantAvailability.findMany({
        where,
        orderBy: [{ fromDate: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: availabilityInclude,
      }),
      prisma.roomAttendantAvailability.count({ where }),
    ]);

    return { items, total };
  }

  create(data: Prisma.RoomAttendantAvailabilityCreateInput) {
    return prisma.roomAttendantAvailability.create({
      data,
      include: availabilityInclude,
    });
  }

  update(id: string, data: Prisma.RoomAttendantAvailabilityUpdateInput) {
    return prisma.roomAttendantAvailability.update({
      where: { id },
      data,
      include: availabilityInclude,
    });
  }

  async hasOverlap(params: {
    clientId: string;
    roomAttendantId: string;
    fromDate: Date;
    toDate: Date | null;
    excludeId?: string;
  }) {
    const maxDate = new Date("9999-12-31T00:00:00.000Z");
    const to = params.toDate ?? maxDate;

    const existing = await prisma.roomAttendantAvailability.findFirst({
      where: {
        deletedAt: null,
        isActive: true,
        clientId: params.clientId,
        roomAttendantId: params.roomAttendantId,
        ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
        AND: [
          { fromDate: { lte: to } },
          {
            OR: [
              { toDate: null },
              { toDate: { gte: params.fromDate } },
            ],
          },
        ],
      },
      select: { id: true },
    });

    return !!existing;
  }

  softDelete(id: string, deletedBy?: string) {
    return prisma.roomAttendantAvailability.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, updatedBy: deletedBy },
    });
  }
}

export const roomAttendantAvailabilityRepository = new RoomAttendantAvailabilityRepository();
export type { RoomAttendantAvailability };
