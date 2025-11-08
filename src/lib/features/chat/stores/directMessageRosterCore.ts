import type { Friend } from "$lib/features/friends/models/Friend";
import { isActionableFriend } from "$lib/features/friends/utils/isActionableFriend";
import type { Message } from "$lib/features/chat/models/Message";
import type {
  ChatMetadata,
  GroupChatSummary,
} from "$lib/features/chat/stores/chatStore";

export interface DirectMessageListEntry {
  id: string;
  type: "dm" | "group";
  name: string;
  avatar?: string;
  online?: boolean;
  memberCount?: number;
  memberIds?: string[];
  lastActivityAt: string | null;
  unreadCount: number;
  lastMessageText: string | null;
  friend?: Friend;
  group?: GroupChatSummary;
  synthetic?: {
    userId: string;
  };
}

const FALLBACK_AVATAR = (id: string) =>
  "https://api.dicebear.com/8.x/bottts-neutral/svg?seed=" + id;

const fallbackDisplayName = (id: string) =>
  id && id.length > 0 ? `User-${id.slice(0, 4)}` : "Unknown user";

const computePreviewText = (
  message: Message | null | undefined,
  currentUserId?: string | null,
): string | null => {
  if (!message) {
    return null;
  }

  const trimmed = (message.content ?? "").replace(/\s+/g, " ").trim();
  if (trimmed.length > 0) {
    if (currentUserId && message.senderId === currentUserId) {
      return `You: ${trimmed}`;
    }
    return trimmed;
  }

  const attachmentCount = message.attachments?.length ?? 0;
  if (attachmentCount > 0) {
    return attachmentCount === 1
      ? "Sent an attachment"
      : `Sent ${attachmentCount} attachments`;
  }

  return null;
};

const toTimestamp = (value: string | null | undefined): number => {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
};

export function mergeDirectMessageRoster(
  friends: Friend[],
  groupSummaries: GroupChatSummary[],
  metadata: Map<string, ChatMetadata>,
  currentUserId?: string | null,
): DirectMessageListEntry[] {
  const entries: DirectMessageListEntry[] = [];

  const actionableFriends = friends.filter((friend) =>
    isActionableFriend(friend),
  );
  const friendIds = new Set(actionableFriends.map((friend) => friend.id));
  const groupIds = new Set(groupSummaries.map((summary) => summary.id));

  for (const friend of actionableFriends) {
    const meta = metadata.get(friend.id);
    const lastMessage = meta?.lastMessage ?? null;
    const lastActivityAt =
      meta?.lastActivityAt ??
      lastMessage?.editedAt ??
      lastMessage?.timestamp ??
      friend.timestamp ??
      null;

    entries.push({
      id: friend.id,
      type: "dm",
      name: friend.name,
      avatar: friend.avatar,
      online: friend.online,
      memberCount: undefined,
      memberIds: undefined,
      lastActivityAt,
      unreadCount: meta?.unreadCount ?? 0,
      lastMessageText: computePreviewText(lastMessage, currentUserId),
      friend,
      group: undefined,
    });
  }

  for (const summary of groupSummaries) {
    const meta = metadata.get(summary.id);
    const lastMessage = meta?.lastMessage ?? null;
    const lastActivityAt =
      meta?.lastActivityAt ??
      lastMessage?.editedAt ??
      lastMessage?.timestamp ??
      summary.createdAt ??
      null;

    entries.push({
      id: summary.id,
      type: "group",
      name: summary.name,
      avatar: undefined,
      online: undefined,
      memberCount: summary.memberIds.length,
      memberIds: summary.memberIds,
      lastActivityAt,
      unreadCount: meta?.unreadCount ?? 0,
      lastMessageText: computePreviewText(lastMessage, currentUserId),
      friend: undefined,
      group: summary,
    });
  }

  for (const [chatId, meta] of metadata.entries()) {
    if (groupIds.has(chatId) || friendIds.has(chatId)) {
      continue;
    }

    if (entries.some((entry) => entry.id === chatId && entry.type === "dm")) {
      continue;
    }

    const fallbackUserId =
      typeof meta.fallbackUserId === "string" && meta.fallbackUserId.length > 0
        ? meta.fallbackUserId
        : null;

    if (!fallbackUserId) {
      continue;
    }

    if (friendIds.has(fallbackUserId)) {
      continue;
    }

    if (currentUserId && fallbackUserId === currentUserId) {
      continue;
    }

    const lastMessage = meta.lastMessage;
    if (!lastMessage) {
      continue;
    }

    const nameSource = meta.fallbackName ?? null;
    const name =
      typeof nameSource === "string" && nameSource.trim().length > 0
        ? nameSource.trim()
        : fallbackDisplayName(fallbackUserId);

    const avatarSource = meta.fallbackAvatar ?? null;
    const avatar =
      typeof avatarSource === "string" && avatarSource.trim().length > 0
        ? avatarSource.trim()
        : FALLBACK_AVATAR(fallbackUserId);

    entries.push({
      id: chatId,
      type: "dm",
      name,
      avatar,
      online: undefined,
      memberCount: undefined,
      memberIds: undefined,
      lastActivityAt: meta.lastActivityAt,
      unreadCount: meta.unreadCount ?? 0,
      lastMessageText: computePreviewText(lastMessage, currentUserId),
      friend: undefined,
      group: undefined,
      synthetic: {
        userId: fallbackUserId,
      },
    });
  }

  entries.sort((a, b) => {
    const diff = toTimestamp(b.lastActivityAt) - toTimestamp(a.lastActivityAt);
    if (diff !== 0) {
      return diff;
    }
    return a.name.localeCompare(b.name);
  });

  return entries;
}

export { computePreviewText, toTimestamp };
