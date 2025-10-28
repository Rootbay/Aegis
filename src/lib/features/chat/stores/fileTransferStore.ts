import { invoke } from "@tauri-apps/api/core";
import { derived, get, writable, type Readable } from "svelte/store";
import { toasts } from "$lib/stores/ToastStore";
import { settings } from "$lib/features/settings/stores/settings";

export type FileTransferDirection = "incoming" | "outgoing";
export type FileTransferMode = "basic" | "resilient";
export type FileTransferPhase =
  | "awaiting"
  | "transferring"
  | "resuming"
  | "retrying"
  | "complete";

export type FileTransferStatus =
  | "pending"
  | "accepted"
  | "denied"
  | "received"
  | "transferring"
  | "retrying"
  | "completed";

export interface FileTransferRecord {
  readonly id: string;
  readonly senderId: string;
  readonly filename: string;
  readonly safeFilename: string;
  readonly size?: number;
  readonly path?: string;
  readonly status: FileTransferStatus;
  readonly direction: FileTransferDirection;
  readonly mode: FileTransferMode;
  readonly phase: FileTransferPhase;
  readonly progress: number;
  readonly resumed: boolean;
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

export interface FileTransferProgressPayload {
  direction: FileTransferDirection;
  peer_id: string;
  filename: string;
  safe_filename?: string;
  mode?: FileTransferMode;
  status?: "transferring" | "resuming" | "retrying" | "complete";
  progress?: number;
  resumed?: boolean;
  size?: number;
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
  handleTransferProgress: (payload: FileTransferProgressPayload) => void;
}

const MAX_RECORDS = 50;

function buildId(
  direction: FileTransferDirection,
  peerId: string,
  filename: string,
) {
  return `${direction}:${peerId}:${filename}`;
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
      .filter(
        (record) =>
          record.direction === "incoming" &&
          record.status === "pending" &&
          !record.dismissed,
      )
      .sort((a, b) => a.createdAt - b.createdAt),
  );

  const history = derived(transfers, ($transfers) =>
    Array.from($transfers.values())
      .filter((record) => record.status !== "pending" && !record.dismissed)
      .sort((a, b) => b.updatedAt - a.updatedAt),
  );

  function upsertRecord(
    direction: FileTransferDirection,
    peerId: string,
    filename: string,
    updater: (
      existing: FileTransferRecord | null,
      now: number,
    ) => FileTransferRecord,
  ) {
    const id = buildId(direction, peerId, filename);
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
    const resilientEnabled = get(settings).enableResilientFileTransfer;
    try {
      await invoke("approve_file_transfer", {
        senderId,
        sender_id: senderId,
        filename,
        resilient: resilientEnabled,
      });
      upsertRecord("incoming", senderId, filename, (existing, now) => ({
        id: buildId("incoming", senderId, filename),
        senderId,
        filename,
        safeFilename: existing?.safeFilename ?? filename,
        size: existing?.size,
        path: existing?.path,
        status: "accepted",
        direction: "incoming",
        mode: resilientEnabled ? "resilient" : existing?.mode ?? "basic",
        phase: existing?.phase ?? "awaiting",
        progress: existing?.progress ?? 0,
        resumed: existing?.resumed ?? false,
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
      upsertRecord("incoming", senderId, filename, (existing, now) => ({
        id: buildId("incoming", senderId, filename),
        senderId,
        filename,
        safeFilename: existing?.safeFilename ?? filename,
        size: existing?.size,
        path: existing?.path,
        status: "denied",
        direction: "incoming",
        mode: existing?.mode ?? "basic",
        phase: "complete",
        progress: existing?.progress ?? 0,
        resumed: existing?.resumed ?? false,
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
    const resilientMode = get(settings).enableResilientFileTransfer
      ? "resilient"
      : "basic";
    upsertRecord("incoming", sender_id, filename, (existing, now) => ({
      id: buildId("incoming", sender_id, filename),
      senderId: sender_id,
      filename,
      safeFilename: safe_filename ?? existing?.safeFilename ?? filename,
      size: size ?? existing?.size,
      path: existing?.path,
      status: "pending",
      direction: "incoming",
      mode: resilientMode,
      phase: existing?.phase ?? "awaiting",
      progress: existing?.progress ?? 0,
      resumed: existing?.resumed ?? false,
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
    upsertRecord("incoming", sender_id, filename, (existing, now) => ({
      id: buildId("incoming", sender_id, filename),
      senderId: sender_id,
      filename,
      safeFilename: safe_filename ?? existing?.safeFilename ?? filename,
      size: existing?.size,
      path: existing?.path,
      status: "denied",
      direction: "incoming",
      mode: existing?.mode ?? "basic",
      phase: "complete",
      progress: existing?.progress ?? 0,
      resumed: existing?.resumed ?? false,
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
    upsertRecord("incoming", sender_id, filename, (existing, now) => ({
      id: buildId("incoming", sender_id, filename),
      senderId: sender_id,
      filename,
      safeFilename: safe_filename ?? existing?.safeFilename ?? filename,
      size: existing?.size,
      path: path ?? existing?.path,
      status: "received",
      direction: "incoming",
      mode: existing?.mode ?? "basic",
      phase: "complete",
      progress: 1,
      resumed: existing?.resumed ?? false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      dismissed: false,
    }));
  }

  function handleTransferProgress({
    direction,
    peer_id,
    filename,
    safe_filename,
    mode,
    status,
    progress,
    resumed,
    size,
    path,
  }: FileTransferProgressPayload) {
    const normalizedMode: FileTransferMode =
      mode ?? (direction === "incoming"
        ? get(settings).enableResilientFileTransfer
          ? "resilient"
          : "basic"
        : "basic");
    const normalizedPhase: FileTransferPhase = (() => {
      switch (status) {
        case "resuming":
          return "resuming";
        case "retrying":
          return "retrying";
        case "complete":
          return "complete";
        case "transferring":
        default:
          return "transferring";
      }
    })();
    const normalizedStatus: FileTransferStatus = (() => {
      switch (status) {
        case "retrying":
          return "retrying";
        case "complete":
          return direction === "incoming" ? "received" : "completed";
        case "transferring":
        case "resuming":
          return "transferring";
        default:
          return "transferring";
      }
    })();
    const clampedProgress = Math.min(
      1,
      Math.max(progress ?? 0, 0),
    );

    upsertRecord(direction, peer_id, filename, (existing, now) => {
      const effectiveSafe = safe_filename ?? existing?.safeFilename ?? filename;
      const effectiveProgress =
        progress ?? existing?.progress ?? clampedProgress;
      const effectiveMode = existing?.mode ?? normalizedMode;
      const effectiveStatus =
        status === undefined ? existing?.status ?? "transferring" : normalizedStatus;
      const effectivePhase =
        status === undefined ? existing?.phase ?? "transferring" : normalizedPhase;
      return {
        id: buildId(direction, peer_id, filename),
        senderId: peer_id,
        filename,
        safeFilename: effectiveSafe,
        size: size ?? existing?.size,
        path: path ?? existing?.path,
        status: effectiveStatus,
        direction,
        mode: effectiveMode,
        phase: effectivePhase,
        progress: Math.min(1, Math.max(effectiveProgress, 0)),
        resumed: resumed ?? existing?.resumed ?? false,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        dismissed: false,
      };
    });
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
    handleTransferProgress,
  } satisfies FileTransferStore;
}

export const fileTransferStore = createFileTransferStore();

export type { FileTransferStore };
