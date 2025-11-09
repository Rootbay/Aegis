import type { ChannelPermissionOverrides } from "$lib/features/chat/utils/permissions";

export interface Channel {
  id: string;
  name: string;
  server_id: string;
  channel_type: "text" | "voice";
  private: boolean;
  position: number;
  category_id?: string | null;
  topic?: string | null;
  allowed_role_ids?: string[];
  allowed_user_ids?: string[];
  rate_limit_per_user?: number | null;
  permission_overrides?: ChannelPermissionOverrides | null;
}
