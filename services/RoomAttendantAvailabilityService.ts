import { roomAttendantAvailabilityRepository } from "@/repositories/RoomAttendantAvailabilityRepository";
import { userRepository } from "@/repositories/UserRepository";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import type { ActorContext, Paginated } from "@/models";
import type { PaginationDTO } from "@/dto/common.dto";
import { prisma } from "@/lib/prisma";

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
 * RoomAttendant availability management. RoomAttendants manage their own slots; clients and
 * admins can view any roomAttendant's availability.
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
      actor.role === "ROOMATTENDATNT"
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
    if (!client || client.role !== "CLIENT") {
      throw new NotFoundError("Client not found");
    }

    const roomAttendant = await userRepository.findById(params.roomAttendantId);
    if (!roomAttendant || roomAttendant.role !== "ROOMATTENDATNT") {
      throw new NotFoundError("RoomAttendant not found");
    }

    if (actor.role === "ROOMATTENDATNT" && actor.userId !== params.roomAttendantId) {
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

    if (actor.role === "ROOMATTENDATNT" && actor.userId !== existing.roomAttendant.userId) {
      throw new ForbiddenError();
    }

    if (
      params.fromDate &&
      params.toDate &&
      params.toDate < params.fromDate
    ) {
      throw new ConflictError("To date must be on or after from date");
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

    if (actor.role === "ROOMATTENDATNT" && actor.userId !== existing.roomAttendant.userId) {
      throw new ForbiddenError();
    }

    await roomAttendantAvailabilityRepository.softDelete(id, actor.userId);
  }
}

export const roomAttendantAvailabilityService = new RoomAttendantAvailabilityService();
