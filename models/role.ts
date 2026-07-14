export const ROLE_VALUES = ["SUPER_ADMIN", "CLIENT", "CLEANER"] as const;
export type Role = (typeof ROLE_VALUES)[number];

export function isRole(value: string): value is Role {
  return (ROLE_VALUES as readonly string[]).includes(value);
}
