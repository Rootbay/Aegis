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

const ensureUint8Array = (input: Uint8Array | ArrayBuffer): Uint8Array => {
  if (input instanceof Uint8Array) {
    return input;
  }
  return new Uint8Array(input);
};

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
        return {
          name: attachment.name,
          type: attachment.type ?? attachment.content_type,
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
        ? attachments.map((attachment) => {
            const bytes = attachment.data;
            let data: number[] | undefined;
            if (bytes instanceof Uint8Array) {
              data = Array.from(bytes);
            } else if (Array.isArray(bytes)) {
              data = bytes as number[];
            } else if (bytes instanceof ArrayBuffer) {
              data = Array.from(new Uint8Array(bytes));
            }
            return {
              name: attachment.name,
              type: attachment.content_type ?? attachment.type,
              size: attachment.size,
              data,
            };
          })
        : [];

    const response = await invoke<BackendDecryptResponse>(
      "decrypt_chat_payload",
      {
        content: params.content,
        attachments: serialized,
      },
    );

    const resultAttachments = (response.attachments ?? []).map(
      (attachment, index) => {
        const original = attachments?.[index];
        const bytes =
          attachment.data && attachment.data.length > 0
            ? new Uint8Array(attachment.data)
            : original?.data instanceof Uint8Array
              ? original.data
              : original?.data instanceof ArrayBuffer
                ? new Uint8Array(original.data)
                : (original?.data as Uint8Array | undefined);
        return {
          ...(original ?? { id: undefined }),
          name: attachment.name ?? original?.name ?? "",
          content_type:
            attachment.content_type ??
            attachment.type ??
            original?.content_type,
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
