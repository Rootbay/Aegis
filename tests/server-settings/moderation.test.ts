import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import Moderation from "$lib/components/server-settings/Moderation.svelte";

const baseServer = {
  id: "server-1",
  name: "Test Server",
  owner_id: "owner-1",
  channels: [],
  categories: [],
  members: [],
  roles: [],
};

describe("Server moderation dashboard", () => {
  it("shows user and message reports in separate sections", () => {
    const server = {
      ...baseServer,
      moderationReports: {
        userReports: [
          {
            id: "ur-1",
            reporterId: "user-1",
            reporterName: "Reporter",
            reason: "harassment",
            createdAt: "2024-08-20T12:00:00.000Z",
            status: "reviewing" as const,
            targetUserId: "target-1",
            targetUserName: "Target User",
            summary: "Target User sent threats",
          },
        ],
        messageReports: [
          {
            id: "mr-1",
            reporterId: "user-2",
            reporterName: "Moderator",
            reason: "spam",
            createdAt: "2024-08-21T09:30:00.000Z",
            status: "open" as const,
            messageId: "msg-1",
            chatId: "channel-42",
            chatName: "announcements",
            messageExcerpt: "Check out this scam link",
          },
        ],
      },
    };

    render(Moderation, {
      props: {
        server,
        onupdateServer: () => {},
      },
    });

    expect(screen.getByText("Open user reports")).toBeInTheDocument();
    expect(screen.getByText("Open message reports")).toBeInTheDocument();
    expect(screen.getByText("Target User")).toBeInTheDocument();
    expect(screen.getByText("announcements")).toBeInTheDocument();
    expect(
      screen.getByText("Target User sent threats"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Check out this scam link"),
    ).toBeInTheDocument();
  });

  it("renders empty states when no reports are present", () => {
    const server = {
      ...baseServer,
      moderationReports: {
        userReports: [],
        messageReports: [],
      },
    };

    render(Moderation, {
      props: {
        server,
        onupdateServer: () => {},
      },
    });

    expect(
      screen.getByText("No user reports have been submitted yet."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No message reports have been submitted yet."),
    ).toBeInTheDocument();
  });
});
