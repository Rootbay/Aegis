import { render, waitFor } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import MessageAuthorName from "../../src/lib/features/chat/components/MessageAuthorName.svelte";
import { channelDisplayPreferencesStore } from "../../src/lib/features/channels/stores/channelDisplayPreferencesStore";
import { invoke } from "@tauri-apps/api/core";

const invokeMock = vi.mocked(invoke);

describe("MessageAuthorName", () => {
  it("updates the rendered label when hide-names preference changes", async () => {
    const { getByRole } = render(MessageAuthorName, {
      props: {
        chatType: "channel",
        channelId: "channel-1",
        senderName: "Alice",
        className: "",
      },
    });

    const button = getByRole("button");
    expect(button.textContent ?? "").toContain("Alice");

    invokeMock.mockResolvedValueOnce({
      channel_id: "channel-1",
      hide_member_names: true,
    });
    await channelDisplayPreferencesStore.setHideMemberNames("channel-1", true);

    await waitFor(() =>
      expect(button.textContent ?? "").toContain("Hidden Member"),
    );

    invokeMock.mockResolvedValueOnce({
      channel_id: "channel-1",
      hide_member_names: false,
    });
    await channelDisplayPreferencesStore.setHideMemberNames("channel-1", false);

    await waitFor(() => expect(button.textContent ?? "").toContain("Alice"));
  });
});
