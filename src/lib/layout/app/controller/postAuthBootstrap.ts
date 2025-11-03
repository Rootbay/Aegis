import { get } from "svelte/store";
import type { ListenFn } from "$services/tauri";
import type { Friend } from "$lib/features/friends/models/Friend";
import type { Server } from "$lib/features/servers/models/Server";
import type { Message } from "$lib/features/chat/models/Message";
import type {
  FileTransferDeniedPayload,
  FileTransferProgressPayload,
  FileTransferRequestPayload,
  FileReceivedPayload,
} from "$lib/features/chat/stores/fileTransferStore";
import type { AepMessage } from "$lib/features/chat/models/AepMessage";
import type { MessageReadReceiptEvent } from "$lib/features/chat/stores/chatStore";
import type { TypingIndicatorEvent } from "$lib/features/chat/stores/chatStore";
import type {
  ChatStoreType,
  CollaborationStoreType,
  FileTransferStoreType,
  FriendStoreType,
  ServerStoreType,
  UserStoreType,
} from "./types";

type Unlisten = () => void;

export interface PostAuthBootstrapDependencies {
  chatStore: ChatStoreType;
  friendStore: FriendStoreType;
  serverStore: ServerStoreType;
  fileTransferStore: FileTransferStoreType;
  collaborationStore: CollaborationStoreType;
  userStore: UserStoreType;
  getListen: () => Promise<ListenFn | null>;
}

export function createPostAuthBootstrap({
  chatStore,
  friendStore,
  serverStore,
  fileTransferStore,
  collaborationStore,
  userStore,
  getListen,
}: PostAuthBootstrapDependencies) {
  const restoreActiveSelections = () => {
    if (typeof localStorage === "undefined") {
      return;
    }

    const storedActiveServerId = localStorage.getItem("activeServerId");
    const storedActiveChatId = localStorage.getItem("activeChatId");
    const storedActiveChatType = localStorage.getItem("activeChatType");

    if (storedActiveServerId) {
      serverStore.setActiveServer(storedActiveServerId);
    }

    if (storedActiveChatId && storedActiveChatType) {
      chatStore.setActiveChat(
        storedActiveChatId,
        storedActiveChatType as "dm" | "server",
      );
    }
  };

  const registerEventListeners = async (): Promise<Unlisten[]> => {
    const listen = await getListen();
    if (!listen) {
      return [];
    }

    const unlistenHandlers: Unlisten[] = [];

    const register = async <T>(
      event: string,
      handler: (event: { payload: T }) => void,
    ) => {
      const unlisten = await listen<{ payload: T }>(event, handler);
      unlistenHandlers.push(unlisten);
    };

    await register<Friend[]>("friends-updated", (event) => {
      friendStore.handleFriendsUpdate(event.payload);
    });

    await register<Server[]>("servers-updated", (event) => {
      serverStore.handleServersUpdate(event.payload);
    });

    await register<{ chatId: string; messages: Message[] }>(
      "messages-updated",
      (event) => {
        const { chatId, messages } = event.payload;
        chatStore.handleMessagesUpdate(chatId, messages);
      },
    );

    await register<FileTransferRequestPayload>(
      "file-transfer-request",
      (event) => {
        fileTransferStore.handleTransferRequest(event.payload);
      },
    );

    await register<FileTransferDeniedPayload>(
      "file-transfer-denied",
      (event) => {
        fileTransferStore.handleTransferDenied(event.payload);
      },
    );

    await register<FileReceivedPayload>("file-received", (event) => {
      fileTransferStore.handleFileReceived(event.payload);
    });

    await register<FileTransferProgressPayload>(
      "file-transfer-progress",
      (event) => {
        fileTransferStore.handleTransferProgress(event.payload);
      },
    );

    await register<AepMessage>("new-message", (event) => {
      handleIncomingAepMessage({
        event,
        chatStore,
        friendStore,
        serverStore,
        collaborationStore,
        userStore,
      });
    });

    await register<MessageReadReceiptEvent>("message-read", (event) => {
      chatStore.handleReadReceipt(event.payload);
    });

    await register<TypingIndicatorEvent>("typing-indicator", (event) => {
      chatStore.handleTypingIndicator(event.payload);
    });

    return unlistenHandlers;
  };

  const initializeStores = async () => {
    const [serverResult, friendResult] = await Promise.allSettled([
      serverStore.initialize(),
      friendStore.initialize(),
    ] as const);

    if (serverResult.status === "rejected") {
      console.error(
        "Server store failed to initialize during post-auth bootstrap:",
        serverResult.reason,
      );
    }

    if (friendResult.status === "rejected") {
      console.error(
        "Friend store failed to initialize during post-auth bootstrap:",
        friendResult.reason,
      );
    }
  };

  return async () => {
    await initializeStores();
    await chatStore.loadGroupChats();
    restoreActiveSelections();
    return registerEventListeners();
  };
}

interface HandleAepMessageContext {
  event: { payload: AepMessage };
  chatStore: ChatStoreType;
  friendStore: FriendStoreType;
  serverStore: ServerStoreType;
  collaborationStore: CollaborationStoreType;
  userStore: UserStoreType;
}

function handleIncomingAepMessage({
  event,
  chatStore,
  friendStore,
  serverStore,
  collaborationStore,
  userStore,
}: HandleAepMessageContext) {
  const receivedMessage = event.payload;
  if (receivedMessage.PresenceUpdate) {
    const { user_id, is_online, status_message, location } =
      receivedMessage.PresenceUpdate;
    const normalizedStatusMessage = normalizeNullableText(status_message);
    const normalizedLocation = normalizeNullableText(location);
    friendStore.updateFriendPresence(user_id, {
      isOnline: is_online,
      statusMessage: normalizedStatusMessage,
      location: normalizedLocation,
    });
    serverStore.updateServerMemberPresence(user_id, {
      isOnline: is_online,
      statusMessage: normalizedStatusMessage,
      location: normalizedLocation,
    });
    const currentUser = get(userStore).me;
    if (currentUser?.id === user_id) {
      userStore.applyPresence({
        online: is_online,
        statusMessage: normalizedStatusMessage,
        location: normalizedLocation,
      });
    }
    return;
  }

  if (receivedMessage.CollaborationUpdate) {
    const payload = receivedMessage.CollaborationUpdate;
    const documentId = payload.document_id ?? payload.documentId ?? undefined;
    if (documentId && payload.update) {
      const kind =
        (payload.kind ?? "document") === "whiteboard"
          ? "whiteboard"
          : "document";
      const updateArray = normalizeUpdatePayload(payload.update);
      collaborationStore.receiveRemoteUpdate({
        documentId,
        update: updateArray,
        kind,
        senderId: payload.sender_id ?? payload.senderId,
        participants: payload.participants ?? [],
        timestamp: payload.timestamp,
      });
    }
    return;
  }

  if (receivedMessage.ChatMessage) {
    void chatStore.handleNewMessageEvent(receivedMessage.ChatMessage);
    return;
  }

  if (receivedMessage.EncryptedChatMessage) {
    handleEncryptedChatMessage(receivedMessage.EncryptedChatMessage, {
      chatStore,
      userStore,
    });
    return;
  }

  if (receivedMessage.EncryptedGroupMessage) {
    handleEncryptedGroupMessage(
      receivedMessage.EncryptedGroupMessage,
      chatStore,
    );
    return;
  }

  if (receivedMessage.MessageReaction) {
    chatStore.handleReactionUpdate(receivedMessage.MessageReaction);
    return;
  }

  if (receivedMessage.DeleteMessage) {
    chatStore.handleMessageDeleted(receivedMessage.DeleteMessage);
    return;
  }

  if (receivedMessage.EditMessage) {
    chatStore.handleMessageEdited(receivedMessage.EditMessage);
    return;
  }

  if (receivedMessage.LeaveGroupChat) {
    const leavePayload = receivedMessage.LeaveGroupChat;
    const groupId = leavePayload.group_id ?? leavePayload.groupId;
    const memberId = leavePayload.member_id ?? leavePayload.memberId;
    if (groupId && memberId) {
      chatStore.handleGroupMemberLeft(groupId, memberId);
    }
    return;
  }

  if (receivedMessage.AddGroupChatMembers) {
    const payload = receivedMessage.AddGroupChatMembers;
    const groupId = payload.group_id ?? payload.groupId;
    const memberIds = payload.member_ids ?? payload.memberIds ?? [];
    if (groupId && Array.isArray(memberIds) && memberIds.length) {
      chatStore.handleGroupMembersAdded(groupId, memberIds);
    }
    return;
  }

  if (receivedMessage.RemoveGroupChatMember) {
    const payload = receivedMessage.RemoveGroupChatMember;
    const groupId = payload.group_id ?? payload.groupId;
    const memberId = payload.member_id ?? payload.memberId;
    if (groupId && memberId) {
      chatStore.handleGroupMemberLeft(groupId, memberId);
    }
    return;
  }

  if (receivedMessage.CreateGroupChat) {
    const groupPayload = receivedMessage.CreateGroupChat;
    const groupId = groupPayload.group_id ?? groupPayload.groupId ?? undefined;
    if (groupId) {
      chatStore.handleGroupChatCreated({
        id: groupId,
        name: groupPayload.name ?? null,
        owner_id:
          groupPayload.creator_id ?? groupPayload.creatorId ?? undefined,
        created_at:
          groupPayload.created_at ?? groupPayload.createdAt ?? undefined,
        member_ids: groupPayload.member_ids ?? groupPayload.memberIds ?? [],
      });
    }
    return;
  }

  const currentUserId = get(userStore).me?.id;

  if (receivedMessage.FriendRequest && currentUserId) {
    const { sender_id, target_id } = receivedMessage.FriendRequest;
    if (sender_id === currentUserId || target_id === currentUserId) {
      const counterpartId = sender_id === currentUserId ? target_id : sender_id;
      if (counterpartId) {
        friendStore.addFriend({
          id: counterpartId,
          relationshipStatus: "pending",
          status: "Pending",
        });
      }
    }
    return;
  }

  if (receivedMessage.FriendRequestResponse && currentUserId) {
    const { sender_id, target_id, accepted } =
      receivedMessage.FriendRequestResponse;
    if (sender_id === currentUserId || target_id === currentUserId) {
      const counterpartId = sender_id === currentUserId ? target_id : sender_id;
      if (!counterpartId) {
        return;
      }
      if (accepted) {
        friendStore.addFriend({
          id: counterpartId,
          relationshipStatus: "accepted",
          status: "Offline",
        });
      } else {
        friendStore.removeFriend(counterpartId);
      }
    }
    return;
  }

  if (receivedMessage.BlockUser && currentUserId) {
    const { blocker_id, blocked_id } = receivedMessage.BlockUser;
    if (blocker_id === currentUserId) {
      friendStore.addFriend({
        id: blocked_id,
        relationshipStatus: "blocked",
        status: "Blocked",
      });
    } else if (blocked_id === currentUserId) {
      friendStore.removeFriend(blocker_id);
    }
    return;
  }

  if (receivedMessage.UnblockUser && currentUserId) {
    const { unblocker_id, unblocked_id } = receivedMessage.UnblockUser;
    if (unblocker_id === currentUserId) {
      friendStore.removeFriend(unblocked_id);
    } else if (unblocked_id === currentUserId) {
      friendStore.removeFriend(unblocker_id);
    }
    return;
  }

  if (receivedMessage.RemoveFriendship && currentUserId) {
    const { remover_id, removed_id } = receivedMessage.RemoveFriendship;
    if (remover_id === currentUserId) {
      friendStore.removeFriend(removed_id);
    } else if (removed_id === currentUserId) {
      friendStore.removeFriend(remover_id);
    }
    return;
  }

  if (receivedMessage.CreateServer) {
    serverStore.addServer(receivedMessage.CreateServer.server);
    return;
  }

  if (receivedMessage.DeleteServer) {
    serverStore.removeServer(receivedMessage.DeleteServer.server_id);
    return;
  }

  if (receivedMessage.CreateChannel) {
    const { channel } = receivedMessage.CreateChannel;
    if (channel?.server_id) {
      serverStore.addChannelToServer(channel.server_id, channel);
    }
    return;
  }

  if (receivedMessage.DeleteChannel) {
    const { channel_id } = receivedMessage.DeleteChannel;
    const serverState = get(serverStore);
    const hostingServer = serverState.servers.find((server) =>
      (server.channels ?? []).some((channel) => channel.id === channel_id),
    );
    if (hostingServer) {
      serverStore.removeChannelFromServer(hostingServer.id, channel_id);
    }
    return;
  }

  if (receivedMessage.JoinServer) {
    const { server_id, user_id } = receivedMessage.JoinServer;
    const currentUserIdValue = get(userStore).me?.id;
    if (currentUserIdValue && user_id === currentUserIdValue) {
      void serverStore.initialize();
    } else {
      void serverStore.fetchServerDetails(server_id);
    }
    return;
  }

  if (receivedMessage.SendServerInvite) {
    const { user_id } = receivedMessage.SendServerInvite;
    const currentUserIdValue = get(userStore).me?.id;
    if (currentUserIdValue && user_id === currentUserIdValue) {
      void serverStore.initialize();
    }
  }
}

function normalizeNullableText(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim?.() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeUpdatePayload(update: unknown): number[] {
  if (Array.isArray(update)) {
    return update;
  }
  if (update instanceof ArrayBuffer) {
    return Array.from(new Uint8Array(update));
  }
  if (update instanceof Uint8Array) {
    return Array.from(update);
  }
  return Array.from((update as number[]) ?? []);
}

function handleEncryptedChatMessage(
  payload: NonNullable<AepMessage["EncryptedChatMessage"]>,
  {
    chatStore,
    userStore,
  }: { chatStore: ChatStoreType; userStore: UserStoreType },
) {
  const meId = get(userStore).me?.id ?? null;
  const senderId = payload.sender ?? null;
  const recipientId = payload.recipient ?? null;
  let targetChatId: string | null = null;

  if (meId) {
    if (senderId === meId) {
      targetChatId = recipientId;
    } else if (recipientId === meId) {
      targetChatId = senderId;
    }
  }

  if (!targetChatId) {
    targetChatId = recipientId ?? senderId ?? null;
  }

  if (targetChatId) {
    void chatStore.refreshChatFromStorage(targetChatId, "dm");
  }
}

function handleEncryptedGroupMessage(
  payload: NonNullable<AepMessage["EncryptedGroupMessage"]>,
  chatStore: ChatStoreType,
) {
  const serverId = payload.server_id ?? null;
  const channelId = payload.channel_id ?? null;
  const targetId = serverId ?? channelId;
  if (targetId && channelId) {
    void chatStore.refreshChatFromStorage(targetId, "server", channelId);
  }
}
