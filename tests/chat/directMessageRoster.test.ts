import { describe, it, expect, vi } from "vitest";
import type { Friend } from "../../src/lib/features/friends/models/Friend";
import type {
  ChatMetadata,
  GroupChatSummary,
} from "../../src/lib/features/chat/stores/chatStore";
import type { Message } from "../../src/lib/features/chat/models/Message";
import { mergeDirectMessageRoster } from "../../src/lib/features/chat/stores/directMessageRosterCore";

vi.mock("onnxruntime-web/wasm", () =>
  import("../shims/onnxruntime-web-wasm").then((module) => module),
);

const createFriend = (
  id: string,
  name: string,
  timestamp: string,
  overrides: Partial<Friend> = {},
): Friend => ({
  id,
  name,
  avatar: `https://example.com/${id}.png`,
  online: false,
  status: "Offline",
  timestamp,
  messages: [],
  ...overrides,
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

  it("excludes blocked or pending friends from the roster", () => {
    const actionableFriend = createFriend(
      "friend-1",
      "Actionable",
      "2024-01-01T10:00:00.000Z",
    );
    const pendingFriend = createFriend(
      "friend-2",
      "Pending Pal",
      "2024-01-01T11:00:00.000Z",
      { status: "Pending", relationshipStatus: "pending" },
    );
    const blockedFriend = createFriend(
      "friend-3",
      "Blocked Buddy",
      "2024-01-01T12:00:00.000Z",
      { status: "Blocked", relationshipStatus: "blocked" },
    );
    const blockedByRelationship = createFriend(
      "friend-4",
      "Blocked by Other",
      "2024-01-01T09:30:00.000Z",
      { relationshipStatus: "blocked_by_a" },
    );

    const entries = mergeDirectMessageRoster(
      [actionableFriend, pendingFriend, blockedFriend, blockedByRelationship],
      [],
      new Map(),
      "friend-1",
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe("friend-1");
  });

  it("creates synthetic entries for metadata-only conversations", () => {
    const lastMessage = createMessage(
      "msg-unknown",
      "conversation-42",
      "user-42",
      "Sent a ping",
      "2024-01-03T12:00:00.000Z",
      false,
    );

    const metadata = new Map<string, ChatMetadata>([
      [
        "conversation-42",
        {
          chatId: "conversation-42",
          lastMessage,
          lastActivityAt: lastMessage.timestamp,
          unreadCount: 4,
          fallbackUserId: "user-42",
          fallbackName: "Mystery Contact",
          fallbackAvatar: "https://example.com/user-42.png",
        },
      ],
    ]);

    const entries = mergeDirectMessageRoster([], [], metadata, "current-user");

    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry.type).toBe("dm");
    expect(entry.synthetic?.userId).toBe("user-42");
    expect(entry.friend).toBeUndefined();
    expect(entry.name).toBe("Mystery Contact");
    expect(entry.avatar).toBe("https://example.com/user-42.png");
    expect(entry.lastMessageText).toBe("Sent a ping");
    expect(entry.unreadCount).toBe(4);
  });

  it("falls back to generated display data when metadata lacks explicit name", () => {
    const lastMessage = createMessage(
      "msg-fallback",
      "conversation-77",
      "user-77",
      "Hello there",
      "2024-01-04T09:30:00.000Z",
      true,
    );

    const metadata = new Map<string, ChatMetadata>([
      [
        "conversation-77",
        {
          chatId: "conversation-77",
          lastMessage,
          lastActivityAt: lastMessage.timestamp,
          unreadCount: 0,
          fallbackUserId: "user-77",
        },
      ],
    ]);

    const entries = mergeDirectMessageRoster(
      [createFriend("user-99", "Existing", "2024-01-02T10:00:00.000Z")],
      [],
      metadata,
      "user-99",
    );

    expect(
      entries.find((entry) => entry.id === "conversation-77"),
    ).toMatchObject({
      name: expect.stringContaining("User-"),
      avatar: expect.stringContaining("https://api.dicebear.com/"),
      synthetic: { userId: "user-77" },
    });
  });
});
