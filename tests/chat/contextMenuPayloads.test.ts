import { describe, expect, it } from "vitest";

import {
  buildGroupModalOptions,
  buildReportUserPayload,
} from "$lib/features/chat/utils/contextMenu";
import type { Chat } from "$lib/features/chat/models/Chat";
import type { Friend } from "$lib/features/friends/models/Friend";
import type { User } from "$lib/features/auth/models/User";

describe("context menu payload builders", () => {
  const friendUser: Friend = {
    id: "friend-1",
    name: "Alpha",
    avatar: "alpha.png",
    online: true,
    status: "Online",
    timestamp: new Date().toISOString(),
    messages: [],
    isFriend: true,
    isPinned: false,
  };

  const channelUser: User = {
    id: "user-2",
    name: "Beta",
    avatar: "beta.png",
    online: false,
  };

  const dmChat: Chat = {
    type: "dm",
    id: friendUser.id,
    friend: friendUser,
    messages: [],
  };

  const channelChat: Chat = {
    type: "channel",
    id: "channel-123",
    name: "general",
    serverId: "server-1",
    members: [friendUser, channelUser],
    messages: [],
  };

  const groupChat: Chat = {
    type: "group",
    id: "group-123",
    name: "Study buddies",
    ownerId: "owner-1",
    memberIds: [friendUser.id, channelUser.id],
    members: [friendUser, channelUser],
    messages: [],
  };

  it("builds group modal options without additional users for friends", () => {
    const result = buildGroupModalOptions(friendUser);
    expect(result).toEqual({
      preselectedUserIds: [friendUser.id],
      additionalUsers: undefined,
    });
  });

  it("includes additional users when the member is not a friend", () => {
    const result = buildGroupModalOptions(channelUser);
    expect(result.preselectedUserIds).toEqual([channelUser.id]);
    expect(result.additionalUsers).toEqual([
      {
        id: channelUser.id,
        name: channelUser.name,
        avatar: channelUser.avatar,
        isFriend: false,
        isPinned: false,
      },
    ]);
  });

  it("creates a report payload with channel context", () => {
    const payload = buildReportUserPayload(channelChat, channelUser);
    expect(payload).toEqual({
      targetUser: {
        id: channelUser.id,
        name: channelUser.name,
        avatar: channelUser.avatar,
        online: channelUser.online,
        bio: undefined,
        bannerUrl: undefined,
        pfpUrl: undefined,
        publicKey: undefined,
        tag: undefined,
      },
      sourceChatId: channelChat.id,
      sourceChatType: "channel",
      sourceChatName: channelChat.name,
    });
  });

  it("falls back to DM description for direct messages", () => {
    const payload = buildReportUserPayload(dmChat, friendUser);
    expect(payload.sourceChatType).toBe("dm");
    expect(payload.sourceChatName).toBe(friendUser.name);
  });

  it("uses group metadata when available", () => {
    const payload = buildReportUserPayload(groupChat, channelUser);
    expect(payload.sourceChatType).toBe("group");
    expect(payload.sourceChatName).toBe(groupChat.name);
  });
});
