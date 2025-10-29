import type { User } from "$lib/features/auth/models/User";
import type { Channel } from "$lib/features/channels/models/Channel";
import type { ChannelCategory } from "$lib/features/channels/models/ChannelCategory";
import type { Role } from "./Role";
import type { ServerInvite } from "./ServerInvite";

export type ServerModerationSettings = {
  transparentEdits?: boolean;
  deletedMessageDisplay?: "ghost" | "tombstone";
  enableReadReceipts?: boolean;
  [key: string]: unknown;
};

export interface Server {
  id: string;
  name: string;
  owner_id: string;
  created_at?: string;
  channels: Channel[];
  categories: ChannelCategory[];
  members: User[];
  roles: Role[];
  iconUrl?: string;
  description?: string;
  settings?: ServerModerationSettings;
  default_channel_id?: string;
  allow_invites?: boolean;
  moderation_level?: "None" | "Low" | "Medium" | "High";
  explicit_content_filter?: boolean;
  invites?: ServerInvite[];
}
