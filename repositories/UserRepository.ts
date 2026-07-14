import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ListParams, Role } from "@/models";

type UserWithRelations = Prisma.UserGetPayload<{
  include: { role: true; clientProfile: true; cleanerProfile: true };
}>;

export type User = Omit<UserWithRelations, "role"> & { role: Role };

type CreateUserInput = {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  role: Role;
  isActive?: boolean;
  createdBy?: string;
  updatedBy?: string;
  clientProfile?: {
    companyName?: string | null;
    primaryContact?: string | null;
    portfolioSize?: number | null;
    timezone?: string | null;
  };
  cleanerProfile?: {
    serviceArea?: string | null;
    hourlyRate?: number | null;
    rating?: number | null;
  };
};

type UpdateUserInput = {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  role?: Role;
  isActive?: boolean;
  updatedBy?: string;
  clientProfile?: {
    companyName?: string | null;
    primaryContact?: string | null;
    portfolioSize?: number | null;
    timezone?: string | null;
  };
  cleanerProfile?: {
    serviceArea?: string | null;
    hourlyRate?: number | null;
    rating?: number | null;
  };
};

/**
 * Data-access for users. Prisma queries only - no business logic.
 */
export class UserRepository {
  private notDeleted = { deletedAt: null } satisfies Prisma.UserWhereInput;
  private withRole = {
    role: true,
    clientProfile: true,
    cleanerProfile: true,
  } satisfies Prisma.UserInclude;

  private emptyToNull(value?: string | null) {
    if (value === undefined) return undefined;
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private mapUser(user: UserWithRelations | null): User | null {
    if (!user) return null;
    const { role, ...rest } = user;
    return { ...rest, role: role.name as Role };
  }

  async findById(id: string) {
    const user = await prisma.user.findFirst({
      where: { id, ...this.notDeleted },
      include: this.withRole,
    });
    return this.mapUser(user);
  }

  async findByEmail(email: string) {
    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase(), ...this.notDeleted },
      include: this.withRole,
    });
    return this.mapUser(user);
  }

  /** Includes soft-deleted; used to enforce email uniqueness at registration. */
  async findAnyByEmail(email: string) {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: this.withRole,
    });
    return this.mapUser(user);
  }

  async list(params: ListParams & { role?: Role }) {
    const { page, pageSize, search, role, status } = params;
    const where: Prisma.UserWhereInput = {
      ...this.notDeleted,
      ...(role ? { role: { name: role } } : {}),
      ...(status === "active" ? { isActive: true } : {}),
      ...(status === "inactive" ? { isActive: false } : {}),
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
        include: this.withRole,
      }),
      prisma.user.count({ where }),
    ]);

    return { items: items.map((u) => this.mapUser(u) as User), total };
  }

  async listByRole(role: Role) {
    const users = await prisma.user.findMany({
      where: { role: { name: role }, isActive: true, ...this.notDeleted },
      orderBy: { firstName: "asc" },
      include: this.withRole,
    });

    return users.map((u) => this.mapUser(u) as User);
  }

  create(data: CreateUserInput) {
    return prisma.user
      .create({
        data: {
          email: data.email.toLowerCase(),
          passwordHash: data.passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone ?? null,
          isActive: data.isActive ?? true,
          createdBy: data.createdBy,
          updatedBy: data.updatedBy,
          role: { connect: { name: data.role } },
          ...(data.role === "CLIENT"
            ? {
                clientProfile: {
                  create: {
                    companyName: this.emptyToNull(data.clientProfile?.companyName) ?? null,
                    primaryContact: this.emptyToNull(data.clientProfile?.primaryContact) ?? null,
                    portfolioSize: data.clientProfile?.portfolioSize ?? null,
                    timezone: this.emptyToNull(data.clientProfile?.timezone) ?? null,
                    createdBy: data.createdBy,
                    updatedBy: data.updatedBy,
                  },
                },
              }
            : {}),
          ...(data.role === "CLEANER"
            ? {
                cleanerProfile: {
                  create: {
                    serviceArea: this.emptyToNull(data.cleanerProfile?.serviceArea) ?? null,
                    hourlyRate: data.cleanerProfile?.hourlyRate ?? null,
                    rating: data.cleanerProfile?.rating ?? null,
                    createdBy: data.createdBy,
                    updatedBy: data.updatedBy,
                  },
                },
              }
            : {}),
        },
        include: this.withRole,
      })
      .then((u) => this.mapUser(u) as User);
  }

  async update(id: string, data: UpdateUserInput) {
    return prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          isActive: data.isActive,
          updatedBy: data.updatedBy,
          ...(data.role ? { role: { connect: { name: data.role } } } : {}),
        },
      });

      if (data.role === "CLIENT" || data.clientProfile) {
        await tx.clientProfile.upsert({
          where: { userId: id },
          update: {
            companyName: this.emptyToNull(data.clientProfile?.companyName),
            primaryContact: this.emptyToNull(data.clientProfile?.primaryContact),
            portfolioSize: data.clientProfile?.portfolioSize,
            timezone: this.emptyToNull(data.clientProfile?.timezone),
            deletedAt: null,
            updatedBy: data.updatedBy,
          },
          create: {
            userId: id,
            companyName: this.emptyToNull(data.clientProfile?.companyName) ?? null,
            primaryContact: this.emptyToNull(data.clientProfile?.primaryContact) ?? null,
            portfolioSize: data.clientProfile?.portfolioSize ?? null,
            timezone: this.emptyToNull(data.clientProfile?.timezone) ?? null,
            createdBy: data.updatedBy,
            updatedBy: data.updatedBy,
          },
        });
        if (data.role === "CLIENT") {
          await tx.cleanerProfile.deleteMany({ where: { userId: id } });
        }
      }

      if (data.role === "CLEANER" || data.cleanerProfile) {
        await tx.cleanerProfile.upsert({
          where: { userId: id },
          update: {
            serviceArea: this.emptyToNull(data.cleanerProfile?.serviceArea),
            hourlyRate: data.cleanerProfile?.hourlyRate,
            rating: data.cleanerProfile?.rating,
            deletedAt: null,
            updatedBy: data.updatedBy,
          },
          create: {
            userId: id,
            serviceArea: this.emptyToNull(data.cleanerProfile?.serviceArea) ?? null,
            hourlyRate: data.cleanerProfile?.hourlyRate ?? null,
            rating: data.cleanerProfile?.rating ?? null,
            createdBy: data.updatedBy,
            updatedBy: data.updatedBy,
          },
        });
        if (data.role === "CLEANER") {
          await tx.clientProfile.deleteMany({ where: { userId: id } });
        }
      }

      if (data.role === "SUPER_ADMIN") {
        await tx.clientProfile.deleteMany({ where: { userId: id } });
        await tx.cleanerProfile.deleteMany({ where: { userId: id } });
      }

      const updated = await tx.user.findUnique({
        where: { id },
        include: this.withRole,
      });

      return this.mapUser(updated) as User;
    });
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
