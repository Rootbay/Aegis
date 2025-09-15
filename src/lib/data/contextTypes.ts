import type { User } from '../models/User';

export interface CreateGroupContext {
  openUserCardModal: (user: User, event: MouseEvent) => void;
  openDetailedProfileModal: (user: User) => void;
}