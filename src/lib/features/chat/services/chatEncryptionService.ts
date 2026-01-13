import { invoke } from "@tauri-apps/api/core";
import type { AttachmentPayload as BackendAttachment } from "$lib/features/chat/models/AepMessage";

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
  metadata?: EncryptionMetadata;
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

interface EncryptionMetadata {
  algorithm: string;
  version: number;
}

type SerializableAttachment = {
  name: string;
  type?: string;
  size: number;
  data: number[];
};

type BackendAttachmentPayload = {
  name: string;
  type?: string;
  content_type?: string;
  size?: number;
  data?: number[];
};

type BackendEncryptResponse = {
  content: string;
  attachments: BackendAttachmentPayload[];
  metadata?: EncryptionMetadata;
  wasEncrypted?: boolean;
  was_encrypted?: boolean;
};

type BackendDecryptResponse = {
  content: string;
  attachments: BackendAttachmentPayload[];
  wasEncrypted?: boolean;
  was_encrypted?: boolean;
};

type AttachmentBytePayload = number[] | Uint8Array | ArrayBuffer | undefined;

const attachmentDataToUint8Array = (
  input: AttachmentBytePayload,
): Uint8Array => {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (Array.isArray(input)) {
    return new Uint8Array(input);
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  return new Uint8Array();
};

const attachmentDataToNumberArray = (
  input: AttachmentBytePayload,
): number[] => Array.from(attachmentDataToUint8Array(input));

const ensureUint8Array = (
  input: AttachmentBytePayload,
): Uint8Array => attachmentDataToUint8Array(input);

const toSerializableAttachment = (
  attachment: MessageAttachmentPayload,
): SerializableAttachment => {
  const bytes = ensureUint8Array(attachment.data);
  const array = Array.from(bytes);
  return {
    name: attachment.name,
    type: attachment.type,
    size: attachment.size ?? bytes.byteLength,
    data: array,
  } satisfies SerializableAttachment;
};

export async function encryptOutgoingMessagePayload(
  params: OutgoingEncryptionParams,
): Promise<OutgoingEncryptionResult> {
  return {
    content: params.content,
    attachments: params.attachments,
    wasEncrypted: false,
  };
}

export async function decodeIncomingMessagePayload(
  params: IncomingDecryptionParams,
): Promise<IncomingDecryptionResult> {
  return {
    content: params.content,
    attachments: params.attachments ?? [],
    wasEncrypted: false,
  };
}
