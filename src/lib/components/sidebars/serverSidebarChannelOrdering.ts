import type { Channel } from "$lib/features/channels/models/Channel";

export function normalizeCategoryId(categoryId?: string | null): string | null {
  return categoryId ?? null;
}

export function sortChannelsByPosition(channels: Channel[]): Channel[] {
  return [...channels].sort((a, b) => {
    const positionA = Number.isFinite(a.position) ? a.position : 0;
    const positionB = Number.isFinite(b.position) ? b.position : 0;
    if (positionA !== positionB) {
      return positionA - positionB;
    }
    return a.name.localeCompare(b.name);
  });
}

export function toUniqueIdList(ids: Iterable<string>): string[] {
  const seen = new Set<string>();
  for (const id of ids) {
    const trimmed = id.trim();
    if (trimmed.length > 0) {
      seen.add(trimmed);
    }
  }
  return Array.from(seen);
}

export function generateUniqueId() {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

interface ApplyChannelMoveOptions {
  channelId: string;
  channels: Channel[];
  targetCategoryId: string | null;
  targetType: "text" | "voice";
  beforeChannelId?: string | null;
}

function buildGroupList(
  channels: Channel[],
  categoryId: string | null,
  type: "text" | "voice",
  excludeId?: string | null,
) {
  const normalizedCategoryId = normalizeCategoryId(categoryId);
  return sortChannelsByPosition(
    channels.filter((channel) => {
      if (excludeId && channel.id === excludeId) {
        return false;
      }
      return (
        channel.channel_type === type &&
        normalizeCategoryId(channel.category_id) === normalizedCategoryId
      );
    }),
  );
}

export function applyChannelMove({
  channelId,
  channels,
  targetCategoryId,
  targetType,
  beforeChannelId,
}: ApplyChannelMoveOptions): Channel[] | null {
  if (!channels?.length) {
    return null;
  }

  const normalizedTargetCategoryId = normalizeCategoryId(targetCategoryId);
  const clonedChannels = channels.map((channel) => ({ ...channel }));
  const channelIndex = clonedChannels.findIndex(
    (channel) => channel.id === channelId,
  );
  if (channelIndex === -1) {
    return null;
  }

  const channel = clonedChannels[channelIndex];
  if (channel.channel_type !== targetType) {
    return null;
  }

  const originalCategoryId = normalizeCategoryId(channel.category_id);
  const sameCategory = originalCategoryId === normalizedTargetCategoryId;
  const sanitizedBeforeId =
    beforeChannelId && beforeChannelId === channelId ? null : beforeChannelId;

  clonedChannels[channelIndex].category_id = normalizedTargetCategoryId;

  const targetGroup = buildGroupList(
    clonedChannels,
    normalizedTargetCategoryId,
    targetType,
    channelId,
  );

  let insertIndex = targetGroup.length;
  if (sanitizedBeforeId) {
    const beforeIndex = targetGroup.findIndex(
      (entry) => entry.id === sanitizedBeforeId,
    );
    if (beforeIndex !== -1) {
      insertIndex = beforeIndex;
    }
  }

  targetGroup.splice(insertIndex, 0, clonedChannels[channelIndex]);
  targetGroup.forEach((entry, index) => {
    entry.position = index;
  });

  if (!sameCategory) {
    const originalGroup = buildGroupList(
      clonedChannels,
      originalCategoryId,
      targetType,
      channelId,
    );
    originalGroup.forEach((entry, index) => {
      entry.position = index;
    });
  }

  const changed = clonedChannels.some((entry) => {
    const original = channels.find((c) => c.id === entry.id);
    if (!original) {
      return true;
    }
    return (
      original.category_id !== entry.category_id ||
      original.position !== entry.position
    );
  });

  if (!changed) {
    return null;
  }

  return clonedChannels;
}
