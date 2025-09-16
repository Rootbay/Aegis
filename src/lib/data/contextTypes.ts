import type { User } from '../models/User';
import type { Friend } from '../models/Friend';

export interface CreateGroupContext {
  openUserCardModal: (user: User, x: number, y: number, isServerMemberContext: boolean) => void;
  openDetailedProfileModal: (user: User) => void;
}
export interface FriendsLayoutContext {
  friends: Friend[];
  activeTab: string;
}
