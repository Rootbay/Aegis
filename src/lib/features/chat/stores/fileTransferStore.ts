import { invoke } from "@tauri-apps/api/core";
import { derived, writable, type Readable } from "svelte/store";
import { toasts } from "$lib/stores/ToastStore";

export type FileTransferStatus = "pending" | "accepted" | "denied" | "received";

export interface FileTransferRecord {
  readonly id: string;
  readonly senderId: string;
  readonly filename: string;
  readonly safeFilename: string;
  readonly size?: number;
  readonly path?: string;
  readonly status: FileTransferStatus;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly dismissed: boolean;
}

export interface FileTransferRequestPayload {
  sender_id: string;
  filename: string;
  safe_filename?: string;
  size?: number;
}

export interface FileTransferDeniedPayload {
  sender_id: string;
  filename: string;
  safe_filename?: string;
}

export interface FileReceivedPayload {
  sender_id: string;
  filename: string;
  safe_filename?: string;
  path?: string;
}

interface FileTransferStore {
  subscribe: Readable<Map<string, FileTransferRecord>>["subscribe"];
  pending: Readable<FileTransferRecord[]>;
  history: Readable<FileTransferRecord[]>;
  approveTransfer: (senderId: string, filename: string) => Promise<void>;
  rejectTransfer: (senderId: string, filename: string) => Promise<void>;
  dismiss: (id: string) => void;
  handleTransferRequest: (payload: FileTransferRequestPayload) => void;
  handleTransferDenied: (payload: FileTransferDeniedPayload) => void;
  handleFileReceived: (payload: FileReceivedPayload) => void;
}

const MAX_RECORDS = 50;

function buildId(senderId: string, filename: string) {
  return `${senderId}:${filename}`;
}

function enforceRecordLimit(map: Map<string, FileTransferRecord>) {
  if (map.size <= MAX_RECORDS) {
    return map;
  }

  const removable = Array.from(map.values())
    .filter((record) => record.status !== "pending" || record.dismissed)
    .sort((a, b) => a.updatedAt - b.updatedAt);

  for (const record of removable) {
    if (map.size <= MAX_RECORDS) {
      break;
    }
    map.delete(record.id);
  }

  return map;
}

function createFileTransferStore(): FileTransferStore {
  const transfers = writable<Map<string, FileTransferRecord>>(new Map());

  const pending = derived(transfers, ($transfers) =>
    Array.from($transfers.values())
      .filter((record) => record.status === "pending" && !record.dismissed)
      .sort((a, b) => a.createdAt - b.createdAt),
  );

  const history = derived(transfers, ($transfers) =>
    Array.from($transfers.values())
      .filter((record) => record.status !== "pending" && !record.dismissed)
      .sort((a, b) => b.updatedAt - a.updatedAt),
  );

  function upsertRecord(
    senderId: string,
    filename: string,
    updater: (
      existing: FileTransferRecord | null,
      now: number,
    ) => FileTransferRecord,
  ) {
    const id = buildId(senderId, filename);
    transfers.update((current) => {
      const now = Date.now();
      const next = new Map(current);
      const existing = next.get(id) ?? null;
      const updated = updater(existing, now);
      next.set(id, updated);
      return enforceRecordLimit(next);
    });
  }

  async function approveTransfer(senderId: string, filename: string) {
    try {
      await invoke("approve_file_transfer", {
        senderId,
        sender_id: senderId,
        filename,
      });
      upsertRecord(senderId, filename, (existing, now) => ({
        id: buildId(senderId, filename),
        senderId,
        filename,
        safeFilename: existing?.safeFilename ?? filename,
        size: existing?.size,
        path: existing?.path,
        status: "accepted",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        dismissed: false,
      }));
    } catch (error) {
      console.error("Failed to approve file transfer", error);
      toasts.showErrorToast("Failed to approve file transfer.");
      throw error;
    }
  }

  async function rejectTransfer(senderId: string, filename: string) {
    try {
      await invoke("reject_file_transfer", {
        senderId,
        sender_id: senderId,
        filename,
      });
      upsertRecord(senderId, filename, (existing, now) => ({
        id: buildId(senderId, filename),
        senderId,
        filename,
        safeFilename: existing?.safeFilename ?? filename,
        size: existing?.size,
        path: existing?.path,
        status: "denied",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        dismissed: false,
      }));
    } catch (error) {
      console.error("Failed to reject file transfer", error);
      toasts.showErrorToast("Failed to reject file transfer.");
      throw error;
    }
  }

  function dismiss(id: string) {
    transfers.update((current) => {
      if (!current.has(id)) {
        return current;
      }
      const next = new Map(current);
      const existing = next.get(id);
      if (!existing) {
        return current;
      }
      next.set(id, { ...existing, dismissed: true, updatedAt: Date.now() });
      return enforceRecordLimit(next);
    });
  }

  function handleTransferRequest({
    sender_id,
    filename,
    safe_filename,
    size,
  }: FileTransferRequestPayload) {
    upsertRecord(sender_id, filename, (existing, now) => ({
      id: buildId(sender_id, filename),
      senderId: sender_id,
      filename,
      safeFilename: safe_filename ?? existing?.safeFilename ?? filename,
      size: size ?? existing?.size,
      path: existing?.path,
      status: "pending",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      dismissed: false,
    }));
  }

  function handleTransferDenied({
    sender_id,
    filename,
    safe_filename,
  }: FileTransferDeniedPayload) {
    upsertRecord(sender_id, filename, (existing, now) => ({
      id: buildId(sender_id, filename),
      senderId: sender_id,
      filename,
      safeFilename: safe_filename ?? existing?.safeFilename ?? filename,
      size: existing?.size,
      path: existing?.path,
      status: "denied",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      dismissed: false,
    }));
  }

  function handleFileReceived({
    sender_id,
    filename,
    safe_filename,
    path,
  }: FileReceivedPayload) {
    upsertRecord(sender_id, filename, (existing, now) => ({
      id: buildId(sender_id, filename),
      senderId: sender_id,
      filename,
      safeFilename: safe_filename ?? existing?.safeFilename ?? filename,
      size: existing?.size,
      path: path ?? existing?.path,
      status: "received",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      dismissed: false,
    }));
  }

  return {
    subscribe: transfers.subscribe,
    pending,
    history,
    approveTransfer,
    rejectTransfer,
    dismiss,
    handleTransferRequest,
    handleTransferDenied,
    handleFileReceived,
  } satisfies FileTransferStore;
}

export const fileTransferStore = createFileTransferStore();

export type { FileTransferStore };
