import type { Friend } from "$lib/features/friends/models/Friend";
import type { User } from "$lib/features/auth/models/User";
import type { Message } from "$lib/features/chat/models/Message";
import type { Channel } from "$lib/features/channels/models/Channel";

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
  topic?: string | null;
  members: User[];
  messages: Message[];
  channelType?: Channel["channel_type"];
}

export interface GroupChat {
  type: "group";
  id: string;
  name: string;
  ownerId: string;
  memberIds: string[];
  members: User[];
  messages: Message[];
}

export type Chat = DMChat | ChannelChat | GroupChat;
