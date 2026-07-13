import type { ClientBookingEndpoint } from "@prisma/client";
import { clientBookingEndpointRepository } from "@/repositories/ClientBookingEndpointRepository";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import type {
  CreateBookingEndpointDTO,
  UpdateBookingEndpointDTO,
} from "@/dto/bookingEndpoint.dto";
import type { ActorContext, Paginated } from "@/models";
import type { PaginationDTO } from "@/dto/common.dto";

export type BookingEndpointView = {
  id: string;
  clientId: string;
  name: string;
  url: string;
  isActive: boolean;
  createdAt: string;
};

export function toBookingEndpointView(e: ClientBookingEndpoint): BookingEndpointView {
  return {
    id: e.id,
    clientId: e.clientId,
    name: e.name,
    url: e.url,
    isActive: e.isActive,
    createdAt: e.createdAt.toISOString(),
  };
}

/**
 * Booking endpoint management. Each client only sees and manages their own
 * endpoints; ownership is enforced against the authenticated actor.
 */
export class ClientBookingEndpointService {
  async list(
    params: PaginationDTO,
    actor: ActorContext,
  ): Promise<Paginated<BookingEndpointView>> {
    const { items, total } = await clientBookingEndpointRepository.list({
      page: params.page,
      pageSize: params.pageSize,
      search: params.search,
      clientId: actor.userId,
    });

    return {
      items: items.map(toBookingEndpointView),
      total,
      page: params.page,
      pageSize: params.pageSize,
      totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
    };
  }

  async getById(id: string, actor: ActorContext): Promise<BookingEndpointView> {
    const endpoint = await this.requireOwned(id, actor);
    return toBookingEndpointView(endpoint);
  }

  async create(
    dto: CreateBookingEndpointDTO,
    actor: ActorContext,
  ): Promise<BookingEndpointView> {
    const endpoint = await clientBookingEndpointRepository.create({
      name: dto.name,
      url: dto.url,
      isActive: dto.isActive,
      client: { connect: { id: actor.userId } },
      createdBy: actor.userId,
      updatedBy: actor.userId,
    });

    return toBookingEndpointView(endpoint);
  }

  async update(
    id: string,
    dto: UpdateBookingEndpointDTO,
    actor: ActorContext,
  ): Promise<BookingEndpointView> {
    await this.requireOwned(id, actor);

    const endpoint = await clientBookingEndpointRepository.update(id, {
      name: dto.name,
      url: dto.url,
      isActive: dto.isActive,
      updatedBy: actor.userId,
    });

    return toBookingEndpointView(endpoint);
  }

  async remove(id: string, actor: ActorContext): Promise<void> {
    await this.requireOwned(id, actor);
    await clientBookingEndpointRepository.softDelete(id, actor.userId);
  }

  private async requireOwned(
    id: string,
    actor: ActorContext,
  ): Promise<ClientBookingEndpoint> {
    const endpoint = await clientBookingEndpointRepository.findById(id);
    if (!endpoint) throw new NotFoundError("Booking endpoint not found");
    if (endpoint.clientId !== actor.userId) throw new ForbiddenError();
    return endpoint;
  }
}

export const clientBookingEndpointService = new ClientBookingEndpointService();
