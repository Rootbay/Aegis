import type { Friend } from "$lib/features/friends/models/Friend";
import type { User } from "$lib/features/auth/models/User";
import type { Message } from "$lib/features/chat/models/Message";

export interface DMChat {
  type: "dm";
  id: string;
  friend: Friend;
  messages: Message[];
}

export interface ChannelChat {
  type: "channel";
  id: string;
  name: string;
  serverId: string;
  members: User[];
  messages: Message[];
}

export type Chat = DMChat | ChannelChat;
