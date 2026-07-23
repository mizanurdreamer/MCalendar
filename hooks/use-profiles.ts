"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { UpdateClientProfileDTO, UpdateRoomAttendantProfileDTO } from "@/dto/profile.dto";

export type ClientProfileView = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  companyName: string | null;
  primaryContact: string | null;
  portfolioSize: number | null;
  timezone: string | null;
};

export type RoomAttendantProfileView = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  serviceArea: string | null;
  hourlyRate: number | null;
  rating: number | null;
};

export function useClientProfile() {
  return useQuery({
    queryKey: ["client-profile"],
    queryFn: () => api.get<ClientProfileView>("/api/client-profile"),
  });
}

export function useUpdateClientProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateClientProfileDTO) => api.patch<ClientProfileView>("/api/client-profile", dto),
    onSuccess: (data) => {
      qc.setQueryData(["client-profile"], data);
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

export function useRoomAttendantProfile() {
  return useQuery({
    queryKey: ["roomAttendant-profile"],
    queryFn: () => api.get<RoomAttendantProfileView>("/api/roomAttendant-profile"),
  });
}

export function useUpdateRoomAttendantProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateRoomAttendantProfileDTO) => api.patch<RoomAttendantProfileView>("/api/roomAttendant-profile", dto),
    onSuccess: (data) => {
      qc.setQueryData(["roomAttendant-profile"], data);
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
