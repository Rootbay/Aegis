import type { Channel } from "$lib/features/channels/models/Channel";
import type { User } from "$lib/features/auth/models/User";
import type { Server } from "$lib/features/servers/models/Server";

type BytePayload = number[] | Uint8Array;

export type CollaborationKind = "document" | "whiteboard";

export interface CollaborationUpdate {
  document_id?: string;
  documentId?: string;
  update?: BytePayload;
  kind?: CollaborationKind;
  sender_id?: string;
  senderId?: string;
  participants?: string[];
  timestamp?: string;
}

export interface AttachmentPayload {
  id: string;
  name: string;
  content_type?: string;
  contentType?: string;
  size?: number;
  data?: BytePayload;
}

export type ReactionAction = "add" | "remove";

export interface MessageReaction {
  message_id?: string;
  messageId?: string;
  chat_id?: string;
  chatId?: string;
  emoji: string;
  user_id?: string;
  userId?: string;
  action: ReactionAction;
  signature?: BytePayload;
}

export type MessageDeletionScope =
  | { type: "everyone" }
  | {
      type: "specific-users";
      user_ids?: string[];
      userIds?: string[];
    };

export interface DeleteMessage {
  message_id?: string;
  messageId?: string;
  chat_id?: string;
  chatId?: string;
  initiator_id?: string;
  initiatorId?: string;
  scope?: MessageDeletionScope;
  signature?: BytePayload;
}

export interface EditMessage {
  message_id?: string;
  messageId?: string;
  chat_id?: string;
  chatId?: string;
  editor_id?: string;
  editorId?: string;
  new_content?: string;
  newContent?: string;
  edited_at?: string | number | Date;
  editedAt?: string | number | Date;
  signature?: BytePayload;
}

export interface ChatMessage {
  id?: string;
  message_id?: string;
  messageId?: string;
  timestamp?: string | number | Date;
  sender: string;
  content: string;
  channel_id?: string;
  server_id?: string;
  conversation_id?: string;
  conversationId?: string;
  attachments?: AttachmentPayload[];
  reactions?: Record<string, string[]> | null;
  signature?: BytePayload;
}

export interface EncryptedChatMessage {
  sender: string;
  recipient: string;
  init?: BytePayload | null;
  enc_header: BytePayload;
  enc_content: BytePayload;
  signature?: BytePayload;
}

export interface PrekeyBundle {
  user_id: string;
  bundle: BytePayload;
  signature?: BytePayload;
}

export interface EncryptedDmSlot {
  recipient: string;
  init?: BytePayload | null;
  enc_header: BytePayload;
  enc_content: BytePayload;
}

export interface GroupKeyUpdate {
  server_id: string;
  channel_id?: string | null;
  epoch: number;
  slots: EncryptedDmSlot[];
  signature?: BytePayload;
}

export interface EncryptedGroupMessage {
  sender: string;
  server_id: string;
  channel_id?: string | null;
  epoch: number;
  nonce: BytePayload;
  ciphertext: BytePayload;
  signature?: BytePayload;
}

export interface PeerDiscovery {
  peer_id: string;
  address: string;
  signature?: BytePayload;
}

export interface PresenceUpdate {
  user_id: string;
  is_online: boolean;
  signature?: BytePayload;
}

export interface ProfileUpdate {
  user: User;
  signature?: BytePayload;
}

export interface FriendRequest {
  sender_id: string;
  target_id: string;
  signature?: BytePayload;
}

export interface FriendRequestResponse {
  sender_id: string;
  target_id: string;
  accepted: boolean;
  signature?: BytePayload;
}

export interface BlockUser {
  blocker_id: string;
  blocked_id: string;
  signature?: BytePayload;
}

export interface UnblockUser {
  unblocker_id: string;
  unblocked_id: string;
  signature?: BytePayload;
}

export interface RemoveFriendship {
  remover_id: string;
  removed_id: string;
  signature?: BytePayload;
}

export interface CreateGroupChat {
  group_id?: string;
  groupId?: string;
  name?: string | null;
  creator_id?: string;
  creatorId?: string;
  member_ids?: string[];
  memberIds?: string[];
  created_at?: string | number | Date;
  createdAt?: string | number | Date;
  signature?: BytePayload;
}

export interface CreateServer {
  server: Server;
  signature?: BytePayload;
}

export interface JoinServer {
  server_id: string;
  user_id: string;
  signature?: BytePayload;
}

export interface CreateChannel {
  channel: Channel;
  signature?: BytePayload;
}

export interface DeleteChannel {
  channel_id: string;
  signature?: BytePayload;
}

export interface DeleteServer {
  server_id: string;
  signature?: BytePayload;
}

export interface SendServerInvite {
  server_id: string;
  user_id: string;
  signature?: BytePayload;
}

export interface FileTransferRequest {
  sender_id: string;
  recipient_id: string;
  file_name: string;
  file_size: number;
  encrypted_key: BytePayload;
  nonce: BytePayload;
}

export interface FileTransferChunk {
  sender_id: string;
  recipient_id: string;
  file_name: string;
  chunk_index: number;
  data: BytePayload;
}

export interface FileTransferComplete {
  sender_id: string;
  recipient_id: string;
  file_name: string;
}

export interface FileTransferError {
  sender_id: string;
  recipient_id: string;
  file_name: string;
  error: string;
}

export interface AepMessage {
  ChatMessage?: ChatMessage;
  EncryptedChatMessage?: EncryptedChatMessage;
  PrekeyBundle?: PrekeyBundle;
  GroupKeyUpdate?: GroupKeyUpdate;
  EncryptedGroupMessage?: EncryptedGroupMessage;
  PeerDiscovery?: PeerDiscovery;
  PresenceUpdate?: PresenceUpdate;
  CollaborationUpdate?: CollaborationUpdate;
  ProfileUpdate?: ProfileUpdate;
  FriendRequest?: FriendRequest;
  FriendRequestResponse?: FriendRequestResponse;
  BlockUser?: BlockUser;
  UnblockUser?: UnblockUser;
  RemoveFriendship?: RemoveFriendship;
  CreateServer?: CreateServer;
  JoinServer?: JoinServer;
  CreateChannel?: CreateChannel;
  DeleteChannel?: DeleteChannel;
  DeleteServer?: DeleteServer;
  SendServerInvite?: SendServerInvite;
  FileTransferRequest?: FileTransferRequest;
  FileTransferChunk?: FileTransferChunk;
  FileTransferComplete?: FileTransferComplete;
  FileTransferError?: FileTransferError;
  MessageReaction?: MessageReaction;
  CreateGroupChat?: CreateGroupChat;
}
