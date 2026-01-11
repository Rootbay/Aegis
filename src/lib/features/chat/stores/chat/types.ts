export type BackendMessage = {
  id: string;
  chat_id?: string;
  chatId?: string;
  sender_id?: string;
  senderId?: string;
  sender_type?: string;
  senderType?: string;
  author_type?: string;
  authorType?: string;
  server_id?: string;
  serverId?: string;
  sender_profile?: unknown;
  senderProfile?: unknown;
  sender_name?: string;
  senderName?: string;
  sender_username?: string;
  senderUsername?: string;
  sender_avatar?: string;
  senderAvatar?: string;
  sender_avatar_url?: string;
  senderAvatarUrl?: string;
  content: string;
  timestamp: string | number | Date;
  read?: boolean;
  pinned?: boolean;
  attachments?: BackendAttachment[];
  reactions?: Record<string, string[]> | null;
  edited_at?: string | number | Date | null;
  editedAt?: string | number | Date | null;
  edited_by?: string | null;
  editedBy?: string | null;
  expires_at?: string | number | Date | null;
  expiresAt?: string | number | Date | null;
  reply_to_message_id?: string | null;
  replyToMessageId?: string | null;
  reply_snapshot_author?: string | null;
  replySnapshotAuthor?: string | null;
  reply_snapshot_snippet?: string | null;
  replySnapshotSnippet?: string | null;
  embeds?: BackendMessageEmbed[] | null;
};

export type BackendAttachment = {
  id: string;
  message_id?: string;
  messageId?: string;
  name: string;
  content_type?: string;
  contentType?: string;
  size?: number;
  data?: number[] | Uint8Array | ArrayBuffer;
};

export type BackendMessageEmbedProvider = {
  name?: string | null;
  url?: string | null;
  icon_url?: string | null;
  iconUrl?: string | null;
};

export type BackendMessageEmbed = {
  id?: string;
  type?: string | null;
  url?: string | null;
  title?: string | null;
  description?: string | null;
  site_name?: string | null;
  siteName?: string | null;
  color?: string | number | null;
  thumbnail_url?: string | null;
  thumbnailUrl?: string | null;
  image_url?: string | null;
  imageUrl?: string | null;
  provider?: BackendMessageEmbedProvider | null;
  provider_name?: string | null;
  providerName?: string | null;
  provider_url?: string | null;
  providerUrl?: string | null;
  provider_icon_url?: string | null;
  providerIconUrl?: string | null;
};

export type BackendGroupChat = {
  id: string;
  name?: string | null;
  owner_id?: string;
  ownerId?: string;
  created_at?: string | number | Date;
  createdAt?: string | number | Date;
  member_ids?: string[];
  memberIds?: string[];
};

export type ChatPreferenceOverrides = {
  readReceiptsEnabled?: boolean;
  typingIndicatorsEnabled?: boolean;
};

export type ChatPreferenceState = Record<string, ChatPreferenceOverrides>;

export type ResolvedChatPreferences = {
  readReceiptsEnabled: boolean;
  typingIndicatorsEnabled: boolean;
};

