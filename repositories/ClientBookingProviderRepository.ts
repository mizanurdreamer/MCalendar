import { Prisma, type ClientBookingProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ListParams } from "@/models";

/**
 * Data-access for client booking providers. Prisma queries only — no business logic.
 */
export class ClientBookingProviderRepository {
  private notDeleted = {
    deletedAt: null,
  } satisfies Prisma.ClientBookingProviderWhereInput;

  findById(id: string) {
    return prisma.clientBookingProvider.findFirst({
      where: { id, ...this.notDeleted },
      include: { client: { select: { id: true, userId: true } } },
    });
  }

  async list(params: ListParams & { clientId: string }) {
    const { page, pageSize, search, clientId, status } = params;
    const where: Prisma.ClientBookingProviderWhereInput = {
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
      prisma.clientBookingProvider.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { client: { select: { id: true, userId: true } } },
      }),
      prisma.clientBookingProvider.count({ where }),
    ]);

    return { items, total };
  }

  create(data: Prisma.ClientBookingProviderCreateInput) {
    return prisma.clientBookingProvider.create({
      data,
      include: { client: { select: { id: true, userId: true } } },
    });
  }

  update(id: string, data: Prisma.ClientBookingProviderUpdateInput) {
    return prisma.clientBookingProvider.update({
      where: { id },
      data,
      include: { client: { select: { id: true, userId: true } } },
    });
  }

  softDelete(id: string, deletedBy?: string) {
    return prisma.clientBookingProvider.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, updatedBy: deletedBy },
    });
  }
}

export const clientBookingProviderRepository = new ClientBookingProviderRepository();
export type { ClientBookingProvider };
