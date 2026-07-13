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
    return prisma.clientBookingEndpoint.findFirst({ where: { id, ...this.notDeleted } });
  }

  async list(params: ListParams & { clientId: string }) {
    const { page, pageSize, search, clientId } = params;
    const where: Prisma.ClientBookingEndpointWhereInput = {
      ...this.notDeleted,
      clientId,
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
      }),
      prisma.clientBookingEndpoint.count({ where }),
    ]);

    return { items, total };
  }

  create(data: Prisma.ClientBookingEndpointCreateInput) {
    return prisma.clientBookingEndpoint.create({ data });
  }

  update(id: string, data: Prisma.ClientBookingEndpointUpdateInput) {
    return prisma.clientBookingEndpoint.update({ where: { id }, data });
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
