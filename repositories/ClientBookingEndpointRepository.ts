import { Prisma, type ClientBookingEndpoint } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ListParams } from "@/models";

/**
 * Data-access for client booking endpoints. Prisma queries only — no business logic.
 */
export class ClientBookingEndpointRepository {
  private notDeleted = {
    deletedAt: null,
  } satisfies Prisma.ClientBookingEndpointWhereInput;

  findById(id: string) {
    return prisma.clientBookingEndpoint.findFirst({
      where: { id, ...this.notDeleted },
      include: { client: { select: { id: true, userId: true } } },
    });
  }

  async list(params: ListParams & { clientId: string }) {
    const { page, pageSize, search, clientId, status } = params;
    const where: Prisma.ClientBookingEndpointWhereInput = {
      ...this.notDeleted,
      clientId,
      ...(status === "active" ? { isActive: true } : {}),
      ...(status === "inactive" ? { isActive: false } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { url: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.clientBookingEndpoint.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { client: { select: { id: true, userId: true } } },
      }),
      prisma.clientBookingEndpoint.count({ where }),
    ]);

    return { items, total };
  }

  create(data: Prisma.ClientBookingEndpointCreateInput) {
    return prisma.clientBookingEndpoint.create({
      data,
      include: { client: { select: { id: true, userId: true } } },
    });
  }

  update(id: string, data: Prisma.ClientBookingEndpointUpdateInput) {
    return prisma.clientBookingEndpoint.update({
      where: { id },
      data,
      include: { client: { select: { id: true, userId: true } } },
    });
  }

  softDelete(id: string, deletedBy?: string) {
    return prisma.clientBookingEndpoint.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, updatedBy: deletedBy },
    });
  }
}

export const clientBookingEndpointRepository = new ClientBookingEndpointRepository();
export type { ClientBookingEndpoint };
