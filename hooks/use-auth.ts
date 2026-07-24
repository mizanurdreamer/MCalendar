"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/util/api-client";
import type { UserView } from "@/models/view";
import type { LoginDTO, RegisterDTO } from "@/dto/auth.dto";

const dashboardPath: Record<UserView["role"], string> = {
  SUPER_ADMIN: "/admin/dashboard",
  CLIENT: "/client/today",
  ROOM_ATTENDANT: "/select-client",
};

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<{ user: UserView }>("/api/auth/me").then((d) => d.user),
    retry: false,
  });
}

export function useLogin() {
  const router = useRouter();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: LoginDTO) => api.post<{ user: UserView }>("/api/auth/login", dto),
    onSuccess: ({ user }) => {
      qc.setQueryData(["me"], user);
      router.replace(dashboardPath[user.role]);
      router.refresh();
    },
  });
}

export function useRegister() {
  const router = useRouter();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: RegisterDTO) =>
      api.post<{ user: UserView }>("/api/auth/register", dto),
    onSuccess: ({ user }) => {
      qc.setQueryData(["me"], user);
      router.replace(dashboardPath[user.role]);
      router.refresh();
    },
  });
}

export function useLogout() {
  const router = useRouter();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/api/auth/logout"),
    onSuccess: () => {
      qc.clear();
      router.replace("/login");
      router.refresh();
    },
  });
}
