import { cleanerTaskScheduleRepository } from "@/repositories/CleanerTaskScheduleRepository";
import { guestBookingInfoRepository } from "@/repositories/GuestBookingInfoRepository";
import { cleanerAvailabilityRepository } from "@/repositories/CleanerAvailabilityRepository";
import { userRepository } from "@/repositories/UserRepository";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import type { ActorContext, Paginated } from "@/models";
import type {
  CleaningStatus,
  CleanerCalendarDataView,
  CleanerCalendarEventView,
} from "@/models/view";
import type { PaginationDTO } from "@/dto/common.dto";
import { prisma } from "@/lib/prisma";

export const CLEANING_STATUSES: CleaningStatus[] = [
  "ASSIGNED",
  "CONFIRMED",
  "IN_PROGRESS",
  "DONE",
  "CANCELLED",
];

const STATUS_RANK: Record<CleaningStatus, number> = {
  ASSIGNED: 0,
  CONFIRMED: 1,
  IN_PROGRESS: 2,
  DONE: 3,
  CANCELLED: 4,
};

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
  status: CleaningStatus;
  isActive: boolean;
  createdAt: string;
};

export function toTaskScheduleView(
  item: NonNullable<Awaited<ReturnType<typeof cleanerTaskScheduleRepository.findById>>>,
): CleanerTaskScheduleView {
  return {
    id: item.id,
    clientId: item.client.userId,
    clientName: `${item.client.firstName} ${item.client.lastName}`,
    clientEmail: item.client.Email,
    cleanerId: item.cleaner.userId,
    cleanerName: `${item.cleaner.firstName} ${item.cleaner.lastName}`,
    cleanerEmail: item.cleaner.Email,
    startDate: item.startDate.toISOString(),
    endDate: item.endDate?.toISOString() ?? null,
    status: (item.status as CleaningStatus) ?? "ASSIGNED",
    isActive: item.isActive,
    createdAt: item.createdAt.toISOString(),
  };
}

/**
 * Cleaner task schedule management. Clients assign cleaners for date ranges.
 */
export class CleanerTaskScheduleService {
  private async resolveClientProfileId(userId: string) {
    const profile = await prisma.clientProfile.findUnique({
      where: { userId },
      select: { id: true, userId: true },
    });
    if (!profile) throw new NotFoundError("Client profile not found");
    return profile;
  }

  private async resolveCleanerProfileId(userId: string) {
    const profile = await prisma.cleanerProfile.findUnique({
      where: { userId },
      select: { id: true, userId: true },
    });
    if (!profile) throw new NotFoundError("Cleaner profile not found");
    return profile;
  }

  async list(
    params: PaginationDTO & { clientId?: string; cleanerId?: string; activeOnly?: boolean },
    actor: ActorContext,
  ): Promise<Paginated<CleanerTaskScheduleView>> {
    // Clients can only see their own task schedules
    const clientId =
      actor.role === "CLIENT"
        ? (await this.resolveClientProfileId(actor.userId)).id
        : params.clientId
          ? (await this.resolveClientProfileId(params.clientId)).id
          : undefined;
    const cleanerId =
      actor.role === "CLEANER"
        ? (await this.resolveCleanerProfileId(actor.userId)).id
        : params.cleanerId
          ? (await this.resolveCleanerProfileId(params.cleanerId)).id
          : undefined;

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
    const clientProfileId = (await this.resolveClientProfileId(clientId)).id;
    const taskSchedules = await cleanerTaskScheduleRepository.findActiveForClient(
      clientProfileId,
      date,
    );
    return taskSchedules.map((a) => ({
      id: a.id,
      cleanerId: a.cleaner.userId,
      cleanerName: `${a.cleaner.firstName} ${a.cleaner.lastName}`,
      cleanerEmail: a.cleaner.Email,
      cleanerPhone: a.cleaner.phoneNo || null,
      startDate: a.startDate.toISOString(),
      endDate: a.endDate?.toISOString() ?? null,
    }));
  }

  async create(
    params: { clientId: string; cleanerId: string; startDate: Date; endDate?: Date; status?: CleaningStatus },
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

    const clientProfile = await this.resolveClientProfileId(params.clientId);
    const cleanerProfile = await this.resolveCleanerProfileId(params.cleanerId);

    const taskSchedule = await cleanerTaskScheduleRepository.create({
      client: { connect: { id: clientProfile.id } },
      cleaner: { connect: { id: cleanerProfile.id } },
      startDate: params.startDate,
      endDate: params.endDate ?? null,
      status: params.status ?? "ASSIGNED",
      createdBy: actor.userId,
      updatedBy: actor.userId,
    });

    return toTaskScheduleView(taskSchedule);
  }

  async update(
    id: string,
    params: { endDate?: Date; isActive?: boolean; status?: CleaningStatus },
    actor: ActorContext,
  ) {
    const existing = await cleanerTaskScheduleRepository.findById(id);
    if (!existing) throw new NotFoundError("Task schedule not found");

    // Clients own the schedule; cleaners may only advance the cleaning status.
    if (actor.role === "CLEANER") {
      if (actor.userId !== existing.cleaner.userId) throw new ForbiddenError();
      if (params.status === undefined && params.isActive === undefined && params.endDate === undefined) {
        throw new ForbiddenError("Cleaners may only update cleaning status");
      }
      if (params.status === undefined && (params.isActive !== undefined || params.endDate !== undefined)) {
        throw new ForbiddenError("Cleaners may only update cleaning status");
      }
    } else if (actor.role !== "SUPER_ADMIN" && actor.userId !== existing.client.userId) {
      throw new ForbiddenError();
    }

    const taskSchedule = await cleanerTaskScheduleRepository.update(id, {
      endDate: params.endDate,
      isActive: params.isActive,
      status: params.status,
      updatedBy: actor.userId,
    });

    return toTaskScheduleView(taskSchedule);
  }

  async remove(id: string, actor: ActorContext) {
    const existing = await cleanerTaskScheduleRepository.findById(id);
    if (!existing) throw new NotFoundError("Task schedule not found");

    // Non-admins can only remove their own task schedules
    if (actor.role !== "SUPER_ADMIN" && actor.userId !== existing.client.userId) {
      throw new ForbiddenError();
    }

    await cleanerTaskScheduleRepository.softDelete(id, actor.userId);
  }

  /**
   * Calendar data scoped to a cleaner: their own availability plus the client
   * bookings for every client they are assigned to (within an active date
   * range), each annotated with the cleaning status the client/cleaner set.
   */
  async getCleanerCalendarData(actor: ActorContext): Promise<CleanerCalendarDataView> {
    const cleanerProfile = await prisma.cleanerProfile.findUnique({
      where: { userId: actor.userId },
      select: { id: true },
    });
    if (!cleanerProfile) throw new NotFoundError("Cleaner profile not found");

    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999);

    // All assignments for this cleaner (any status/dates) so the cleaner can
    // see cleaning days for every client they are assigned to.
    const schedules = await cleanerTaskScheduleRepository.findAllForCleaner(cleanerProfile.id);

    // Best (most advanced) cleaning status per assigned client.
    const statusByClient = new Map<string, CleaningStatus>();
    for (const s of schedules) {
      const prev = statusByClient.get(s.clientId);
      const next = (s.status as CleaningStatus) ?? "ASSIGNED";
      if (!prev || STATUS_RANK[next] > STATUS_RANK[prev]) statusByClient.set(s.clientId, next);
    }

    // Fetch every assigned client's bookings in the visible calendar window.
    // We scope by fetch time (matching the client calendar) so bookings whose
    // own startDate/endDate are null are not dropped — they still render on
    // their own dates, which is the cleaning day the cleaner needs to see.
    const assignedClientIds = Array.from(new Set(schedules.map((s) => s.clientId)));
    const bookings = await guestBookingInfoRepository.listForCleanerClientsCalendar({
      clientIds: assignedClientIds,
      from,
      to,
    });

    const [availability] = await Promise.all([
      cleanerAvailabilityRepository.list({
        page: 1,
        pageSize: 200,
        cleanerId: cleanerProfile.id,
        activeOnly: true,
      }),
    ]);

    const events: CleanerCalendarEventView[] = [];

    for (const row of bookings) {
      if (!row.startDate && !row.endDate) continue;
      const clientId = row.clientId;
      const property = row.endpoint?.name ?? "Property";
      const title = row.summary?.trim() || property;
      const cleaningStatus = statusByClient.get(clientId) ?? "ASSIGNED";
      events.push({
        id: `booking:${row.id}`,
        kind: "booking",
        title,
        start: (row.startDate ?? row.endDate)!.toISOString(),
        end: row.endDate?.toISOString() ?? undefined,
        allDay: true,
        property,
        clientName: `${row.client.firstName} ${row.client.lastName}`,
        cleaningStatus,
      });
    }

    for (const slot of availability.items) {
      events.push({
        id: `avail:${slot.id}`,
        kind: "availability",
        title: "Available",
        start: slot.fromDate.toISOString(),
        end: slot.toDate?.toISOString() ?? undefined,
        allDay: true,
        property: null,
        clientName: null,
        cleaningStatus: null,
      });
    }

    return {
      events,
      assignments: schedules.map((s) => ({
        id: s.id,
        clientId: s.client.userId,
        clientName: `${s.client.firstName} ${s.client.lastName}`,
        startDate: s.startDate.toISOString(),
        endDate: (s.endDate?.toISOString() ?? null) as string | null,
        status: (s.status as CleaningStatus) ?? "ASSIGNED",
      })),
    };
  }
}

export const cleanerTaskScheduleService = new CleanerTaskScheduleService();
