import { describe, expect, it, vi } from "vitest";

import { computeSearchResults } from "$lib/components/lists/directMessageSearch";
import type { DirectMessageListEntry } from "$lib/features/chat/stores/directMessageRoster";
import type { Friend } from "$lib/features/friends/models/Friend";

const createFriend = (overrides: Partial<Friend> = {}): Friend => ({
  id: "friend-1",
  name: "Charlie",
  avatar: "https://example.com/avatar.png",
  online: true,
  status: "Online",
  timestamp: new Date().toISOString(),
  messages: [],
  ...overrides,
});

const buildEntries = (): DirectMessageListEntry[] => {
  const friend = createFriend();
  return [
    {
      id: friend.id,
      type: "dm",
      name: friend.name,
      avatar: friend.avatar,
      online: friend.online,
      memberCount: undefined,
      memberIds: undefined,
      lastActivityAt: friend.timestamp,
      unreadCount: 0,
      lastMessageText: "Hey there",
      friend,
      group: undefined,
    },
    {
      id: "group-1",
      type: "group",
      name: "Alpha Squad",
      avatar: undefined,
      online: undefined,
      memberCount: 3,
      memberIds: ["friend-1", "user-2", "user-3"],
      lastActivityAt: new Date().toISOString(),
      unreadCount: 0,
      lastMessageText: null,
      friend: undefined,
      group: {
        id: "group-1",
        name: "Alpha Squad",
        ownerId: "user-1",
        memberIds: ["friend-1", "user-2", "user-3"],
        createdAt: new Date().toISOString(),
      },
    },
  ];
};

describe("computeSearchResults", () => {
  it("includes matching group chats in the results", () => {
    const entries = buildEntries();

    const results = computeSearchResults(entries, "alpha");

    expect(results.groups).toHaveLength(1);
    expect(results.groups[0]?.id).toBe("group-1");
  });

  it("propagates the group selection to the provided handler", () => {
    const entries = buildEntries();
    const results = computeSearchResults(entries, "alpha");
    const onSelect = vi.fn();

    const groupEntry = results.groups[0];
    expect(groupEntry?.type).toBe("group");

    if (groupEntry) {
      onSelect(groupEntry.id, groupEntry.type);
    }

    expect(onSelect).toHaveBeenCalledWith("group-1", "group");
  });
});
