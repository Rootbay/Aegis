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

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  timestamp: string;
  read: boolean;
  attachments?: AttachmentMeta[];
  reactions?: Record<string, string[]>;
  pending?: boolean;
  editedAt?: string;
  editedBy?: string;
  expiresAt?: string;
}
