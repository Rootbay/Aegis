import { derived, type Readable } from "svelte/store";
import type { User } from "$lib/features/auth/models/User";
import type { Chat } from "$lib/features/chat/models/Chat";
import type { Message } from "$lib/features/chat/models/Message";
import type { Friend } from "$lib/features/friends/models/Friend";
import type { Channel } from "$lib/features/channels/models/Channel";
import { userCache } from "$lib/utils/cache";
import type {
  ActiveChannelIdReadable,
  ActiveChatIdReadable,
  ActiveChatTypeReadable,
  GroupChatsReadable,
  MessagesByChatIdReadable,
  FriendStoreType,
  ServerStoreType,
} from "./types";

interface CurrentChatDependencies {
  friendStore: FriendStoreType;
  serverStore: ServerStoreType;
  groupChats: GroupChatsReadable;
  currentUser: Readable<User | null>;
  activeChatType: ActiveChatTypeReadable;
  activeChatId: ActiveChatIdReadable;
  activeChannelId: ActiveChannelIdReadable;
  messagesByChatId: MessagesByChatIdReadable;
}

export function createCurrentChatStore({
  friendStore,
  serverStore,
  groupChats,
  currentUser,
  activeChatType,
  activeChatId,
  activeChannelId,
  messagesByChatId,
}: CurrentChatDependencies) {
  return derived(
    [
      friendStore,
      serverStore,
      groupChats,
      currentUser,
      activeChatType,
      activeChatId,
      activeChannelId,
      messagesByChatId,
    ],
    ([
      $friendStore,
      $serverStore,
      $groupChatsMap,
      $currentUser,
      $activeChatType,
      $activeChatId,
      $activeChannelId,
      $messagesByChatId,
    ]) =>
      deriveCurrentChat({
        friendStore: $friendStore,
        serverStore: $serverStore,
        groupChats: $groupChatsMap,
        currentUser: $currentUser,
        activeChatType: $activeChatType,
        activeChatId: $activeChatId,
        activeChannelId: $activeChannelId,
        messagesByChatId: $messagesByChatId,
      }),
  );
}

interface DeriveCurrentChatParams {
  friendStore: { friends: Friend[] };
  serverStore: {
    servers: Array<{
      id: string;
      members?: User[];
      channels?: Array<{
        id: string;
        name: string;
        topic?: string | null;
        channel_type: Channel["channel_type"];
      }>;
    }>;
  };
  groupChats: Map<
    string,
    {
      id: string;
      name: string;
      ownerId: string;
      memberIds: string[];
    }
  >;
  currentUser: User | null;
  activeChatType: "dm" | "server" | "group" | null;
  activeChatId: string | null;
  activeChannelId: string | null;
  messagesByChatId: Map<string, Message[]>;
}

function deriveCurrentChat({
  friendStore,
  serverStore,
  groupChats,
  currentUser,
  activeChatType,
  activeChatId,
  activeChannelId,
  messagesByChatId,
}: DeriveCurrentChatParams): Chat | null {
  if (activeChatType === "dm" && activeChatId) {
    const existingFriend = friendStore.friends.find(
      (f) => f.id === activeChatId,
    );
    const messages = deriveMessagesForChat(messagesByChatId, activeChatId);
    const friend =
      existingFriend ??
      synthesizeFriendFromMessages({
        chatId: activeChatId,
        messages,
        currentUser,
      });
    if (friend) {
      return {
        type: "dm",
        id: activeChatId,
        friend,
        messages,
      } satisfies Chat;
    }
  }

  if (activeChatType === "group" && activeChatId) {
    const summary = groupChats.get(activeChatId);
    if (summary) {
      const friendMap = new Map(
        friendStore.friends.map((friend) => [friend.id, friend] as const),
      );
      const members = collectGroupMembers({
        summary,
        friendMap,
        currentUser,
      });
      return {
        type: "group",
        id: summary.id,
        name: summary.name,
        ownerId: summary.ownerId,
        memberIds: summary.memberIds,
        members,
        messages: deriveMessagesForChat(messagesByChatId, summary.id),
      } satisfies Chat;
    }
  }

  if (activeChatType === "server" && activeChatId) {
    const server = serverStore.servers.find((s) => s.id === activeChatId);
    if (server?.channels && server.channels.length > 0) {
      const channel = server.channels.find((c) => c.id === activeChannelId);
      if (channel) {
        return {
          type: "channel",
          id: channel.id,
          name: channel.name,
          serverId: server.id,
          topic: channel.topic ?? null,
          channelType: channel.channel_type,
          members: server.members ?? [],
          messages: deriveMessagesForChat(messagesByChatId, channel.id),
        } satisfies Chat;
      }
    }
  }

  return null;
}

function deriveMessagesForChat(
  messagesByChatId: Map<string, Message[]>,
  key: string,
) {
  return messagesByChatId.get(key) ?? [];
}

function collectGroupMembers({
  summary,
  friendMap,
  currentUser,
}: {
  summary: { memberIds: string[] };
  friendMap: Map<string, User>;
  currentUser: User | null;
}): User[] {
  const seen = new Set<string>();
  const members: User[] = [];

  const addMember = (user: User) => {
    if (seen.has(user.id)) {
      return;
    }
    seen.add(user.id);
    members.push(user);
  };

  for (const memberId of summary.memberIds) {
    if (currentUser && memberId === currentUser.id) {
      addMember(currentUser);
      continue;
    }
    const friend = friendMap.get(memberId);
    if (friend) {
      addMember(friend);
      continue;
    }
    addMember({
      id: memberId,
      name: `User-${memberId.slice(0, 4)}`,
      avatar: `https://api.dicebear.com/8.x/identicon/svg?seed=${memberId}`,
      online: false,
    });
  }

  return members;
}

const FALLBACK_AVATAR = (id: string) =>
  `https://api.dicebear.com/8.x/bottts-neutral/svg?seed=${id}`;

function synthesizeFriendFromMessages({
  chatId,
  messages,
  currentUser,
}: {
  chatId: string;
  messages: Message[];
  currentUser: User | null;
}): Friend {
  const participantId =
    messages.find((message) =>
      currentUser
        ? message.senderId !== currentUser.id
        : Boolean(message.senderId),
    )?.senderId || chatId;

  const cachedUser =
    userCache.get(participantId) ?? userCache.get(chatId) ?? null;
  const resolvedId = participantId ?? chatId;
  const baseName = cachedUser?.name?.trim?.() ?? "";
  const name =
    baseName.length > 0 ? baseName : `User-${resolvedId.slice(0, 4) || "anon"}`;
  const avatarSource = cachedUser?.avatar?.trim?.() ?? "";
  const avatar =
    avatarSource.length > 0
      ? avatarSource
      : FALLBACK_AVATAR(resolvedId || "fallback");
  const online = cachedUser?.online ?? false;
  const lastMessage = messages[messages.length - 1] ?? null;

  return {
    id: resolvedId,
    name,
    avatar,
    online,
    status: online ? "Online" : "Offline",
    statusMessage: cachedUser?.statusMessage ?? null,
    location: cachedUser?.location ?? null,
    messages,
    lastMessage: lastMessage?.content,
    timestamp: lastMessage?.timestamp ?? new Date().toISOString(),
    isFriend: false,
  } satisfies Friend;
}
