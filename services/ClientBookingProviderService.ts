import { clientBookingProviderRepository } from "@/repositories/ClientBookingProviderRepository";
import { prisma } from "@/util/prisma";
import { ForbiddenError, NotFoundError } from "@/util/errors";
import type {
  CreateBookingProviderDTO,
  UpdateBookingProviderDTO,
} from "@/dto/bookingProvider.dto";
import type { ActorContext, Paginated } from "@/models";
import type { PaginationDTO } from "@/dto/common.dto";

export type BookingProviderView = {
  id: string;
  clientId: string;
  name: string;
  url: string;
  isActive: boolean;
  createdAt: string;
};

type ProviderWithClient = Awaited<
  ReturnType<typeof clientBookingProviderRepository.findById>
>;

function mapProviderView(
  provider: NonNullable<ProviderWithClient>,
): BookingProviderView {
  return {
    id: provider.id,
    clientId: provider.client?.userId ?? provider.clientId,
    name: provider.name,
    url: provider.url,
    isActive: provider.isActive,
    createdAt: provider.createdAt.toISOString(),
  };
}

/**
 * Booking provider management. Each client only sees and manages their own
 * providers; ownership is enforced against the authenticated actor.
 */
export class ClientBookingProviderService {
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
  ): Promise<Paginated<BookingProviderView>> {
    const clientProfileId = await this.resolveClientProfileId(actor.userId);
    const { items, total } = await clientBookingProviderRepository.list({
      page: params.page,
      pageSize: params.pageSize,
      search: params.search,
      status: params.status,
      clientId: clientProfileId,
    });

    return {
      items: items.map((item) => mapProviderView(item)),
      total,
      page: params.page,
      pageSize: params.pageSize,
      totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
    };
  }

  async getById(id: string, actor: ActorContext): Promise<BookingProviderView> {
    const provider = await this.requireOwned(id, actor);
    return mapProviderView(provider);
  }

  async create(
    dto: CreateBookingProviderDTO,
    actor: ActorContext,
  ): Promise<BookingProviderView> {
    const clientProfileId = await this.resolveClientProfileId(actor.userId);
    const provider = await clientBookingProviderRepository.create({
      name: dto.name,
      url: dto.url,
      isActive: dto.isActive,
      client: { connect: { id: clientProfileId } },
      createdBy: actor.userId,
      updatedBy: actor.userId,
    });

    return mapProviderView(provider);
  }

  async update(
    id: string,
    dto: UpdateBookingProviderDTO,
    actor: ActorContext,
  ): Promise<BookingProviderView> {
    await this.requireOwned(id, actor);

    const provider = await clientBookingProviderRepository.update(id, {
      name: dto.name,
      url: dto.url,
      isActive: dto.isActive,
      updatedBy: actor.userId,
    });

    return mapProviderView(provider);
  }

  async remove(id: string, actor: ActorContext): Promise<void> {
    await this.requireOwned(id, actor);
    await clientBookingProviderRepository.softDelete(id, actor.userId);
  }

  private async requireOwned(
    id: string,
    actor: ActorContext,
  ): Promise<NonNullable<ProviderWithClient>> {
    const provider = await clientBookingProviderRepository.findById(id);
    if (!provider) throw new NotFoundError("Booking provider not found");
    if (provider.client?.userId !== actor.userId) throw new ForbiddenError();
    return provider;
  }
}

export const clientBookingProviderService = new ClientBookingProviderService();
