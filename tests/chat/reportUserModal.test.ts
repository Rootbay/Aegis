import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock("$lib/stores/ToastStore", () => ({
  toasts: {
    addToast: vi.fn(),
  },
}));

import ReportUserModal from "$lib/components/modals/ReportUserModal.svelte";
import { invoke } from "@tauri-apps/api/core";
import { toasts } from "$lib/stores/ToastStore";

describe("ReportUserModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits a report with the provided payload", async () => {
    const onclose = vi.fn();

    const payload = {
      targetUser: {
        id: "user-1",
        name: "Example User",
        avatar: "avatar.png",
        online: false,
      },
      sourceChatId: "channel-123",
      sourceChatType: "channel" as const,
      sourceChatName: "general",
    };

    const { getByLabelText, getByText } = render(ReportUserModal, {
      props: {
        onclose,
        payload,
      },
    });

    const detailsField = getByLabelText("Details") as HTMLTextAreaElement;
    await fireEvent.input(detailsField, { target: { value: "spam message" } });

    await fireEvent.click(getByText("Submit report"));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("submit_user_report", {
        target_user_id: payload.targetUser.id,
        reason: "harassment",
        description: "spam message",
        source_chat_id: payload.sourceChatId,
        source_chat_type: payload.sourceChatType,
      });
      expect(toasts.addToast).toHaveBeenCalledWith(
        "Report submitted. Thank you for helping keep the community safe.",
        "success",
      );
      expect(onclose).toHaveBeenCalled();
    });
  });
});
