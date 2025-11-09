import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock("$lib/stores/ToastStore", () => ({
  toasts: {
    addToast: vi.fn(),
  },
}));

import ReportMessageModal from "$lib/components/modals/ReportMessageModal.svelte";
import { invoke } from "@tauri-apps/api/core";
import { toasts } from "$lib/stores/ToastStore";

describe("ReportMessageModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits a message report with context", async () => {
    const onclose = vi.fn();

    const payload = {
      messageId: "msg-1",
      chatId: "channel-123",
      chatType: "channel" as const,
      chatName: "General",
      authorId: "user-2",
      authorName: "Offending User",
      authorAvatar: "avatar.png",
      messageExcerpt: "Offensive message content",
      messageTimestamp: "2024-08-20T12:00:00.000Z",
      surroundingMessageIds: ["msg-0", "msg-2"],
    };

    const { getByLabelText, getByText } = render(ReportMessageModal, {
      props: {
        onclose,
        payload,
      },
    });

    const detailsField = getByLabelText("Details") as HTMLTextAreaElement;
    await fireEvent.input(detailsField, {
      target: { value: "This message breaks the rules." },
    });

    await fireEvent.click(getByText("Submit report"));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("report_message", {
        message_id: payload.messageId,
        reason: "harassment",
        description: "This message breaks the rules.",
        chat_id: payload.chatId,
        chat_type: payload.chatType,
        chat_name: payload.chatName,
        message_author_id: payload.authorId,
        message_author_name: payload.authorName,
        message_excerpt: payload.messageExcerpt,
        message_timestamp: payload.messageTimestamp,
        surrounding_message_ids: payload.surroundingMessageIds,
      });
      expect(toasts.addToast).toHaveBeenCalledWith(
        "Message report submitted. Our moderators will review it shortly.",
        "success",
      );
      expect(onclose).toHaveBeenCalled();
    });
  });

  it("shows an error when submission fails", async () => {
    const onclose = vi.fn();
    vi.mocked(invoke).mockRejectedValueOnce(new Error("network down"));

    const payload = {
      messageId: "msg-2",
      chatId: undefined,
      chatType: undefined,
      chatName: undefined,
      authorId: "user-3",
      authorName: "Another User",
      authorAvatar: null,
      messageExcerpt: "Spam content",
      messageTimestamp: undefined,
      surroundingMessageIds: undefined,
    };

    const { getByLabelText, getByText } = render(ReportMessageModal, {
      props: {
        onclose,
        payload,
      },
    });

    const detailsField = getByLabelText("Details") as HTMLTextAreaElement;
    await fireEvent.input(detailsField, {
      target: { value: "Spam" },
    });

    await fireEvent.click(getByText("Submit report"));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("report_message", {
        message_id: payload.messageId,
        reason: "harassment",
        description: "Spam",
        chat_id: payload.chatId,
        chat_type: payload.chatType,
        chat_name: payload.chatName,
        message_author_id: payload.authorId,
        message_author_name: payload.authorName,
        message_excerpt: payload.messageExcerpt,
        message_timestamp: payload.messageTimestamp,
        surrounding_message_ids: payload.surroundingMessageIds,
      });
      expect(toasts.addToast).toHaveBeenCalledWith(
        "Failed to submit report. Please try again.",
        "error",
      );
      expect(onclose).not.toHaveBeenCalled();
    });
  });

  it("requires additional details before submitting", async () => {
    const payload = {
      messageId: "msg-3",
      chatId: "dm-123",
      chatType: "dm" as const,
      chatName: "Direct message",
      authorId: "user-4",
      authorName: "Friend",
      authorAvatar: "friend.png",
      messageExcerpt: "Be kind",
      messageTimestamp: "2024-01-01T00:00:00.000Z",
      surroundingMessageIds: [],
    };

    const { getByText } = render(ReportMessageModal, {
      props: {
        onclose: vi.fn(),
        payload,
      },
    });

    await fireEvent.click(getByText("Submit report"));

    expect(invoke).not.toHaveBeenCalled();
    expect(toasts.addToast).toHaveBeenCalledWith(
      "Please include details for the moderation team.",
      "error",
    );
  });
});
