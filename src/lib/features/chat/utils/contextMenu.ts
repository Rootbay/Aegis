import type { Friend } from "$lib/features/friends/models/Friend";
import type { User } from "$lib/features/auth/models/User";
import type { Chat } from "$lib/features/chat/models/Chat";

type ChatType = Chat["type"]; // helper alias

export type GroupModalUser = {
  id: string;
  name: string;
  avatar: string;
  isFriend: boolean;
  isPinned: boolean;
};

export type GroupModalOptions = {
  preselectedUserIds: string[];
  additionalUsers?: GroupModalUser[];
};

export type ReportUserModalPayload = {
  targetUser: User;
  sourceChatId?: string;
  sourceChatType?: ChatType;
  sourceChatName?: string;
};

function normalizeUser(user: User | Friend): User {
  const baseUser = user as User;
  return {
    id: baseUser.id,
    name: baseUser.name,
    avatar: baseUser.avatar,
    online: baseUser.online ?? false,
    bio: baseUser.bio,
    bannerUrl: baseUser.bannerUrl,
    pfpUrl: baseUser.pfpUrl,
    publicKey: baseUser.publicKey,
    tag: baseUser.tag,
  };
}

function toGroupModalUser(user: User | Friend): GroupModalUser {
  const friend = user as Friend;
  return {
    id: user.id,
    name: user.name,
    avatar: user.avatar,
    isFriend: Boolean((friend?.isFriend ?? true) || "status" in friend),
    isPinned: Boolean(friend?.isPinned),
  };
}

export function buildGroupModalOptions(user: User | Friend): GroupModalOptions {
  const additionalUsers: GroupModalUser[] = [];
  const isFriend = "status" in (user as Friend) || (user as Friend)?.isFriend;

  if (!isFriend) {
    additionalUsers.push({
      ...toGroupModalUser(user),
      isFriend: false,
      isPinned: false,
    });
  }

  return {
    preselectedUserIds: [user.id],
    additionalUsers: additionalUsers.length > 0 ? additionalUsers : undefined,
  };
}

export function buildReportUserPayload(
  chat: Chat | null,
  user: User | Friend,
): ReportUserModalPayload {
  const normalizedUser = normalizeUser(user);

  return {
    targetUser: normalizedUser,
    sourceChatId: chat?.id,
    sourceChatType: chat?.type,
    sourceChatName:
      chat?.type === "channel"
        ? chat.name
        : chat?.type === "group"
          ? chat.name
          : chat?.type === "dm"
            ? (chat.friend?.name ?? normalizedUser.name)
            : undefined,
  };
}
