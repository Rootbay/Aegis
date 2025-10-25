import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";
import { createChatStore } from "./chatStore";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

describe("chatStore attachment lifecycle", () => {
  let createdUrls: string[];
  let revokeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createdUrls = [];
    invokeMock.mockReset();
    const createSpy = vi.fn(() => {
      const url = `blob:${createdUrls.length}`;
      createdUrls.push(url);
      return url;
    });
    revokeSpy = vi.fn();
    vi.stubGlobal(
      "URL",
      {
        createObjectURL: createSpy,
        revokeObjectURL: revokeSpy,
      } as unknown as typeof URL,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("revokes object URLs when messages are replaced", async () => {
    const firstAttachment = {
      id: "att-1",
      name: "file-a.txt",
      content_type: "text/plain",
      data: [1, 2, 3],
    };
    const secondAttachment = {
      ...firstAttachment,
      data: [4, 5, 6],
    };
    const timestamp = new Date().toISOString();

    invokeMock
      .mockResolvedValueOnce([
        {
          id: "msg-1",
          content: "hello",
          timestamp,
          attachments: [firstAttachment],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "msg-1",
          content: "hello",
          timestamp,
          attachments: [secondAttachment],
        },
      ]);

    const store = createChatStore();

    await store.setActiveChat("chat-1", "dm");
    await store.setActiveChat("chat-1", "dm");

    expect(createdUrls.length).toBeGreaterThan(1);
    expect(revokeSpy).toHaveBeenCalledWith(createdUrls[0]);
    expect(revokeSpy).toHaveBeenCalledTimes(1);
  });

  it("revokes object URLs when messages are deleted", async () => {
    const attachment = {
      id: "att-1",
      name: "file-a.txt",
      content_type: "text/plain",
      data: [1, 2, 3],
    };
    const timestamp = new Date().toISOString();

    invokeMock
      .mockResolvedValueOnce([
        {
          id: "msg-1",
          content: "hello",
          timestamp,
          attachments: [attachment],
        },
      ])
      .mockResolvedValueOnce(undefined);

    const store = createChatStore();

    await store.setActiveChat("chat-1", "dm");
    await store.deleteMessage("chat-1", "msg-1");

    expect(createdUrls.length).toBeGreaterThan(0);
    expect(revokeSpy).toHaveBeenCalledWith(createdUrls[0]);
  });
});
