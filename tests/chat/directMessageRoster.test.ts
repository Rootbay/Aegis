import { describe, it, expect } from "vitest";
import type { Friend } from "../../src/lib/features/friends/models/Friend";
import type {
  ChatMetadata,
  GroupChatSummary,
} from "../../src/lib/features/chat/stores/chatStore";
import type { Message } from "../../src/lib/features/chat/models/Message";
import { mergeDirectMessageRoster } from "../../src/lib/features/chat/stores/directMessageRoster";

const createFriend = (id: string, name: string, timestamp: string): Friend => ({
  id,
  name,
  avatar: `https://example.com/${id}.png`,
  online: false,
  status: "Offline",
  timestamp,
  messages: [],
});

const createMessage = (
  id: string,
  chatId: string,
  senderId: string,
  content: string,
  timestamp: string,
  read: boolean,
): Message => ({
  id,
  chatId,
  senderId,
  content,
  timestamp,
  read,
});

describe("mergeDirectMessageRoster", () => {
  it("sorts entries by most recent activity", () => {
    const friends: Friend[] = [
      createFriend("friend-1", "Alice", "2024-01-01T10:00:00.000Z"),
      createFriend("friend-2", "Bob", "2024-01-01T09:00:00.000Z"),
    ];
    const groups: GroupChatSummary[] = [
      {
        id: "group-1",
        name: "Study Group",
        ownerId: "owner-1",
        createdAt: "2024-01-01T08:00:00.000Z",
        memberIds: ["friend-1", "friend-2"],
      },
    ];

    const friendMessage = createMessage(
      "msg-1",
      "friend-1",
      "friend-1",
      "Hey there",
      "2024-01-02T11:00:00.000Z",
      false,
    );
    const groupMessage = createMessage(
      "msg-2",
      "group-1",
      "friend-2",
      "Group update",
      "2024-01-02T09:00:00.000Z",
      true,
    );

    const metadata = new Map<string, ChatMetadata>([
      [
        "friend-1",
        {
          chatId: "friend-1",
          lastMessage: friendMessage,
          lastActivityAt: friendMessage.timestamp,
          unreadCount: 2,
        },
      ],
      [
        "group-1",
        {
          chatId: "group-1",
          lastMessage: groupMessage,
          lastActivityAt: groupMessage.timestamp,
          unreadCount: 3,
        },
      ],
    ]);

    const entries = mergeDirectMessageRoster(
      friends,
      groups,
      metadata,
      "friend-1",
    );

    expect(entries.map((entry) => entry.id)).toEqual([
      "friend-1",
      "group-1",
      "friend-2",
    ]);
    const friendEntry = entries.find((entry) => entry.id === "friend-1");
    expect(friendEntry?.unreadCount).toBe(2);
    expect(friendEntry?.lastMessageText).toBe("You: Hey there");

    const groupEntry = entries.find((entry) => entry.id === "group-1");
    expect(groupEntry?.unreadCount).toBe(3);

    const fallbackEntry = entries.find((entry) => entry.id === "friend-2");
    expect(fallbackEntry?.lastActivityAt).toBe("2024-01-01T09:00:00.000Z");
  });
});
