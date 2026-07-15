import { clientBookingEndpointRepository } from "@/repositories/ClientBookingEndpointRepository";
import { prisma } from "@/lib/prisma";
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

type EndpointWithClient = Awaited<
  ReturnType<typeof clientBookingEndpointRepository.findById>
>;

function mapEndpointView(
  endpoint: NonNullable<EndpointWithClient>,
): BookingEndpointView {
  return {
    id: endpoint.id,
    clientId: endpoint.client?.userId ?? endpoint.clientId,
    name: endpoint.name,
    url: endpoint.url,
    isActive: endpoint.isActive,
    createdAt: endpoint.createdAt.toISOString(),
  };
}

/**
 * Booking endpoint management. Each client only sees and manages their own
 * endpoints; ownership is enforced against the authenticated actor.
 */
export class ClientBookingEndpointService {
  private async resolveClientProfileId(userId: string): Promise<string> {
    const client = await prisma.clientProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!client) throw new NotFoundError("Client profile not found");
    return client.id;
  }

  async list(
    params: PaginationDTO,
    actor: ActorContext,
  ): Promise<Paginated<BookingEndpointView>> {
    const clientProfileId = await this.resolveClientProfileId(actor.userId);
    const { items, total } = await clientBookingEndpointRepository.list({
      page: params.page,
      pageSize: params.pageSize,
      search: params.search,
      status: params.status,
      clientId: clientProfileId,
    });

    return {
      items: items.map((item) => mapEndpointView(item)),
      total,
      page: params.page,
      pageSize: params.pageSize,
      totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
    };
  }

  async getById(id: string, actor: ActorContext): Promise<BookingEndpointView> {
    const endpoint = await this.requireOwned(id, actor);
    return mapEndpointView(endpoint);
  }

  async create(
    dto: CreateBookingEndpointDTO,
    actor: ActorContext,
  ): Promise<BookingEndpointView> {
    const clientProfileId = await this.resolveClientProfileId(actor.userId);
    const endpoint = await clientBookingEndpointRepository.create({
      name: dto.name,
      url: dto.url,
      isActive: dto.isActive,
      client: { connect: { id: clientProfileId } },
      createdBy: actor.userId,
      updatedBy: actor.userId,
    });

    return mapEndpointView(endpoint);
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

    return mapEndpointView(endpoint);
  }

  async remove(id: string, actor: ActorContext): Promise<void> {
    await this.requireOwned(id, actor);
    await clientBookingEndpointRepository.softDelete(id, actor.userId);
  }

  private async requireOwned(
    id: string,
    actor: ActorContext,
  ): Promise<NonNullable<EndpointWithClient>> {
    const endpoint = await clientBookingEndpointRepository.findById(id);
    if (!endpoint) throw new NotFoundError("Booking endpoint not found");
    if (endpoint.client?.userId !== actor.userId) throw new ForbiddenError();
    return endpoint;
  }
}

export const clientBookingEndpointService = new ClientBookingEndpointService();
