import type { User } from "$lib/features/auth/models/User";
import type { Friend } from "$lib/features/friends/models/Friend";

export interface CreateGroupContext {
  openUserCardModal: (
    user: User,
    x: number,
    y: number,
    isServerMemberContext: boolean,
  ) => void;
  openDetailedProfileModal: (user: User) => void;
}
export interface FriendsLayoutContext {
  friends: Friend[];
  activeTab: string;
}
