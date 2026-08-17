import { guestBookingInfoRepository } from "@/repositories/GuestBookingInfoRepository";
import type { ActorContext, Paginated } from "@/models";

export type GuestBookingInfoView = {
  id: string;
  providerId: string;
  providerName: string;
  clientId: string;
  rawData: unknown;
  fetchedAt: string;
  summary: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string | null;
  createdAt: string;
};

export function toGuestBookingInfoView(
  item: Awaited<ReturnType<typeof guestBookingInfoRepository.findById>> & {
    provider?: { name: string };
    fetchData?: { rawData: unknown; fetchedAt: Date };
  },
): GuestBookingInfoView {
  return {
    id: item.id,
    providerId: item.providerId,
    providerName: item.provider?.name ?? "",
    clientId: item.clientId,
    rawData: item.fetchData?.rawData ?? null,
    fetchedAt: item.fetchData?.fetchedAt.toISOString() ?? "",
    summary: item.summary,
    startDate: item.startDate?.toISOString() ?? null,
    endDate: item.endDate?.toISOString() ?? null,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
  };
}

/**
 * Client booking data service. Read-only access to fetched booking data.
 */
export class GuestBookingInfoService {
  async list(
    params: { page: number; pageSize: number; clientId?: string; providerId?: string },
    _actor?: ActorContext,
  ): Promise<Paginated<GuestBookingInfoView>> {
    const { items, total } = await guestBookingInfoRepository.list(params);
    return {
      items: items.map((item) =>
        toGuestBookingInfoView(item as Parameters<typeof toGuestBookingInfoView>[0]),
      ),
      total,
      page: params.page,
      pageSize: params.pageSize,
      totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
    };
  }

  async getById(id: string): Promise<GuestBookingInfoView | null> {
    const item = await guestBookingInfoRepository.findById(id);
    if (!item) return null;
    return toGuestBookingInfoView(item as Parameters<typeof toGuestBookingInfoView>[0]);
  }
}

export const guestBookingInfoService = new GuestBookingInfoService();
