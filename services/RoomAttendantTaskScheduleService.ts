import { roomAttendantTaskScheduleRepository } from "@/repositories/RoomAttendantTaskScheduleRepository";
import { guestBookingInfoRepository } from "@/repositories/GuestBookingInfoRepository";
import { roomAttendantAvailabilityRepository } from "@/repositories/RoomAttendantAvailabilityRepository";
import { userRepository } from "@/repositories/UserRepository";
import { RoomAttendantTaskStatus } from "@/util/enums/RoomAttendantTaskStatus";
import { UserRole } from "@/util/enums/UserRole";
import { ConflictError, ForbiddenError, NotFoundError } from "@/util/errors";
import type { ActorContext, Paginated } from "@/models";
import type {
  CleaningStatus,
  RoomAttendantCalendarDataView,
  RoomAttendantCalendarEventView,
} from "@/models/view";
import type { PaginationDTO } from "@/dto/common.dto";
import { prisma } from "@/util/prisma";

export const CLEANING_STATUSES: CleaningStatus[] = [
  RoomAttendantTaskStatus.ASSIGNED,
  RoomAttendantTaskStatus.CONFIRMED,
  RoomAttendantTaskStatus.IN_PROGRESS,
  RoomAttendantTaskStatus.DONE,
  RoomAttendantTaskStatus.CANCELLED,
];

const STATUS_RANK: Record<CleaningStatus, number> = {
  [RoomAttendantTaskStatus.ASSIGNED]: 0,
  [RoomAttendantTaskStatus.CONFIRMED]: 1,
  [RoomAttendantTaskStatus.IN_PROGRESS]: 2,
  [RoomAttendantTaskStatus.DONE]: 3,
  [RoomAttendantTaskStatus.CANCELLED]: 4,
};

export type RoomAttendantTaskScheduleView = {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  roomAttendantId: string;
  roomAttendantName: string;
  roomAttendantEmail: string;
  assignedDate: string;
  status: CleaningStatus;
  isActive: boolean;
  createdAt: string;
};

export function toTaskScheduleView(
  item: NonNullable<Awaited<ReturnType<typeof roomAttendantTaskScheduleRepository.findById>>>,
): RoomAttendantTaskScheduleView {
  return {
    id: item.id,
    clientId: item.client.userId,
    clientName: `${item.client.firstName} ${item.client.lastName}`,
    clientEmail: item.client.Email,
    roomAttendantId: item.roomAttendant.userId,
    roomAttendantName: `${item.roomAttendant.firstName} ${item.roomAttendant.lastName}`,
    roomAttendantEmail: item.roomAttendant.Email,
    assignedDate: item.assignedDate.toISOString(),
    status: item.status as CleaningStatus,
    isActive: item.isActive,
    createdAt: item.createdAt.toISOString(),
  };
}

/**
 * RoomAttendant task schedule management. Clients assign room-attendants for date ranges.
 */
export class RoomAttendantTaskScheduleService {
  private async resolveClientProfileId(userId: string) {
    const profile = await prisma.clientProfile.findUnique({
      where: { userId },
      select: { id: true, userId: true },
    });
    if (!profile) throw new NotFoundError("Client profile not found");
    return profile;
  }

  private async resolveRoomAttendantProfileId(userId: string) {
    const profile = await prisma.roomAttendantProfile.findUnique({
      where: { userId },
      select: { id: true, userId: true },
    });
    if (!profile) throw new NotFoundError("RoomAttendant profile not found");
    return profile;
  }

  async list(
    params: PaginationDTO & { clientId?: string; roomAttendantId?: string; activeOnly?: boolean },
    actor: ActorContext,
  ): Promise<Paginated<RoomAttendantTaskScheduleView>> {
    // Clients can only see their own task schedules
    const clientId =
      actor.role === UserRole.CLIENT
        ? (await this.resolveClientProfileId(actor.userId)).id
        : params.clientId
          ? (await this.resolveClientProfileId(params.clientId)).id
          : undefined;
    const roomAttendantId =
      actor.role === UserRole.ROOM_ATTENDANT
        ? (await this.resolveRoomAttendantProfileId(actor.userId)).id
        : params.roomAttendantId
          ? (await this.resolveRoomAttendantProfileId(params.roomAttendantId)).id
          : undefined;

    const { items, total } = await roomAttendantTaskScheduleRepository.list({
      page: params.page,
      pageSize: params.pageSize,
      clientId,
      roomAttendantId,
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
    const taskSchedules = await roomAttendantTaskScheduleRepository.findActiveForClient(
      clientProfileId,
      date,
    );
    return taskSchedules.map((a) => ({
      id: a.id,
      roomAttendantId: a.roomAttendant.userId,
      roomAttendantName: `${a.roomAttendant.firstName} ${a.roomAttendant.lastName}`,
      roomAttendantEmail: a.roomAttendant.Email,
      roomAttendantPhone: a.roomAttendant.phoneNo || null,
      assignedDate: a.assignedDate.toISOString(),
    }));
  }

  async create(
    params: { clientId: string; roomAttendantId: string; assignedDate: Date; status?: CleaningStatus },
    actor: ActorContext,
  ) {
    // Verify both users exist with correct roles
    const client = await userRepository.findById(params.clientId);
    if (!client || client.role !== UserRole.CLIENT) {
      throw new NotFoundError("Client not found");
    }

    const roomAttendant = await userRepository.findById(params.roomAttendantId);
    if (!roomAttendant || roomAttendant.role !== UserRole.ROOM_ATTENDANT) {
      throw new NotFoundError("RoomAttendant not found");
    }

    // Non-admins can only assign to themselves
    if (actor.role !== UserRole.SUPER_ADMIN && actor.userId !== params.clientId) {
      throw new ForbiddenError();
    }

    const clientProfile = await this.resolveClientProfileId(params.clientId);
    const roomAttendantProfile = await this.resolveRoomAttendantProfileId(params.roomAttendantId);

    const taskSchedule = await roomAttendantTaskScheduleRepository.create({
      client: { connect: { id: clientProfile.id } },
      roomAttendant: { connect: { id: roomAttendantProfile.id } },
      assignedDate: params.assignedDate,
      status: params.status ?? RoomAttendantTaskStatus.ASSIGNED,
      createdBy: actor.userId,
      updatedBy: actor.userId,
    });

    return toTaskScheduleView(taskSchedule);
  }

  async update(
    id: string,
    params: { isActive?: boolean; status?: CleaningStatus },
    actor: ActorContext,
  ) {
    const existing = await roomAttendantTaskScheduleRepository.findById(id);
    if (!existing) throw new NotFoundError("Task schedule not found");

    // Clients own the schedule; room-attendants may only advance the cleaning status.
    if (actor.role === UserRole.ROOM_ATTENDANT) {
      if (actor.userId !== existing.roomAttendant.userId) throw new ForbiddenError();
      if (params.status === undefined) {
        throw new ForbiddenError("room-attendants may only update cleaning status");
      }
    } else if (actor.role !== UserRole.SUPER_ADMIN && actor.userId !== existing.client.userId) {
      throw new ForbiddenError();
    }

    const taskSchedule = await roomAttendantTaskScheduleRepository.update(id, {
      isActive: params.isActive,
      status: params.status,
      updatedBy: actor.userId,
    });

    return toTaskScheduleView(taskSchedule);
  }

  async remove(id: string, actor: ActorContext) {
    const existing = await roomAttendantTaskScheduleRepository.findById(id);
    if (!existing) throw new NotFoundError("Task schedule not found");

    // Non-admins can only remove their own task schedules
    if (actor.role !== UserRole.SUPER_ADMIN && actor.userId !== existing.client.userId) {
      throw new ForbiddenError();
    }

    await roomAttendantTaskScheduleRepository.softDelete(id, actor.userId);
  }

  /**
   * Calendar data scoped to a roomAttendant: their own availability plus the client
   * bookings for every client they are assigned to (within an active date
   * range), each annotated with the cleaning status the client/roomAttendant set.
   */
  async getRoomAttendantCalendarData(actor: ActorContext): Promise<RoomAttendantCalendarDataView> {
    const roomAttendantProfile = await prisma.roomAttendantProfile.findUnique({
      where: { userId: actor.userId },
      select: { id: true },
    });
    if (!roomAttendantProfile) throw new NotFoundError("RoomAttendant profile not found");

    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999);

    // All assignments for this roomAttendant (any status/dates) so the roomAttendant can
    // see cleaning days for every client they are assigned to.
    const schedules = await roomAttendantTaskScheduleRepository.findAllForRoomAttendant(roomAttendantProfile.id);

    // Best (most advanced) cleaning status per assigned client.
    const statusByClient = new Map<string, CleaningStatus>();
    for (const s of schedules) {
      const prev = statusByClient.get(s.clientId);
      const next = (s.status as CleaningStatus) ?? RoomAttendantTaskStatus.ASSIGNED;
      if (!prev || STATUS_RANK[next] > STATUS_RANK[prev]) statusByClient.set(s.clientId, next);
    }

    // Fetch every assigned client's bookings in the visible calendar window.
    // We scope by fetch time (matching the client calendar) so bookings whose
    // own startDate/endDate are null are not dropped — they still render on
    // their own dates, which is the cleaning day the roomAttendant needs to see.
    const assignedClientIds = Array.from(new Set(schedules.map((s) => s.clientId)));
    const bookings = await guestBookingInfoRepository.listForRoomAttendantClientsCalendar({
      clientIds: assignedClientIds,
      from,
      to,
    });

    const [availability] = await Promise.all([
      roomAttendantAvailabilityRepository.list({
        page: 1,
        pageSize: 200,
        roomAttendantId: roomAttendantProfile.id,
        activeOnly: true,
      }),
    ]);

    const events: RoomAttendantCalendarEventView[] = [];

    for (const row of bookings) {
      if (!row.startDate && !row.endDate) continue;
      const clientId = row.clientId;
      const property = row.provider?.name ?? "Property";
      const title = row.summary?.trim() || property;
      const cleaningStatus = statusByClient.get(clientId) ?? RoomAttendantTaskStatus.ASSIGNED;
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
        assignedDate: s.assignedDate.toISOString(),
        status: (s.status as CleaningStatus) ?? RoomAttendantTaskStatus.ASSIGNED,
      })),
    };
  }
}

export const roomAttendantTaskScheduleService = new RoomAttendantTaskScheduleService();
