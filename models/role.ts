import { UserRole } from "@/util/enums/UserRole";

export const ROLE_VALUES = [UserRole.SUPER_ADMIN, UserRole.CLIENT, UserRole.ROOM_ATTENDANT] as const;
export type Role = (typeof ROLE_VALUES)[number];

export function isRole(value: string): value is Role {
  return (ROLE_VALUES as readonly string[]).includes(value);
}
