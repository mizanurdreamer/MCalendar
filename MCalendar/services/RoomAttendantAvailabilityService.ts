import { roomAttendantAvailabilityRepository } from "@/repositories/RoomAttendantAvailabilityRepository";
import { userRepository } from "@/repositories/UserRepository";
import { UserRole } from "@/util/enums/UserRole";
import { ConflictError, ForbiddenError, NotFoundError } from "@/util/errors";
import type { ActorContext, Paginated } from "@/models";
import type { PaginationDTO } from "@/dto/common.dto";
import { prisma } from "@/util/prisma";

export type RoomAttendantAvailabilityView = {
  id: string;
  clientId: string;
  clientName: string;
  roomAttendantId: string;
  roomAttendantName: string;
  roomAttendantEmail: string;
  fromDate: string;
  toDate: string | null;
  note: string | null;
  isActive: boolean;
  createdAt: string;
};

export function toAvailabilityView(
  item: NonNullable<Awaited<ReturnType<typeof roomAttendantAvailabilityRepository.findById>>>,
): RoomAttendantAvailabilityView {
  return {
    id: item.id,
    clientId: item.client.userId,
    clientName: `${item.client.firstName} ${item.client.lastName}`,
    roomAttendantId: item.roomAttendant.userId,
    roomAttendantName: `${item.roomAttendant.firstName} ${item.roomAttendant.lastName}`,
    roomAttendantEmail: item.roomAttendant.Email,
    fromDate: item.fromDate.toISOString().slice(0, 10),
    toDate: item.toDate ? item.toDate.toISOString().slice(0, 10) : null,
    note: item.note,
    isActive: item.isActive,
    createdAt: item.createdAt.toISOString(),
  };
}

/**
 * RoomAttendant availability management. room-attendants manage their own slots; clients and
 * admins can view any room-attendant's availability.
 */
export class RoomAttendantAvailabilityService {
  private async resolveRoomAttendantProfileId(userId: string) {
    const profile = await prisma.roomAttendantProfile.findUnique({
      where: { userId },
      select: { id: true, userId: true },
    });
    if (!profile) throw new NotFoundError("RoomAttendant profile not found");
    return profile;
  }

  async list(
    params: PaginationDTO & { clientId?: string; roomAttendantId?: string; fromDate?: Date; toDate?: Date; activeOnly?: boolean },
    actor: ActorContext,
  ): Promise<Paginated<RoomAttendantAvailabilityView>> {
    const clientId = params.clientId;
    const roomAttendantId =
      actor.role === UserRole.ROOM_ATTENDANT
        ? (await this.resolveRoomAttendantProfileId(actor.userId)).id
        : params.roomAttendantId
          ? (await this.resolveRoomAttendantProfileId(params.roomAttendantId)).id
          : undefined;

    const { items, total } = await roomAttendantAvailabilityRepository.list({
      page: params.page,
      pageSize: params.pageSize,
      clientId,
      roomAttendantId,
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
    params: { clientId: string; roomAttendantId: string; fromDate: Date; toDate?: Date | null; note?: string },
    actor: ActorContext,
  ) {
    const client = await userRepository.findById(params.clientId);
    if (!client || client.role !== UserRole.CLIENT) {
      throw new NotFoundError("Client not found");
    }

    const roomAttendant = await userRepository.findById(params.roomAttendantId);
    if (!roomAttendant || roomAttendant.role !== UserRole.ROOM_ATTENDANT) {
      throw new NotFoundError("RoomAttendant not found");
    }

    if (actor.role === UserRole.ROOM_ATTENDANT && actor.userId !== params.roomAttendantId) {
      throw new ForbiddenError();
    }

    if (params.toDate && params.toDate < params.fromDate) {
      throw new ConflictError("To date must be on or after from date");
    }

    const clientProfile = await prisma.clientProfile.findUnique({
      where: { userId: params.clientId },
      select: { id: true },
    });
    if (!clientProfile) throw new NotFoundError("Client profile not found");

    const roomAttendantProfile = await this.resolveRoomAttendantProfileId(params.roomAttendantId);

    const hasOverlap = await roomAttendantAvailabilityRepository.hasOverlap({
      clientId: clientProfile.id,
      roomAttendantId: roomAttendantProfile.id,
      fromDate: params.fromDate,
      toDate: params.toDate ?? null,
    });
    if (hasOverlap) {
      throw new ConflictError("Overlapping availability is not allowed");
    }

    const availability = await roomAttendantAvailabilityRepository.create({
      client: { connect: { id: clientProfile.id } },
      roomAttendant: { connect: { id: roomAttendantProfile.id } },
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
    const existing = await roomAttendantAvailabilityRepository.findById(id);
    if (!existing) throw new NotFoundError("Availability not found");

    if (actor.role === UserRole.ROOM_ATTENDANT && actor.userId !== existing.roomAttendant.userId) {
      throw new ForbiddenError();
    }

    const nextFromDate = params.fromDate ?? existing.fromDate;
    const nextToDate = params.toDate === undefined ? existing.toDate : params.toDate;

    if (nextToDate && nextToDate < nextFromDate) {
      throw new ConflictError("To date must be on or after from date");
    }

    const hasOverlap = await roomAttendantAvailabilityRepository.hasOverlap({
      clientId: existing.client.id,
      roomAttendantId: existing.roomAttendant.id,
      fromDate: nextFromDate,
      toDate: nextToDate ?? null,
      excludeId: id,
    });
    if (hasOverlap) {
      throw new ConflictError("Overlapping availability is not allowed");
    }

    const availability = await roomAttendantAvailabilityRepository.update(id, {
      fromDate: params.fromDate,
      toDate: params.toDate === undefined ? undefined : (params.toDate ?? null),
      note: params.note,
      isActive: params.isActive,
      updatedBy: actor.userId,
    });

    return toAvailabilityView(availability);
  }

  async remove(id: string, actor: ActorContext) {
    const existing = await roomAttendantAvailabilityRepository.findById(id);
    if (!existing) throw new NotFoundError("Availability not found");

    if (actor.role === UserRole.ROOM_ATTENDANT && actor.userId !== existing.roomAttendant.userId) {
      throw new ForbiddenError();
    }

    await roomAttendantAvailabilityRepository.softDelete(id, actor.userId);
  }
}

export const roomAttendantAvailabilityService = new RoomAttendantAvailabilityService();
