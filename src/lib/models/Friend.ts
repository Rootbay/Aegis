import type { Message } from './Message';
import type { User } from './User';

export interface Friend extends User {
  timestamp: string;
  messages: Message[];
  lastMessage?: string;
  isFriend?: boolean;
  isPinned?: boolean;
}