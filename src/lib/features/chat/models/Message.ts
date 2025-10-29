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

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  timestamp: string;
  read: boolean;
  pinned?: boolean;
  attachments?: AttachmentMeta[];
  reactions?: Record<string, string[]>;
  pending?: boolean;
  editedAt?: string;
  editedBy?: string;
  expiresAt?: string;
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
