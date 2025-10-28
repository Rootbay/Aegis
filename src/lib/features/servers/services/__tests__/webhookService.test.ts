import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWebhookService } from "../webhookService";

const { invokeMock, addToastMock, showErrorToastMock } = vi.hoisted(() => {
  return {
    invokeMock: vi.fn(),
    addToastMock: vi.fn(),
    showErrorToastMock: vi.fn(),
  };
});

vi.mock("$lib/stores/ToastStore", () => ({
  toasts: {
    addToast: addToastMock,
    showErrorToast: showErrorToastMock,
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

describe("webhookService", () => {
  const createService = () =>
    createWebhookService(((command: string, args?: Record<string, unknown>) =>
      invokeMock(command, args)) as any);

  beforeEach(() => {
    invokeMock.mockReset();
    addToastMock.mockReset();
    showErrorToastMock.mockReset();
  });

  it("lists webhooks for a server", async () => {
    invokeMock.mockResolvedValueOnce([
      {
        id: "hook-1",
        server_id: "server-1",
        name: "Alerts",
        url: "https://example.com",
        channel_id: null,
        created_by: "owner",
        created_at: "2025-01-01T00:00:00.000Z",
        updated_at: "2025-01-01T00:00:00.000Z",
      },
    ]);

    const service = createService();
    const result = await service.fetchWebhooks("server-1");

    expect(result.success).toBe(true);
    expect(result.success && result.data[0].id).toBe("hook-1");
    expect(invokeMock).toHaveBeenCalledWith("list_server_webhooks", {
      server_id: "server-1",
    });
  });

  it("reports an error when listing fails", async () => {
    invokeMock.mockRejectedValueOnce(new Error("network down"));

    const service = createService();
    const result = await service.fetchWebhooks("server-2");

    expect(result.success).toBe(false);
    expect(showErrorToastMock).toHaveBeenCalledWith("network down");
  });

  it("creates a webhook and surfaces success", async () => {
    const backendResponse = {
      id: "hook-2",
      server_id: "server-1",
      name: "Deployments",
      url: "https://hooks.example.com/deploy",
      channel_id: "channel-1",
      created_by: "owner",
      created_at: "2025-01-01T00:00:00.000Z",
      updated_at: "2025-01-01T00:00:00.000Z",
    };
    invokeMock.mockResolvedValueOnce(backendResponse);

    const rollback = vi.fn();
    const optimistic = vi.fn(() => rollback);
    const service = createService();

    const result = await service.createWebhook(
      {
        serverId: "server-1",
        name: "Deployments",
        url: "https://hooks.example.com/deploy",
        channelId: "channel-1",
      },
      { optimisticUpdate: optimistic },
    );

    expect(optimistic).toHaveBeenCalledTimes(1);
    expect(rollback).not.toHaveBeenCalled();
    expect(addToastMock).toHaveBeenCalledWith("Webhook created.", "success");
    expect(result.success).toBe(true);
    expect(result.success && result.data.id).toBe("hook-2");
  });

  it("rolls back optimistic delete on failure", async () => {
    invokeMock.mockRejectedValueOnce(new Error("boom"));
    const rollback = vi.fn();
    const optimistic = vi.fn(() => rollback);
    const service = createService();

    const result = await service.deleteWebhook(
      { webhookId: "hook-3", serverId: "server-1" },
      { optimisticUpdate: optimistic },
    );

    expect(optimistic).toHaveBeenCalledTimes(1);
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(showErrorToastMock).toHaveBeenCalledWith("boom");
  });
});
