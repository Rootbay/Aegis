import { persistentStore } from "$lib/stores/persistentStore";

type BufferLike = ArrayBufferView & { toString: (encoding: string) => string };

interface MinimalNodeBuffer {
  from(data: ArrayBuffer | ArrayBufferView): BufferLike;
  from(data: string, encoding: string): BufferLike;
}

const nodeBuffer = (globalThis as { Buffer?: MinimalNodeBuffer }).Buffer;

export type ChatDraft = {
  messageInput: string;
  attachments: File[];
  replyTargetMessageId: string | null;
  replyPreview: {
    messageId: string;
    author?: string;
    snippet?: string;
  } | null;
  textareaHeight: string;
};

type PersistedAttachment = {
  name: string;
  type: string;
  lastModified: number;
  data: string;
};

type PersistedChatDraft = {
  messageInput: string;
  attachments: PersistedAttachment[];
  attachmentSignature: string;
  replyTargetMessageId: string | null;
  replyPreview: ChatDraft["replyPreview"];
  textareaHeight: string;
};

const STORAGE_KEY = "chat-drafts";

const backingStore = persistentStore<Record<string, PersistedChatDraft>>(
  STORAGE_KEY,
  {},
);

let drafts: Record<string, PersistedChatDraft> = {};
let resolveReady: (() => void) | null = null;

const ready = new Promise<void>((resolve) => {
  resolveReady = resolve;
});

backingStore.subscribe((value) => {
  drafts = value ?? {};
  if (resolveReady) {
    resolveReady();
    resolveReady = null;
  }
});

function encodeBase64(buffer: ArrayBuffer): string {
  if (nodeBuffer) {
    return nodeBuffer.from(buffer).toString("base64");
  }

  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function decodeBase64(data: string): Uint8Array {
  if (nodeBuffer) {
    const view = nodeBuffer.from(data, "base64");
    const arrayBuffer = view.buffer.slice(
      view.byteOffset,
      view.byteOffset + view.byteLength,
    );
    return new Uint8Array(arrayBuffer);
  }

  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function computeAttachmentSignature(files: File[]): string {
  if (!files.length) {
    return "";
  }

  return files
    .map((file) => `${file.name}:${file.size}:${file.type}:${file.lastModified}`)
    .join("|");
}

async function readFileBuffer(file: File): Promise<ArrayBuffer> {
  const candidate = file as File & {
    arrayBuffer?: () => Promise<ArrayBuffer>;
  };

  if (typeof candidate.arrayBuffer === "function") {
    try {
      return await candidate.arrayBuffer();
    } catch (error) {
      console.warn(
        `[chatDraftStore] Failed to read file buffer for "${file.name}":`,
        error,
      );
    }
  }

  if (typeof Blob !== "undefined" && file instanceof Blob) {
    try {
      const response = new Response(file);
      return await response.arrayBuffer();
    } catch (error) {
      console.warn(
        `[chatDraftStore] Failed to read file buffer for "${file.name}":`,
        error,
      );
    }
  }

  return new ArrayBuffer(0);
}

async function serializeAttachments(
  files: File[],
): Promise<PersistedAttachment[]> {
  if (!files.length) {
    return [];
  }

  const serialized = await Promise.all(
    files.map(async (file) => {
      const buffer = await readFileBuffer(file);
      return {
        name: file.name,
        type: file.type ?? "",
        lastModified: file.lastModified ?? Date.now(),
        data: encodeBase64(buffer),
      } satisfies PersistedAttachment;
    }),
  );

  return serialized;
}

export async function saveChatDraft(
  chatId: string,
  draft: ChatDraft | null,
): Promise<void> {
  if (!chatId) {
    return;
  }

  await ready;

  if (!draft) {
    await clearChatDraft(chatId);
    return;
  }

  const attachmentSignature = computeAttachmentSignature(draft.attachments);

  let persistedAttachments: PersistedAttachment[] = [];
  if (attachmentSignature) {
    const existing = drafts[chatId];
    if (existing && existing.attachmentSignature === attachmentSignature) {
      persistedAttachments = existing.attachments;
    } else {
      persistedAttachments = await serializeAttachments(draft.attachments);
    }
  }

  const persistedDraft: PersistedChatDraft = {
    messageInput: draft.messageInput,
    attachments: persistedAttachments,
    attachmentSignature,
    replyTargetMessageId: draft.replyTargetMessageId,
    replyPreview: draft.replyPreview ? { ...draft.replyPreview } : null,
    textareaHeight: draft.textareaHeight,
  };

  const updated = {
    ...drafts,
    [chatId]: persistedDraft,
  };

  drafts = updated;
  backingStore.set(updated);
}

export async function loadChatDraft(
  chatId: string,
): Promise<ChatDraft | undefined> {
  if (!chatId) {
    return undefined;
  }

  await ready;

  const stored = drafts[chatId];
  if (!stored) {
    return undefined;
  }

  const attachments = stored.attachments.map((item) => {
    const decoded = decodeBase64(item.data);
    const buffer = decoded.buffer as ArrayBuffer;
    const slice = buffer.slice(
      decoded.byteOffset,
      decoded.byteOffset + decoded.byteLength,
    );
    return new File([slice], item.name, {
      type: item.type,
      lastModified: item.lastModified,
    });
  });

  return {
    messageInput: stored.messageInput,
    attachments,
    replyTargetMessageId: stored.replyTargetMessageId,
    replyPreview: stored.replyPreview ? { ...stored.replyPreview } : null,
    textareaHeight: stored.textareaHeight,
  };
}

export async function clearChatDraft(chatId: string): Promise<void> {
  if (!chatId) {
    return;
  }

  await ready;

  if (!(chatId in drafts)) {
    return;
  }

  const { [chatId]: _removed, ...rest } = drafts;
  drafts = rest;
  backingStore.set(rest);
}

export async function resetChatDrafts(): Promise<void> {
  await ready;
  drafts = {};
  backingStore.set({});
}
