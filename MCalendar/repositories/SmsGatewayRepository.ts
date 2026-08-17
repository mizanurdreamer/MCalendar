import { Prisma, type SmsGateway } from "@prisma/client";
import { prisma } from "@/util/prisma";
import type { ListParams } from "@/models";

/**
 * Data-access for SMS gateways. Prisma queries only - no business logic.
 */
export class SmsGatewayRepository {
  private notDeleted = {
    deletedAt: null,
  } satisfies Prisma.SmsGatewayWhereInput;

  findById(id: string) {
    return prisma.smsGateway.findFirst({
      where: { id, ...this.notDeleted },
    });
  }

  async list(params: ListParams) {
    const { page, pageSize, search, status } = params;
    const where: Prisma.SmsGatewayWhereInput = {
      ...this.notDeleted,
      ...(status === "active" ? { isActive: true } : {}),
      ...(status === "inactive" ? { isActive: false } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { domain: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.smsGateway.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.smsGateway.count({ where }),
    ]);

    return { items, total };
  }

  create(data: Prisma.SmsGatewayCreateInput) {
    return prisma.smsGateway.create({ data });
  }

  update(id: string, data: Prisma.SmsGatewayUpdateInput) {
    return prisma.smsGateway.update({
      where: { id },
      data,
    });
  }

  softDelete(id: string, deletedBy?: string) {
    return prisma.smsGateway.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, updatedBy: deletedBy },
    });
  }
}

export const smsGatewayRepository = new SmsGatewayRepository();
export type { SmsGateway };
