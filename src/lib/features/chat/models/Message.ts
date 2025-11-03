export interface AttachmentMeta {
  id: string;
  name: string;
  type: string;
  size?: number;
  objectUrl?: string;
  isLoaded: boolean;
  isLoading: boolean;
  loadError?: string;
}

export interface ReplySnapshot {
  author?: string;
  snippet?: string;
}

export type MessageAuthorType = "user" | "bot" | "webhook";

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  timestamp: string;
  timestampMs?: number;
  read: boolean;
  pinned?: boolean;
  attachments?: AttachmentMeta[];
  reactions?: Record<string, string[]>;
  pending?: boolean;
  status?: string;
  retryable?: boolean;
  sendFailed?: boolean;
  sendError?: string;
  errorMessage?: string;
  failureReason?: string;
  editedAt?: string;
  editedBy?: string;
  expiresAt?: string;
  authorType?: MessageAuthorType;
  spamScore?: number;
  isSpamFlagged?: boolean;
  spamReasons?: string[];
  spamMuted?: boolean;
  spamDecision?: "flagged" | "auto-muted" | "muted" | "allowed";
  editHistory?: string[];
  deleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  replyToMessageId?: string;
  replySnapshot?: ReplySnapshot;
}
