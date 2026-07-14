import { cleanerTaskScheduleRepository } from "@/repositories/CleanerTaskScheduleRepository";
import { userRepository } from "@/repositories/UserRepository";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import type { ActorContext, Paginated } from "@/models";
import type { PaginationDTO } from "@/dto/common.dto";

export type CleanerTaskScheduleView = {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  cleanerId: string;
  cleanerName: string;
  cleanerEmail: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  createdAt: string;
};

export function toTaskScheduleView(
  item: NonNullable<Awaited<ReturnType<typeof cleanerTaskScheduleRepository.findById>>>,
): CleanerTaskScheduleView {
  return {
    id: item.id,
    clientId: item.clientId,
    clientName: `${item.client.firstName} ${item.client.lastName}`,
    clientEmail: item.client.email,
    cleanerId: item.cleanerId,
    cleanerName: `${item.cleaner.firstName} ${item.cleaner.lastName}`,
    cleanerEmail: item.cleaner.email,
    startDate: item.startDate.toISOString(),
    endDate: item.endDate?.toISOString() ?? null,
    isActive: item.isActive,
    createdAt: item.createdAt.toISOString(),
  };
}

/**
 * Cleaner task schedule management. Clients assign cleaners for date ranges.
 */
export class CleanerTaskScheduleService {
  async list(
    params: PaginationDTO & { clientId?: string; cleanerId?: string; activeOnly?: boolean },
    actor: ActorContext,
  ): Promise<Paginated<CleanerTaskScheduleView>> {
    // Clients can only see their own task schedules
    const clientId = actor.role === "CLIENT" ? actor.userId : params.clientId;
    const cleanerId = actor.role === "CLEANER" ? actor.userId : params.cleanerId;

    const { items, total } = await cleanerTaskScheduleRepository.list({
      page: params.page,
      pageSize: params.pageSize,
      clientId,
      cleanerId,
      activeOnly: params.activeOnly,
    });

    return {
      items: items.map(toTaskScheduleView),
      total,
      page: params.page,
      pageSize: params.pageSize,
      totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
    };
  }

  async getActiveForClient(clientId: string, date?: Date) {
    const taskSchedules = await cleanerTaskScheduleRepository.findActiveForClient(clientId, date);
    return taskSchedules.map((a) => ({
      id: a.id,
      cleanerId: a.cleanerId,
      cleanerName: `${a.cleaner.firstName} ${a.cleaner.lastName}`,
      cleanerEmail: a.cleaner.email,
      cleanerPhone: a.cleaner.phone,
      startDate: a.startDate.toISOString(),
      endDate: a.endDate?.toISOString() ?? null,
    }));
  }

  async create(
    params: { clientId: string; cleanerId: string; startDate: Date; endDate?: Date },
    actor: ActorContext,
  ) {
    // Verify both users exist with correct roles
    const client = await userRepository.findById(params.clientId);
    if (!client || client.role !== "CLIENT") {
      throw new NotFoundError("Client not found");
    }

    const cleaner = await userRepository.findById(params.cleanerId);
    if (!cleaner || cleaner.role !== "CLEANER") {
      throw new NotFoundError("Cleaner not found");
    }

    // Non-admins can only assign to themselves
    if (actor.role !== "SUPER_ADMIN" && actor.userId !== params.clientId) {
      throw new ForbiddenError();
    }

    // Validate date range
    if (params.endDate && params.endDate <= params.startDate) {
      throw new ConflictError("End date must be after start date");
    }

    const taskSchedule = await cleanerTaskScheduleRepository.create({
      client: { connect: { id: params.clientId } },
      cleaner: { connect: { id: params.cleanerId } },
      startDate: params.startDate,
      endDate: params.endDate ?? null,
      createdBy: actor.userId,
      updatedBy: actor.userId,
    });

    return toTaskScheduleView(taskSchedule);
  }

  async update(
    id: string,
    params: { endDate?: Date; isActive?: boolean },
    actor: ActorContext,
  ) {
    const existing = await cleanerTaskScheduleRepository.findById(id);
    if (!existing) throw new NotFoundError("Task schedule not found");

    // Non-admins can only update their own task schedules
    if (actor.role !== "SUPER_ADMIN" && actor.userId !== existing.clientId) {
      throw new ForbiddenError();
    }

    const taskSchedule = await cleanerTaskScheduleRepository.update(id, {
      endDate: params.endDate,
      isActive: params.isActive,
      updatedBy: actor.userId,
    });

    return toTaskScheduleView(taskSchedule);
  }

  async remove(id: string, actor: ActorContext) {
    const existing = await cleanerTaskScheduleRepository.findById(id);
    if (!existing) throw new NotFoundError("Task schedule not found");

    // Non-admins can only remove their own task schedules
    if (actor.role !== "SUPER_ADMIN" && actor.userId !== existing.clientId) {
      throw new ForbiddenError();
    }

    await cleanerTaskScheduleRepository.softDelete(id, actor.userId);
  }
}

export const cleanerTaskScheduleService = new CleanerTaskScheduleService();
