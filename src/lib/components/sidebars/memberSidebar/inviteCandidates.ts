import type { Friend } from "$lib/features/friends/models/Friend";
import type { GroupModalUser } from "$lib/features/chat/utils/contextMenu";

interface InviteCandidateParams {
  friends: Friend[];
  currentUserId: string | null;
  existingMemberIds: Set<string>;
}

export function buildInviteCandidates({
  friends,
  currentUserId,
  existingMemberIds,
}: InviteCandidateParams): GroupModalUser[] {
  if (!friends.length) {
    return [];
  }

  const candidates: GroupModalUser[] = [];

  for (const friend of friends) {
    if (!friend?.id) {
      continue;
    }

    if (friend.id === currentUserId) {
      continue;
    }

    if (existingMemberIds.has(friend.id)) {
      continue;
    }

    candidates.push({
      id: friend.id,
      name: friend.name,
      avatar: friend.avatar,
      isFriend: true,
      isPinned: Boolean(friend.isPinned),
    });
  }

  return candidates;
}
