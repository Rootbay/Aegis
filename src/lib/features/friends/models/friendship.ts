import type { User } from "$lib/features/auth/models/User";

export type FriendshipStatus =
  | "pending"
  | "accepted"
  | "blocked_by_a"
  | "blocked_by_b";

export interface FriendshipRecord {
  id: string;
  user_a_id: string;
  user_b_id: string;
  status: FriendshipStatus;
  created_at?: string;
  updated_at?: string;
}

export type FriendshipCounterpartProfile = Pick<User, "id"> &
  Partial<
    Pick<
      User,
      | "name"
      | "avatar"
      | "bio"
      | "tag"
      | "statusMessage"
      | "location"
      | "online"
    >
  > & {
    publicKey?: string | null;
  };

export interface FriendshipCounterpart
  extends FriendshipCounterpartProfile {
  username?: string | null;
  statusMessage?: string | null;
  publicKey?: string | null;
  isOnline?: boolean | null;
  status?: string | null;
}

export interface FriendshipBackend {
  friendship: FriendshipRecord;
  counterpart?: FriendshipCounterpart | null;
}
