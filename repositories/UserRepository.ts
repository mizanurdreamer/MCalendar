import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ListParams, Role } from "@/models";

type UserWithRelations = Prisma.UserGetPayload<{
  include: {
    role: true;
    clientProfile: { include: { smsGateway: true } };
    cleanerProfile: { include: { smsGateway: true } };
  };
}>;

type MappedProfile = {
  id: string | null;
  companyName: string | null;
  primaryContact: string | null;
  portfolioSize: number | null;
  timezone: string | null;
  serviceArea: string | null;
  hourlyRate: number | null;
  rating: Prisma.Decimal | null;
  clientId: string | null;
};

export type User = {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  firstName: string;
  lastName: string;
  smsGatewayId: string | null;
  smsGatewayName: string | null;
  phone: string | null;
  clientProfile: MappedProfile | null;
  cleanerProfile: MappedProfile | null;
};

type CreateUserInput = {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  smsGatewayId?: string | null;
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
    clientId?: string | null;
  };
};

type UpdateUserInput = {
  firstName?: string;
  lastName?: string;
  smsGatewayId?: string | null;
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
    clientId?: string | null;
  };
};

/**
 * Data-access for users. Prisma queries only - no business logic.
 */
export class UserRepository {
  private notDeleted = { deletedAt: null } satisfies Prisma.UserWhereInput;
  private withRole = {
    role: true,
    clientProfile: { include: { smsGateway: true } },
    cleanerProfile: { include: { smsGateway: true } },
  } satisfies Prisma.UserInclude;

  private emptyToNull(value?: string | null) {
    if (value === undefined) return undefined;
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private splitDisplayName(displayName: string): { firstName: string; lastName: string } {
    const normalized = displayName.trim().replace(/\s+/g, " ");
    if (!normalized) return { firstName: "", lastName: "" };
    const parts = normalized.split(" ");
    if (parts.length === 1) return { firstName: parts[0], lastName: "" };
    return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
  }

  private joinName(firstName?: string | null, lastName?: string | null): string {
    const full = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ").trim();
    return full || "Unnamed User";
  }

  private mapUser(user: UserWithRelations | null): User | null {
    if (!user) return null;
    const { firstName, lastName } = user.clientProfile
      ? {
          firstName: user.clientProfile.firstName,
          lastName: user.clientProfile.lastName,
        }
      : user.cleanerProfile
        ? {
            firstName: user.cleanerProfile.firstName,
            lastName: user.cleanerProfile.lastName,
          }
        : this.splitDisplayName(user.displayName);

    const phoneFromProfile =
      this.emptyToNull(user.clientProfile?.phoneNo) ??
      this.emptyToNull(user.cleanerProfile?.phoneNo) ??
      null;

    return {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      displayName: user.displayName,
      role: user.role.name as Role,
      isActive: user.isActive,
      isDeleted: user.isDeleted,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      createdBy: user.createdBy,
      updatedBy: user.updatedBy,
      deletedAt: user.deletedAt,
      firstName,
      lastName,
      smsGatewayId: user.clientProfile?.smsGatewayId ?? user.cleanerProfile?.smsGatewayId ?? null,
      smsGatewayName:
        user.clientProfile?.smsGateway?.name ?? user.cleanerProfile?.smsGateway?.name ?? null,
      phone: phoneFromProfile,
      clientProfile: user.clientProfile
        ? {
            id: user.clientProfile.id,
            companyName: user.clientProfile.companyName,
            primaryContact: this.joinName(
              user.clientProfile.firstName,
              user.clientProfile.lastName,
            ),
            portfolioSize: user.clientProfile.portfolioSize,
            timezone: user.clientProfile.timezone,
            serviceArea: null,
            hourlyRate: null,
            rating: null,
            clientId: null,
          }
        : null,
      cleanerProfile: user.cleanerProfile
        ? {
            id: user.cleanerProfile.id,
            companyName: null,
            primaryContact: null,
            portfolioSize: null,
            timezone: null,
            serviceArea: user.cleanerProfile.serviceArea,
            hourlyRate: user.cleanerProfile.hourlyRate,
            rating: user.cleanerProfile.rating,
            clientId: user.cleanerProfile.clientId,
          }
        : null,
    };
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
    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase(), isActive: true, isDeleted: false },
      include: this.withRole,
    });
    return this.mapUser(user);
  }

  async list(params: ListParams & { role?: Role }) {
    const { page, pageSize, search, role, status, clientId } = params;
    const where: Prisma.UserWhereInput = {
      ...this.notDeleted,
      ...(role ? { role: { name: role } } : {}),
      ...(status === "active" ? { isActive: true } : {}),
      ...(status === "inactive" ? { isActive: false } : {}),
      ...(clientId ? { cleanerProfile: { clientId } } : {}),
      ...(search
        ? {
            OR: [
              { displayName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { clientProfile: { is: { firstName: { contains: search, mode: "insensitive" } } } },
              { clientProfile: { is: { lastName: { contains: search, mode: "insensitive" } } } },
              { cleanerProfile: { is: { firstName: { contains: search, mode: "insensitive" } } } },
              { cleanerProfile: { is: { lastName: { contains: search, mode: "insensitive" } } } },
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

  async listByRole(role: Role, clientId?: string) {
    const where: Prisma.UserWhereInput = {
      role: { name: role },
      isActive: true,
      ...this.notDeleted,
      ...(clientId ? { cleanerProfile: { clientId } } : {}),
    };

    const users = await prisma.user.findMany({
      where,
      orderBy: { displayName: "asc" },
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
          displayName: this.joinName(data.firstName, data.lastName),
          isActive: data.isActive ?? true,
          createdBy: data.createdBy,
          updatedBy: data.updatedBy,
          role: { connect: { name: data.role } },
          ...(data.role === "CLIENT"
            ? {
                clientProfile: {
                  create: {
                    Email: data.email.toLowerCase(),
                    firstName: data.firstName,
                    lastName: data.lastName,
                    smsGatewayId: data.smsGatewayId ?? null,
                    phoneNo: this.emptyToNull(data.phone) ?? "",
                    companyName: this.emptyToNull(data.clientProfile?.companyName) ?? null,
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
                    Email: data.email.toLowerCase(),
                    firstName: data.firstName,
                    lastName: data.lastName,
                    smsGatewayId: data.smsGatewayId ?? null,
                    phoneNo: this.emptyToNull(data.phone) ?? "",
                    serviceArea: this.emptyToNull(data.cleanerProfile?.serviceArea) ?? null,
                    hourlyRate: data.cleanerProfile?.hourlyRate ?? null,
                    rating: data.cleanerProfile?.rating ?? null,
                    clientId: data.cleanerProfile?.clientId ?? null,
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
      const currentUser = await tx.user.findUnique({
        where: { id },
        include: this.withRole,
      });
      if (!currentUser) {
        throw new Error("User not found");
      }
      const mappedCurrent = this.mapUser(currentUser) as User;
      const nextFirstName =
        data.firstName === undefined ? mappedCurrent.firstName : data.firstName;
      const nextLastName = data.lastName === undefined ? mappedCurrent.lastName : data.lastName;

      await tx.user.update({
        where: { id },
        data: {
          ...(data.firstName !== undefined || data.lastName !== undefined
            ? {
                displayName: this.joinName(
                  nextFirstName,
                  nextLastName,
                ),
              }
            : {}),
          isActive: data.isActive,
          updatedBy: data.updatedBy,
          ...(data.role ? { role: { connect: { name: data.role } } } : {}),
        },
      });

      if (data.role === "CLIENT" || data.clientProfile) {
        await tx.clientProfile.upsert({
          where: { userId: id },
          update: {
            firstName: data.firstName,
            lastName: data.lastName,
            smsGatewayId: data.smsGatewayId ?? undefined,
            ...(data.phone !== undefined
              ? { phoneNo: this.emptyToNull(data.phone) ?? "" }
              : {}),
            companyName: this.emptyToNull(data.clientProfile?.companyName),
            portfolioSize: data.clientProfile?.portfolioSize,
            timezone: this.emptyToNull(data.clientProfile?.timezone),
            deletedAt: null,
            updatedBy: data.updatedBy,
          },
          create: {
            userId: id,
            Email: currentUser.email,
            firstName: data.firstName ?? mappedCurrent.firstName,
            lastName: data.lastName ?? mappedCurrent.lastName,
            smsGatewayId: data.smsGatewayId ?? null,
            phoneNo: this.emptyToNull(data.phone) ?? "",
            companyName: this.emptyToNull(data.clientProfile?.companyName) ?? null,
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
            firstName: data.firstName,
            lastName: data.lastName,
            smsGatewayId: data.smsGatewayId ?? undefined,
            ...(data.phone !== undefined
              ? { phoneNo: this.emptyToNull(data.phone) ?? "" }
              : {}),
            serviceArea: this.emptyToNull(data.cleanerProfile?.serviceArea),
            hourlyRate: data.cleanerProfile?.hourlyRate,
            rating: data.cleanerProfile?.rating,
            clientId: data.cleanerProfile?.clientId ?? undefined,
            deletedAt: null,
            updatedBy: data.updatedBy,
          },
          create: {
            userId: id,
            Email: currentUser.email,
            firstName: data.firstName ?? mappedCurrent.firstName,
            lastName: data.lastName ?? mappedCurrent.lastName,
            smsGatewayId: data.smsGatewayId ?? null,
            phoneNo: this.emptyToNull(data.phone) ?? "",
            serviceArea: this.emptyToNull(data.cleanerProfile?.serviceArea) ?? null,
            hourlyRate: data.cleanerProfile?.hourlyRate ?? null,
            rating: data.cleanerProfile?.rating ?? null,
            clientId: data.cleanerProfile?.clientId ?? null,
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
