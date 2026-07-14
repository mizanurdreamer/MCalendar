import { clientBookingDataRepository } from "@/repositories/ClientBookingDataRepository";
import type { ActorContext, Paginated } from "@/models";

export type BookingDataView = {
  id: string;
  endpointId: string;
  endpointName: string;
  clientId: string;
  rawData: unknown;
  fetchedAt: string;
  summary: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string | null;
  createdAt: string;
};

export function toBookingDataView(
  item: Awaited<ReturnType<typeof clientBookingDataRepository.findById>> & {
    endpoint?: { name: string };
  },
): BookingDataView {
  return {
    id: item.id,
    endpointId: item.endpointId,
    endpointName: item.endpoint?.name ?? "",
    clientId: item.clientId,
    rawData: item.rawData,
    fetchedAt: item.fetchedAt.toISOString(),
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
export class ClientBookingDataService {
  async list(
    params: { page: number; pageSize: number; clientId?: string; endpointId?: string },
    _actor?: ActorContext,
  ): Promise<Paginated<BookingDataView>> {
    const { items, total } = await clientBookingDataRepository.list(params);
    return {
      items: items.map((item) =>
        toBookingDataView(item as Parameters<typeof toBookingDataView>[0]),
      ),
      total,
      page: params.page,
      pageSize: params.pageSize,
      totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
    };
  }

  async getById(id: string): Promise<BookingDataView | null> {
    const item = await clientBookingDataRepository.findById(id);
    if (!item) return null;
    return toBookingDataView(item as Parameters<typeof toBookingDataView>[0]);
  }
}

export const clientBookingDataService = new ClientBookingDataService();
