import type {
  AttachmentPayload as BackendAttachment,
} from "$lib/features/chat/models/AepMessage";

export interface MessageAttachmentPayload {
  name: string;
  type?: string;
  size: number;
  data: Uint8Array | ArrayBuffer;
}

export type ChatContextType = "dm" | "server" | "group";

export interface OutgoingEncryptionParams {
  content: string;
  attachments: MessageAttachmentPayload[];
  chatType: ChatContextType;
  chatId: string;
  channelId?: string | null;
  senderId: string;
  recipientId?: string | null;
}

export interface OutgoingEncryptionResult {
  content: string;
  attachments: MessageAttachmentPayload[];
  wasEncrypted: boolean;
}

export interface IncomingDecryptionParams {
  content: string;
  attachments?: BackendAttachment[] | null;
}

export interface IncomingDecryptionResult {
  content: string;
  attachments?: BackendAttachment[];
  wasEncrypted: boolean;
}

export async function encryptOutgoingMessagePayload(
  params: OutgoingEncryptionParams,
): Promise<OutgoingEncryptionResult> {
  return {
    content: params.content,
    attachments: params.attachments,
    wasEncrypted: false,
  };
}

export function decodeIncomingMessagePayload(
  params: IncomingDecryptionParams,
): IncomingDecryptionResult {
  return {
    content: params.content,
    attachments: params.attachments ?? undefined,
    wasEncrypted: false,
  };
}
