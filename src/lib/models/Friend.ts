import type { Message } from './Message';
import type { User } from './User';

export type FriendStatus = 'Online' | 'Offline' | 'Blocked' | 'Pending';

export interface Friend extends User {
  status: FriendStatus;
  timestamp: string;
  messages: Message[];
  lastMessage?: string;
  isFriend?: boolean;
  isPinned?: boolean;
  friendshipId?: string;
  relationshipStatus?: string;
}

