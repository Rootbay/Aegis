import type { Friend } from './Friend';
import type { User } from './User';
import type { Message } from './Message';

export interface DMChat {
  type: 'dm';
  id: string;
  friend: Friend;
  messages: Message[];
}

export interface ChannelChat {
  type: 'channel';
  id: string;
  name: string;
  serverId: string;
  members: User[];
  messages: Message[];
}

export type Chat = DMChat | ChannelChat;