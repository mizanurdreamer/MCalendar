"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { RoomAttendantAvailabilityView, Paginated } from "@/models/view";

const KEY = "roomAttendant-availability";

export function useRoomAttendantAvailability(
  params: { clientId?: string; roomAttendantId?: string; activeOnly?: boolean } = {},
) {
  const query = new URLSearchParams();
  query.set("page", "1");
  query.set("pageSize", "100");
  if (params.clientId) query.set("clientId", params.clientId);
  if (params.roomAttendantId) query.set("roomAttendantId", params.roomAttendantId);
  if (params.activeOnly) query.set("activeOnly", "true");

  return useQuery({
    queryKey: [KEY, params],
    queryFn: () =>
      api.get<Paginated<RoomAttendantAvailabilityView>>(
        `/api/roomAttendant-availability?${query.toString()}`,
      ),
  });
}

export type CreateAvailabilityDTO = {
  clientId: string;
  roomAttendantId: string;
  fromDate: string;
  toDate?: string | null;
  note?: string;
};

export function useCreateAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAvailabilityDTO) =>
      api.post<RoomAttendantAvailabilityView>("/api/roomAttendant-availability", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

// export function useUpdateAvailability(id: string) {
//   const qc = useQueryClient();
//   return useMutation({
//     mutationFn: (body: Partial<CreateAvailabilityDTO & { isActive?: boolean }>) =>
//       api.patch<RoomAttendantAvailabilityView>(`/api/roomAttendant-availability/${id}`, body),
//     onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
//   });
// }

export function useUpdateAvailability() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: Partial<CreateAvailabilityDTO & { isActive?: boolean }>;
    }) => api.patch<RoomAttendantAvailabilityView>(`/api/roomAttendant-availability/${id}`, body),

    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/roomAttendant-availability/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
