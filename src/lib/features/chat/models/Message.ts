export interface AttachmentMeta {
  name: string;
  type: string;
  size?: number;
  url?: string;
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
}
