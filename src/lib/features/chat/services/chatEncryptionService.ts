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
  try {
    const response = await invoke<BackendEncryptResponse>(
      "encrypt_chat_payload",
      {
        content: params.content,
        attachments: params.attachments.map(toSerializableAttachment),
      },
    );
    const wasEncrypted = Boolean(
      response.wasEncrypted ?? response.was_encrypted,
    );
    const attachments = (response.attachments ?? []).map(
      (attachment, index) => {
        const data =
          attachment.data && attachment.data.length > 0
            ? new Uint8Array(attachment.data)
            : new Uint8Array();
        const fallback = params.attachments[index];
        const normalizedType =
          attachment.content_type ?? attachment.type ?? fallback?.type;
        return {
          name: attachment.name,
          type: normalizedType,
          size:
            attachment.size ??
            params.attachments[index]?.size ??
            data.byteLength,
          data,
        } satisfies MessageAttachmentPayload;
      },
    );
    return {
      content: response.content,
      attachments,
      wasEncrypted,
      metadata: response.metadata,
    };
  } catch (error) {
    console.warn("encrypt_chat_payload failed, using plaintext payload", error);
    return {
      content: params.content,
      attachments: params.attachments,
      wasEncrypted: false,
    };
  }
}

export async function decodeIncomingMessagePayload(
  params: IncomingDecryptionParams,
): Promise<IncomingDecryptionResult> {
  try {
    const attachments = params.attachments ?? undefined;
    const serialized =
      attachments && attachments.length > 0
        ? attachments.map((attachment) => ({
            name: attachment.name,
            type:
              attachment.content_type ??
              attachment.contentType ??
              attachment.type,
            size: attachment.size,
            data: attachmentDataToNumberArray(attachment.data),
          }))
        : [];

    const response =
      (await invoke<BackendDecryptResponse>("decrypt_chat_payload", {
        content: params.content,
        attachments: serialized,
      })) ?? {
        content: params.content,
        attachments: [],
        wasEncrypted: false,
      };

    const resultAttachments = (response.attachments ?? []).map(
      (attachment, index) => {
        const original = attachments?.[index];
        const bytes =
          attachment.data && attachment.data.length > 0
            ? attachmentDataToUint8Array(attachment.data)
            : original?.data
              ? attachmentDataToUint8Array(original.data)
              : undefined;
        const normalizedType =
          attachment.content_type ??
          attachment.type ??
          original?.content_type ??
          original?.contentType ??
          original?.type;
        return {
          ...(original ?? { id: undefined }),
          name: attachment.name ?? original?.name ?? "",
          content_type: normalizedType ?? undefined,
          contentType: normalizedType ?? undefined,
          type: normalizedType ?? undefined,
          size: attachment.size ?? original?.size ?? bytes?.byteLength,
          data: bytes,
        } as BackendAttachment;
      },
    );

    return {
      content: response.content,
      attachments:
        resultAttachments.length > 0 ? resultAttachments : attachments,
      wasEncrypted: Boolean(response.wasEncrypted ?? response.was_encrypted),
    };
  } catch (error) {
    console.warn("decrypt_chat_payload failed, using plaintext payload", error);
    return {
      content: params.content,
      attachments: params.attachments ?? undefined,
      wasEncrypted: false,
    };
  }
}
