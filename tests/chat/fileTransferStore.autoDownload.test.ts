import { waitFor } from "@testing-library/svelte";
import { get, writable } from "svelte/store";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from "vitest";

import type { FileTransferStore } from "../../src/lib/features/chat/stores/fileTransferStore";

type InvokeFunction = typeof import("@tauri-apps/api/core").invoke;

const toastMocks = {
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
  showInfoToast: vi.fn(),
};

vi.mock("$app/environment", () => ({
  browser: false,
}));

vi.mock("$lib/stores/ToastStore", () => ({
  toasts: toastMocks,
}));

vi.mock("$lib/features/friends/stores/friendStore", () => {
  const state = writable({ friends: [] });
  return {
    friendStore: {
      subscribe: state.subscribe,
    },
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("fileTransferStore auto-download behaviour", () => {
  let fileTransferStore: FileTransferStore;
  let setAutoDownloadMediaEnabled: (value: boolean) => void;
  let invokeMock: MockedFunction<InvokeFunction>;

  async function loadModules() {
    const storeModule = await import(
      "../../src/lib/features/chat/stores/fileTransferStore"
    );
    fileTransferStore = storeModule.fileTransferStore;

    const settingsModule = await import(
      "../../src/lib/features/settings/stores/settings"
    );
    setAutoDownloadMediaEnabled = settingsModule.setAutoDownloadMediaEnabled;
  }

  beforeEach(async () => {
    vi.resetModules();
    toastMocks.showErrorToast.mockReset();
    toastMocks.showSuccessToast.mockReset();
    toastMocks.showInfoToast.mockReset();

    const coreModule = await import("@tauri-apps/api/core");
    invokeMock = vi.mocked(coreModule.invoke);
    invokeMock.mockReset();

    await loadModules();
  });

  it("auto-approves incoming transfers when auto-download is enabled", async () => {
    setAutoDownloadMediaEnabled(true);
    invokeMock.mockResolvedValue(undefined);

    fileTransferStore.handleTransferRequest({
      sender_id: "peer-1",
      filename: "payload.bin",
      safe_filename: "payload.safe.bin",
      size: 2048,
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("approve_file_transfer", {
        senderId: "peer-1",
        sender_id: "peer-1",
        filename: "payload.bin",
        resilient: true,
      });
    });

    expect(get(fileTransferStore.pending)).toHaveLength(0);
    const history = get(fileTransferStore.history);
    expect(history).toHaveLength(1);
    const record = history[0];
    expect(record.status).toBe("accepted");
    expect(record.safeFilename).toBe("payload.safe.bin");
    expect(record.size).toBe(2048);
    expect(record.autoApprovalFailed).toBe(false);
    expect(toastMocks.showErrorToast).not.toHaveBeenCalled();
  });

  it("allows manual approval when auto-download is disabled", async () => {
    setAutoDownloadMediaEnabled(false);
    invokeMock.mockResolvedValue(undefined);

    fileTransferStore.handleTransferRequest({
      sender_id: "peer-2",
      filename: "manual.bin",
      safe_filename: "manual.safe.bin",
      size: 512,
    });

    const pending = get(fileTransferStore.pending);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.status).toBe("pending");
    expect(pending[0]?.autoApprovalFailed).toBe(false);

    await fileTransferStore.approveTransfer("peer-2", "manual.bin");

    expect(invokeMock).toHaveBeenCalledWith("approve_file_transfer", {
      senderId: "peer-2",
      sender_id: "peer-2",
      filename: "manual.bin",
      resilient: true,
    });

    expect(get(fileTransferStore.pending)).toHaveLength(0);
    const history = get(fileTransferStore.history);
    expect(history).toHaveLength(1);
    const record = history[0];
    expect(record.status).toBe("accepted");
    expect(record.safeFilename).toBe("manual.safe.bin");
    expect(record.autoApprovalFailed).toBe(false);
    expect(toastMocks.showErrorToast).not.toHaveBeenCalled();
  });
});
