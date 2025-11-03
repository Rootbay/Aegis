import { page } from "$app/stores";
import { onDestroy, onMount, untrack } from "svelte";
import { derived, get, writable, type Unsubscriber } from "svelte/store";
import { authStore } from "$lib/features/auth/stores/authStore";
import type { AuthState } from "$lib/features/auth/stores/authStore";
import { userStore } from "$lib/stores/userStore";
import { friendStore } from "$lib/features/friends/stores/friendStore";
import { serverStore } from "$lib/features/servers/stores/serverStore";
import {
  fileTransferStore,
  type FileTransferDeniedPayload,
  type FileTransferProgressPayload,
  type FileTransferRequestPayload,
  type FileReceivedPayload,
} from "$lib/features/chat/stores/fileTransferStore";
import { collaborationStore } from "$lib/features/collaboration/collabDocumentStore";
import {
  activeChannelId,
  activeChatId,
  activeChatType,
  activeServerChannelId,
  chatStore,
  groupChats,
  messagesByChatId,
  type MessageReadReceiptEvent,
  type TypingIndicatorEvent,
} from "$lib/features/chat/stores/chatStore";
import { directMessageRoster } from "$lib/features/chat/stores/directMessageRoster";
import { getListen } from "$services/tauri";
import type { AepMessage } from "$lib/features/chat/models/AepMessage";
import type { Friend } from "$lib/features/friends/models/Friend";
import type { Server } from "$lib/features/servers/models/Server";
import type { Message } from "$lib/features/chat/models/Message";
import type { User } from "$lib/features/auth/models/User";
import type { Chat } from "$lib/features/chat/models/Chat";
import { connectivityStore } from "$lib/stores/connectivityStore";
import { createModalManager } from "./app/modalManager";
import { createAppHandlers } from "./app/handlers";
import { createConnectivityBindings } from "./app/connectivity";
import { createPageState } from "./app/pageState";
import type { AppController } from "./app/types";

export type { AppController };
export type {
  AppModalType,
  AppHandlers,
  ModalState,
  PageState,
} from "./app/types";

export function createAppController(): AppController {
  const modalManager = createModalManager();
  const connectivity = createConnectivityBindings();
  const handlers = createAppHandlers(modalManager);

  const authState = writable<AuthState>(get(authStore));
  const currentUser = writable<User | null>(get(userStore).me ?? null);
  const postAuthInitialized = writable(false);
  let unlistenHandlers: Array<() => void> = [];

  const clearUnlistenHandlers = () => {
    for (const handler of unlistenHandlers) {
      try {
        handler();
      } catch (error) {
        console.error("Failed to detach event listener:", error);
      }
    }
    unlistenHandlers = [];
  };

  const bootstrapAfterAuthentication = async () => {
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

    clearUnlistenHandlers();

    await chatStore.loadGroupChats();

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

    const listen = await getListen();
    if (listen) {
      const unlistenFriends = await listen<{ payload: Friend[] }>(
        "friends-updated",
        (event) => {
          friendStore.handleFriendsUpdate(event.payload);
        },
      );

      const unlistenServers = await listen<{ payload: Server[] }>(
        "servers-updated",
        (event) => {
          serverStore.handleServersUpdate(event.payload);
        },
      );

      const unlistenMessages = await listen<{
        payload: { chatId: string; messages: Message[] };
      }>("messages-updated", (event) => {
        const { chatId: chatIdValue, messages } = event.payload;
        chatStore.handleMessagesUpdate(chatIdValue, messages);
      });

      const unlistenFileTransferRequest = await listen<{
        payload: FileTransferRequestPayload;
      }>("file-transfer-request", (event) => {
        fileTransferStore.handleTransferRequest(event.payload);
      });

      const unlistenFileTransferDenied = await listen<{
        payload: FileTransferDeniedPayload;
      }>("file-transfer-denied", (event) => {
        fileTransferStore.handleTransferDenied(event.payload);
      });

      const unlistenFileReceived = await listen<{
        payload: FileReceivedPayload;
      }>("file-received", (event) => {
        fileTransferStore.handleFileReceived(event.payload);
      });

      const unlistenFileTransferProgress = await listen<{
        payload: FileTransferProgressPayload;
      }>("file-transfer-progress", (event) => {
        fileTransferStore.handleTransferProgress(event.payload);
      });

      const unlistenPresence = await listen<{ payload: AepMessage }>(
        "new-message",
        (event) => {
          const receivedMessage: AepMessage = event.payload;
          if (receivedMessage.PresenceUpdate) {
            const { user_id, is_online, status_message, location } =
              receivedMessage.PresenceUpdate;
            const trimmedStatus = status_message?.trim?.() ?? "";
            const normalizedStatusMessage =
              trimmedStatus.length > 0 ? trimmedStatus : null;
            const trimmedLocation = location?.trim?.() ?? "";
            const normalizedLocation =
              trimmedLocation.length > 0 ? trimmedLocation : null;
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
            if (get(userStore).me?.id === user_id) {
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
            const documentId =
              payload.document_id ?? payload.documentId ?? undefined;
            if (documentId && payload.update) {
              const kind =
                (payload.kind ?? "document") === "whiteboard"
                  ? "whiteboard"
                  : "document";
              let updateArray: number[];
              if (Array.isArray(payload.update)) {
                updateArray = payload.update;
              } else if (payload.update instanceof ArrayBuffer) {
                updateArray = Array.from(new Uint8Array(payload.update));
              } else if (payload.update instanceof Uint8Array) {
                updateArray = Array.from(payload.update);
              } else {
                updateArray = Array.from(payload.update ?? []);
              }
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
            const payload = receivedMessage.EncryptedChatMessage;
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
            return;
          }

          if (receivedMessage.EncryptedGroupMessage) {
            const payload = receivedMessage.EncryptedGroupMessage;
            const serverId = payload.server_id ?? null;
            const channelId = payload.channel_id ?? null;
            const targetId = serverId ?? channelId;
            if (targetId && channelId) {
              void chatStore.refreshChatFromStorage(
                targetId,
                "server",
                channelId,
              );
            }
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
            const groupId =
              groupPayload.group_id ?? groupPayload.groupId ?? undefined;
            if (groupId) {
              chatStore.handleGroupChatCreated({
                id: groupId,
                name: groupPayload.name ?? null,
                owner_id:
                  groupPayload.creator_id ??
                  groupPayload.creatorId ??
                  undefined,
                created_at:
                  groupPayload.created_at ??
                  groupPayload.createdAt ??
                  undefined,
                member_ids:
                  groupPayload.member_ids ?? groupPayload.memberIds ?? [],
              });
            }
            return;
          }

          const currentUserId = get(userStore).me?.id;

          if (receivedMessage.FriendRequest && currentUserId) {
            const { sender_id, target_id } = receivedMessage.FriendRequest;
            if (sender_id === currentUserId || target_id === currentUserId) {
              const counterpartId =
                sender_id === currentUserId ? target_id : sender_id;
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
              const counterpartId =
                sender_id === currentUserId ? target_id : sender_id;
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
              (server.channels ?? []).some(
                (channel) => channel.id === channel_id,
              ),
            );
            if (hostingServer) {
              serverStore.removeChannelFromServer(hostingServer.id, channel_id);
            }
            return;
          }

          if (receivedMessage.JoinServer) {
            const { server_id, user_id } = receivedMessage.JoinServer;
            if (currentUserId && user_id === currentUserId) {
              void serverStore.initialize();
            } else {
              void serverStore.fetchServerDetails(server_id);
            }
            return;
          }

          if (receivedMessage.SendServerInvite && currentUserId) {
            const { user_id } = receivedMessage.SendServerInvite;
            if (user_id === currentUserId) {
              void serverStore.initialize();
            }
          }
        },
      );

      const unlistenReadReceipts = await listen<{
        payload: MessageReadReceiptEvent;
      }>("message-read", (event) => {
        chatStore.handleReadReceipt(event.payload);
      });

      const unlistenTypingIndicators = await listen<{
        payload: TypingIndicatorEvent;
      }>("typing-indicator", (event) => {
        chatStore.handleTypingIndicator(event.payload);
      });

      unlistenHandlers.push(
        unlistenFriends,
        unlistenServers,
        unlistenMessages,
        unlistenPresence,
        unlistenFileTransferRequest,
        unlistenFileTransferDenied,
        unlistenFileTransferProgress,
        unlistenFileReceived,
        unlistenReadReceipts,
        unlistenTypingIndicators,
      );
    }
  };

  const unsubscribeAuth = authStore.subscribe((value) => {
    authState.set(value);
  });

  const unsubscribeUser = userStore.subscribe((value) => {
    currentUser.set(value.me ?? null);
  });

  const unsubscribeAuthState: Unsubscriber = authState.subscribe((state) => {
    if (state.status !== "authenticated") {
      postAuthInitialized.set(false);
      clearUnlistenHandlers();
      chatStore.clearActiveChat();
      serverStore.setActiveServer(null);
      return;
    }

    if (!get(postAuthInitialized)) {
      postAuthInitialized.set(true);
      bootstrapAfterAuthentication().catch((error) =>
        console.error("Post-auth bootstrap failed:", error),
      );
    }
  });

  const unsubscribeActiveServer = serverStore.subscribe(($serverState) => {
    const serverId = $serverState.activeServerId;
    if (!serverId) {
      return;
    }
    const server = $serverState.servers.find((s) => s.id === serverId);
    if (!server || !server.channels || server.channels.length === 0) {
      return;
    }

    const generalChannel = server.channels.find(
      (channel) => channel.name === "general",
    );
    const targetChannelId = generalChannel
      ? generalChannel.id
      : server.channels[0].id;

    const chatType = get(activeChatType);
    const chatId = get(activeChatId);
    const selectedChannelId = get(activeServerChannelId);

    const hasValidChannel =
      Boolean(selectedChannelId) &&
      server.channels.some((channel) => channel.id === selectedChannelId);

    if (!hasValidChannel) {
      untrack(() => {
        chatStore.setActiveChat(server.id, "server", targetChannelId);
      });
      return;
    }

    const isServerChat = chatType === "server" && chatId === server.id;

    if (!isServerChat) {
      untrack(() => {
        chatStore.setActiveChat(server.id, "server");
      });
    }
  });

  onMount(() => {
    void connectivityStore.initialize();
    authStore.bootstrap();
  });

  onDestroy(() => {
    unsubscribeAuth();
    unsubscribeUser();
    unsubscribeAuthState();
    unsubscribeActiveServer();
    clearUnlistenHandlers();
    connectivityStore.teardown();
  });

  const allUsers = derived(friendStore, ($friendStore) => [
    ...$friendStore.friends,
  ]);

  const groupChatList = derived(groupChats, ($groupChats) =>
    Array.from($groupChats.values()),
  );

  const currentChat = derived(
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
    ]) => {
      if ($activeChatType === "dm") {
        const friend = $friendStore.friends.find((f) => f.id === $activeChatId);
        if (friend) {
          return {
            type: "dm",
            id: friend.id,
            friend,
            messages: $messagesByChatId.get(friend.id) || [],
          } as Chat;
        }
      } else if ($activeChatType === "group" && $activeChatId) {
        const summary = $groupChatsMap.get($activeChatId);
        if (summary) {
          const friendMap = new Map(
            $friendStore.friends.map((friend) => [friend.id, friend] as const),
          );
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
            if ($currentUser && memberId === $currentUser.id) {
              addMember($currentUser);
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
          return {
            type: "group",
            id: summary.id,
            name: summary.name,
            ownerId: summary.ownerId,
            memberIds: summary.memberIds,
            members,
            messages: $messagesByChatId.get(summary.id) || [],
          } as Chat;
        }
      } else if ($activeChatType === "server") {
        const server = $serverStore.servers.find((s) => s.id === $activeChatId);
        if (server && server.channels) {
          const channel = server.channels.find(
            (c) => c.id === $activeChannelId,
          );
          if (channel) {
            return {
              type: "channel",
              id: channel.id,
              name: channel.name,
              serverId: server.id,
              members: server.members,
              messages: $messagesByChatId.get(channel.id) || [],
            } as Chat;
          }
        }
      }

      return null;
    },
  );

  const isAnySettingsPage = derived(page, ($page) =>
    $page.url.pathname.includes("/settings"),
  );

  const isFriendsOrRootPage = derived(
    [page, serverStore, currentChat],
    ([$page, $serverStore, $currentChat]) =>
      ($page.url.pathname === "/" ||
        $page.url.pathname.startsWith("/friends")) &&
      !$serverStore.activeServerId &&
      !$currentChat,
  );

  const activeTab = derived(page, ($page) => {
    if ($page.url.pathname === "/friends/add") {
      return "AddFriend";
    }

    if ($page.url.pathname === "/friends" || $page.url.pathname === "/") {
      return $page.url.searchParams.get("tab") || "All";
    }

    return "All";
  });

  const { pageState } = createPageState({
    modalManager,
    allUsers,
    groupChats: groupChatList,
    currentChat,
    messages: messagesByChatId,
    activeTab,
  });

  return {
    authState,
    currentUser,
    currentChat,
    allUsers,
    groupChats: groupChatList,
    directMessages: directMessageRoster,
    isAnySettingsPage,
    isFriendsOrRootPage,
    activeTab,
    modal: modalManager.state,
    connectivity,
    pageState,
    handlers,
  };
}
