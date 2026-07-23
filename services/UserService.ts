import type { Role } from "@/models/role";
import { userRepository } from "@/repositories/UserRepository";
import { hashPassword } from "@/lib/password";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { toPublicUser, type PublicUser } from "@/services/AuthService";
import type { CreateUserDTO, UpdateUserDTO } from "@/dto/user.dto";
import type { ActorContext, Paginated } from "@/models";
import type { PaginationDTO } from "@/dto/common.dto";

/**
 * User management. All methods here assume the caller has already been
 * authorized as SUPER_ADMIN at the API boundary, except the role-list helpers.
 */
export class UserService {
  async list(params: PaginationDTO & { role?: Role; clientId?: string }): Promise<Paginated<PublicUser>> {
    const { items, total } = await userRepository.list({
      page: params.page,
      pageSize: params.pageSize,
      search: params.search,
      role: params.role,
      status: params.status,
      clientId: params.clientId,
    });

    return {
      items: items.map(toPublicUser),
      total,
      page: params.page,
      pageSize: params.pageSize,
      totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
    };
  }

  async getById(id: string): Promise<PublicUser> {
    const user = await userRepository.findById(id);
    if (!user) throw new NotFoundError("User not found");
    return toPublicUser(user);
  }

  async create(dto: CreateUserDTO, actor: ActorContext): Promise<PublicUser> {
    const email = dto.email.toLowerCase();
    if (await userRepository.findAnyByEmail(email)) {
      throw new ConflictError("An account with this email already exists");
    }

    const user = await userRepository.create({
      email,
      passwordHash: await hashPassword(dto.password),
      firstName: dto.firstName,
      lastName: dto.lastName,
      smsGatewayId: dto.smsGatewayId || null,
      phone: dto.phone || null,
      role: dto.role,
      isActive: dto.isActive,
      clientProfile: {
        companyName: dto.companyName || null,
        portfolioSize: dto.portfolioSize ?? null,
        timezone: dto.timezone || null,
      },
      roomAttendantProfile: {
        serviceArea: dto.serviceArea || null,
        hourlyRate: dto.hourlyRate ?? null,
        rating: dto.rating ?? null,
        clientId: dto.clientId ?? null,
      },
      createdBy: actor.userId,
      updatedBy: actor.userId,
    });

    return toPublicUser(user);
  }

  async update(id: string, dto: UpdateUserDTO, actor: ActorContext): Promise<PublicUser> {
    const existing = await userRepository.findById(id);
    if (!existing) throw new NotFoundError("User not found");

    // Non-admins (clients) may only manage roomAttendant accounts and cannot change roles.
    const isAdmin = actor.role === "SUPER_ADMIN";
    if (!isAdmin && !(actor.role === "CLIENT" && existing.role === "ROOMATTENDATNT")) {
      throw new ForbiddenError();
    }

    const user = await userRepository.update(id, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      smsGatewayId: dto.smsGatewayId === undefined ? undefined : dto.smsGatewayId || null,
      phone: dto.phone === "" ? null : dto.phone,
      role: isAdmin ? dto.role : undefined,
      isActive: dto.isActive,
      clientProfile: {
        companyName: dto.companyName === undefined ? undefined : dto.companyName || null,
        portfolioSize: dto.portfolioSize,
        timezone: dto.timezone === undefined ? undefined : dto.timezone || null,
      },
      roomAttendantProfile: {
        serviceArea: dto.serviceArea === undefined ? undefined : dto.serviceArea || null,
        hourlyRate: dto.hourlyRate,
        rating: dto.rating,
        clientId: dto.clientId === undefined ? undefined : dto.clientId || null,
      },
      updatedBy: actor.userId,
    });

    return toPublicUser(user);
  }

  async remove(id: string, actor: ActorContext): Promise<void> {
    const existing = await userRepository.findById(id);
    if (!existing) throw new NotFoundError("User not found");

    // Non-admins (clients) may only delete roomAttendant accounts.
    if (
      actor.role !== "SUPER_ADMIN" &&
      !(actor.role === "CLIENT" && existing.role === "ROOMATTENDATNT")
    ) {
      throw new ForbiddenError();
    }

    await userRepository.softDelete(id, actor.userId);
  }

  /** Active roomAttendants, for assignment dropdowns. Optionally filter by clientId. */
  listRoomAttendants(clientId?: string) {
    return userRepository.listByRole("ROOMATTENDATNT", clientId).then((users) => users.map(toPublicUser));
  }

  listClients() {
    return userRepository.listByRole("CLIENT").then((users) => users.map(toPublicUser));
  }
}

export const userService = new UserService();
