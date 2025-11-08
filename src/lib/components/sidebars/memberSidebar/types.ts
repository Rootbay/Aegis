import type { User } from "$lib/features/auth/models/User";

export type OpenUserCardModalHandler = (
  user: User,
  x: number,
  y: number,
  isServerMemberContext: boolean,
) => void;

export type OpenDetailedProfileHandler = (user: User) => void;
