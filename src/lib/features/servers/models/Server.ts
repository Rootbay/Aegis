import type { User } from "$lib/features/auth/models/User";
import type { Channel } from "$lib/features/channels/models/Channel";
import type { ChannelCategory } from "$lib/features/channels/models/ChannelCategory";
import type {
  RelayScope,
  RelayStatus,
} from "$lib/features/settings/models/relay";
import type { Role } from "./Role";
import type { ServerInvite } from "./ServerInvite";

export interface ServerEmoji {
  id: string;
  name: string;
  url: string;
  animated?: boolean;
  createdAt?: string;
  uploadedBy?: string;
  available?: boolean;
  usageCount?: number;
}

export interface ServerSticker {
  id: string;
  name: string;
  format: "png" | "apng" | "lottie" | "gif" | string;
  sizeKb?: number;
  tags?: string[];
  description?: string;
  url: string;
  previewUrl?: string;
  createdAt?: string;
  uploadedBy?: string;
}

export interface ServerWidgetSettings {
  enabled: boolean;
  channelId?: string | null;
  theme?: "dark" | "light" | string;
  showMembersOnline?: boolean;
  showInstantInvite?: boolean;
  inviteUrl?: string | null;
  previewUrl?: string | null;
  lastSyncedAt?: string | null;
}

export interface ServerAuditLogEntry {
  id: string;
  action: string;
  actorId: string;
  actorName?: string;
  actorAvatar?: string;
  target?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface ServerModerationReportBase {
  id: string;
  reporterId: string;
  reporterName?: string;
  reason: string;
  createdAt: string;
  status?: "open" | "reviewing" | "resolved" | "dismissed";
  notes?: string;
}

export interface UserModerationReport extends ServerModerationReportBase {
  targetUserId: string;
  targetUserName?: string;
  summary?: string;
}

export interface MessageModerationReport extends ServerModerationReportBase {
  messageId: string;
  chatId?: string;
  chatName?: string;
  messageExcerpt?: string;
}

export type ServerModerationSettings = {
  transparentEdits?: boolean;
  deletedMessageDisplay?: "ghost" | "tombstone";
  enableReadReceipts?: boolean;
  [key: string]: unknown;
};

export interface ServerRelayParticipation {
  relayId: string;
  label: string;
  scope: RelayScope;
  status: RelayStatus;
  lastCheckedAt: string | null;
}

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
  emojis?: ServerEmoji[];
  stickers?: ServerSticker[];
  widgetSettings?: ServerWidgetSettings | null;
  auditLog?: ServerAuditLogEntry[];
  relayParticipation?: ServerRelayParticipation[];
  moderationReports?: {
    userReports?: UserModerationReport[];
    messageReports?: MessageModerationReport[];
  };
}
