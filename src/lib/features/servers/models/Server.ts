import type { User } from "$lib/features/auth/models/User";
import type { Channel } from "$lib/features/channels/models/Channel";
import type { Role } from "./Role";

export interface Server {
  id: string;
  name: string;
  owner_id: string;
  created_at?: string;
  channels: Channel[];
  members: User[];
  roles: Role[];
  iconUrl?: string;
  description?: string;
  settings?: Record<string, unknown>;
  default_channel_id?: string;
  allow_invites?: boolean;
  moderation_level?: "None" | "Low" | "Medium" | "High";
  explicit_content_filter?: boolean;
}
