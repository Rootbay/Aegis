import { derived, type Readable } from "svelte/store";
import type { Friend } from "$lib/features/friends/models/Friend";
import { friendStore } from "$lib/features/friends/stores/friendStore";
import type { Message } from "$lib/features/chat/models/Message";
import {
  chatMetadataByChatId,
  groupChats,
  type ChatMetadata,
  type GroupChatSummary,
} from "$lib/features/chat/stores/chatStore";
import { userStore } from "$lib/stores/userStore";

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
}

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

  for (const friend of friends) {
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

  entries.sort((a, b) => {
    const diff = toTimestamp(b.lastActivityAt) - toTimestamp(a.lastActivityAt);
    if (diff !== 0) {
      return diff;
    }
    return a.name.localeCompare(b.name);
  });

  return entries;
}

export const directMessageRoster: Readable<DirectMessageListEntry[]> = derived(
  [friendStore, groupChats, chatMetadataByChatId, userStore],
  ([$friendStore, $groupChats, $metadata, $userStore]) => {
    const friends = $friendStore.friends ?? [];
    const summaries = Array.from($groupChats.values());
    const currentUserId = $userStore.me?.id ?? null;
    return mergeDirectMessageRoster(friends, summaries, $metadata, currentUserId);
  },
);
