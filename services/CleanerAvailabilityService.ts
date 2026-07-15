import { cleanerAvailabilityRepository } from "@/repositories/CleanerAvailabilityRepository";
import { userRepository } from "@/repositories/UserRepository";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import type { ActorContext, Paginated } from "@/models";
import type { PaginationDTO } from "@/dto/common.dto";
import { prisma } from "@/lib/prisma";

export type CleanerAvailabilityView = {
  id: string;
  cleanerId: string;
  cleanerName: string;
  cleanerEmail: string;
  fromDate: string;
  toDate: string | null;
  note: string | null;
  isActive: boolean;
  createdAt: string;
};

export function toAvailabilityView(
  item: NonNullable<Awaited<ReturnType<typeof cleanerAvailabilityRepository.findById>>>,
): CleanerAvailabilityView {
  return {
    id: item.id,
    cleanerId: item.cleaner.userId,
    cleanerName: `${item.cleaner.firstName} ${item.cleaner.lastName}`,
    cleanerEmail: item.cleaner.Email,
    fromDate: item.fromDate.toISOString().slice(0, 10),
    toDate: item.toDate ? item.toDate.toISOString().slice(0, 10) : null,
    note: item.note,
    isActive: item.isActive,
    createdAt: item.createdAt.toISOString(),
  };
}

/**
 * Cleaner availability management. Cleaners manage their own slots; clients and
 * admins can view any cleaner's availability.
 */
export class CleanerAvailabilityService {
  private async resolveCleanerProfileId(userId: string) {
    const profile = await prisma.cleanerProfile.findUnique({
      where: { userId },
      select: { id: true, userId: true },
    });
    if (!profile) throw new NotFoundError("Cleaner profile not found");
    return profile;
  }

  async list(
    params: PaginationDTO & { cleanerId?: string; fromDate?: Date; toDate?: Date; activeOnly?: boolean },
    actor: ActorContext,
  ): Promise<Paginated<CleanerAvailabilityView>> {
    const cleanerId =
      actor.role === "CLEANER"
        ? (await this.resolveCleanerProfileId(actor.userId)).id
        : params.cleanerId
          ? (await this.resolveCleanerProfileId(params.cleanerId)).id
          : undefined;

    const { items, total } = await cleanerAvailabilityRepository.list({
      page: params.page,
      pageSize: params.pageSize,
      cleanerId,
      fromDate: params.fromDate,
      toDate: params.toDate,
      activeOnly: params.activeOnly,
    });

    return {
      items: items.map(toAvailabilityView),
      total,
      page: params.page,
      pageSize: params.pageSize,
      totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
    };
  }

  async create(
    params: { cleanerId: string; fromDate: Date; toDate?: Date | null; note?: string },
    actor: ActorContext,
  ) {
    const cleaner = await userRepository.findById(params.cleanerId);
    if (!cleaner || cleaner.role !== "CLEANER") {
      throw new NotFoundError("Cleaner not found");
    }

    if (actor.role === "CLEANER" && actor.userId !== params.cleanerId) {
      throw new ForbiddenError();
    }

    if (params.toDate && params.toDate < params.fromDate) {
      throw new ConflictError("To date must be on or after from date");
    }

    const cleanerProfile = await this.resolveCleanerProfileId(params.cleanerId);

    const availability = await cleanerAvailabilityRepository.create({
      cleaner: { connect: { id: cleanerProfile.id } },
      fromDate: params.fromDate,
      toDate: params.toDate ?? null,
      note: params.note,
      createdBy: actor.userId,
      updatedBy: actor.userId,
    });

    return toAvailabilityView(availability);
  }

  async update(
    id: string,
    params: { fromDate?: Date; toDate?: Date | null; note?: string | null; isActive?: boolean },
    actor: ActorContext,
  ) {
    const existing = await cleanerAvailabilityRepository.findById(id);
    if (!existing) throw new NotFoundError("Availability not found");

    if (actor.role === "CLEANER" && actor.userId !== existing.cleaner.userId) {
      throw new ForbiddenError();
    }

    if (
      params.fromDate &&
      params.toDate &&
      params.toDate < params.fromDate
    ) {
      throw new ConflictError("To date must be on or after from date");
    }

    const availability = await cleanerAvailabilityRepository.update(id, {
      fromDate: params.fromDate,
      toDate: params.toDate === undefined ? undefined : (params.toDate ?? null),
      note: params.note,
      isActive: params.isActive,
      updatedBy: actor.userId,
    });

    return toAvailabilityView(availability);
  }

  async remove(id: string, actor: ActorContext) {
    const existing = await cleanerAvailabilityRepository.findById(id);
    if (!existing) throw new NotFoundError("Availability not found");

    if (actor.role === "CLEANER" && actor.userId !== existing.cleaner.userId) {
      throw new ForbiddenError();
    }

    await cleanerAvailabilityRepository.softDelete(id, actor.userId);
  }
}

export const cleanerAvailabilityService = new CleanerAvailabilityService();
