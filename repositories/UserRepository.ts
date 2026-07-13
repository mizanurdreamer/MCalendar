import { Prisma, type Role, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ListParams } from "@/models";

/**
 * Data-access for users. Prisma queries only — no business logic.
 */
export class UserRepository {
  private notDeleted = { deletedAt: null } satisfies Prisma.UserWhereInput;

  findById(id: string) {
    return prisma.user.findFirst({ where: { id, ...this.notDeleted } });
  }

  findByEmail(email: string) {
    return prisma.user.findFirst({
      where: { email: email.toLowerCase(), ...this.notDeleted },
    });
  }

  /** Includes soft-deleted; used to enforce email uniqueness at registration. */
  findAnyByEmail(email: string) {
    return prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  async list(params: ListParams & { role?: Role }) {
    const { page, pageSize, search, role } = params;
    const where: Prisma.UserWhereInput = {
      ...this.notDeleted,
      ...(role ? { role } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.user.count({ where }),
    ]);

    return { items, total };
  }

  listByRole(role: Role) {
    return prisma.user.findMany({
      where: { role, isActive: true, ...this.notDeleted },
      orderBy: { firstName: "asc" },
    });
  }

  create(data: Prisma.UserCreateInput) {
    return prisma.user.create({ data });
  }

  update(id: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({ where: { id }, data });
  }

  softDelete(id: string, deletedBy?: string) {
    return prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, updatedBy: deletedBy },
    });
  }

  count(where?: Prisma.UserWhereInput) {
    return prisma.user.count({ where: { ...this.notDeleted, ...where } });
  }
}

export const userRepository = new UserRepository();
export type { User };
