import type { Role } from "@prisma/client";
import { userRepository } from "@/repositories/UserRepository";
import { hashPassword } from "@/lib/password";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { toPublicUser, type PublicUser } from "@/services/AuthService";
import type { CreateUserDTO, UpdateUserDTO } from "@/dto/user.dto";
import type { ActorContext, Paginated } from "@/models";
import type { PaginationDTO } from "@/dto/common.dto";

/**
 * User management. All methods here assume the caller has already been
 * authorized as SUPER_ADMIN at the API boundary, except the role-list helpers.
 */
export class UserService {
  async list(params: PaginationDTO & { role?: Role }): Promise<Paginated<PublicUser>> {
    const { items, total } = await userRepository.list({
      page: params.page,
      pageSize: params.pageSize,
      search: params.search,
      role: params.role,
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
      phone: dto.phone || null,
      role: dto.role,
      isActive: dto.isActive,
      createdBy: actor.userId,
      updatedBy: actor.userId,
    });

    return toPublicUser(user);
  }

  async update(id: string, dto: UpdateUserDTO, actor: ActorContext): Promise<PublicUser> {
    const existing = await userRepository.findById(id);
    if (!existing) throw new NotFoundError("User not found");

    const user = await userRepository.update(id, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone === "" ? null : dto.phone,
      role: dto.role,
      isActive: dto.isActive,
      updatedBy: actor.userId,
    });

    return toPublicUser(user);
  }

  async remove(id: string, actor: ActorContext): Promise<void> {
    const existing = await userRepository.findById(id);
    if (!existing) throw new NotFoundError("User not found");
    await userRepository.softDelete(id, actor.userId);
  }

  /** Active cleaners, for assignment dropdowns. */
  listCleaners() {
    return userRepository.listByRole("CLEANER").then((users) => users.map(toPublicUser));
  }

  listClients() {
    return userRepository.listByRole("CLIENT").then((users) => users.map(toPublicUser));
  }
}

export const userService = new UserService();
