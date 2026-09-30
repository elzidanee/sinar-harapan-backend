export const ROLES = {
  RECEPTIONIST: 'RECEPTIONIST',
  MANAGER: 'MANAGER',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
